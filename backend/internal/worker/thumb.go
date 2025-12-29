package worker

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/example/mediahub/internal/config"
)

const maxThumbAttempts = 5 // Maximum retry attempts before giving up

// ThumbWorker processes thumbnail generation jobs
type ThumbWorker struct {
	DB  *pgxpool.Pool
	Cfg config.Config
}

func NewThumbWorker(db *pgxpool.Pool, cfg config.Config) *ThumbWorker {
	return &ThumbWorker{DB: db, Cfg: cfg}
}

// Run starts the worker loop
func (w *ThumbWorker) Run(ctx context.Context) {
	log.Println("thumb worker started")

	// Ensure thumb directory exists
	if err := os.MkdirAll(w.Cfg.ThumbDir, 0755); err != nil {
		log.Printf("warning: could not create thumb dir: %v", err)
	}

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("thumb worker stopped")
			return
		case <-ticker.C:
			w.processJobs(ctx)
		}
	}
}

func (w *ThumbWorker) processJobs(ctx context.Context) {
	// Get pending thumb jobs
	rows, err := w.DB.Query(ctx, `
		SELECT j.id, j.item_id, mi.path, mi.kind, j.attempts
		FROM job j
		JOIN media_item mi ON mi.id = j.item_id
		WHERE j.kind = 'thumb' AND j.locked_at IS NULL
		ORDER BY j.run_at ASC
		LIMIT 10
	`)
	if err != nil {
		return
	}
	defer rows.Close()

	type thumbJob struct {
		jobID    int64
		itemID   int64
		path     string
		kind     string
		attempts int
	}

	var jobs []thumbJob
	for rows.Next() {
		var j thumbJob
		if err := rows.Scan(&j.jobID, &j.itemID, &j.path, &j.kind, &j.attempts); err != nil {
			continue
		}
		jobs = append(jobs, j)
	}

	for _, j := range jobs {
		// Lock the job
		_, err := w.DB.Exec(ctx, "UPDATE job SET locked_at = NOW() WHERE id = $1", j.jobID)
		if err != nil {
			continue
		}

		// Generate thumbnail
		thumbPath := filepath.Join(w.Cfg.ThumbDir, fmt.Sprintf("%d.jpg", j.itemID))
		err = w.generateThumbnail(j.path, thumbPath, j.kind)

		if err != nil {
			newAttempts := j.attempts + 1
			if newAttempts >= maxThumbAttempts {
				// Max attempts reached, delete the job to stop retrying
				log.Printf("thumb job %d permanently failed after %d attempts: %v", j.jobID, newAttempts, err)
				_, _ = w.DB.Exec(ctx, "DELETE FROM job WHERE id = $1", j.jobID)
			} else {
				log.Printf("thumb job %d failed (attempt %d/%d): %v", j.jobID, newAttempts, maxThumbAttempts, err)
				// Update job with error and schedule retry
				_, _ = w.DB.Exec(ctx, "UPDATE job SET locked_at = NULL, attempts = attempts + 1, last_error = $2 WHERE id = $1", j.jobID, err.Error())
			}
			continue
		}

		// Update media_item with thumb_path
		_, err = w.DB.Exec(ctx, "UPDATE media_item SET thumb_path = $2 WHERE id = $1", j.itemID, thumbPath)
		if err != nil {
			log.Printf("failed to update thumb_path for item %d: %v", j.itemID, err)
		}

		// Delete job
		_, _ = w.DB.Exec(ctx, "DELETE FROM job WHERE id = $1", j.jobID)
		log.Printf("generated thumbnail for item %d", j.itemID)
	}
}

func (w *ThumbWorker) generateThumbnail(srcPath, dstPath, kind string) error {
	// Check source exists
	if _, err := os.Stat(srcPath); os.IsNotExist(err) {
		return fmt.Errorf("source file does not exist: %s", srcPath)
	}

	if kind == "photo" {
		return w.generatePhotoThumb(srcPath, dstPath)
	} else if kind == "video" {
		return w.generateVideoThumb(srcPath, dstPath)
	}

	return fmt.Errorf("unsupported kind: %s", kind)
}

func (w *ThumbWorker) generatePhotoThumb(src, dst string) error {
	// Use ImageMagick convert
	// Resize to 320px wide, preserve aspect ratio, strip metadata
	cmd := exec.Command("convert", src, "-thumbnail", "320x320>", "-quality", "85", "-strip", dst)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("convert failed: %v, output: %s", err, strings.TrimSpace(string(output)))
	}
	return nil
}

func (w *ThumbWorker) generateVideoThumb(src, dst string) error {
	// First, get video duration using ffprobe
	duration := w.getVideoDuration(src)

	// Calculate seek time: 10% of duration, min 5s, max 120s
	seekTime := duration * 0.10
	if seekTime < 5 {
		seekTime = 5
	}
	if seekTime > 120 {
		seekTime = 120
	}
	// If video is shorter than seek time, use 25% of duration
	if seekTime > duration {
		seekTime = duration * 0.25
	}

	seekStr := fmt.Sprintf("%.2f", seekTime)

	// Use ffmpeg to extract frame
	cmd := exec.Command("ffmpeg",
		"-y",           // overwrite
		"-ss", seekStr, // seek to calculated time
		"-i", src,
		"-vframes", "1", // extract 1 frame
		"-vf", "scale=320:-1", // 320px wide
		"-q:v", "5", // quality
		dst,
	)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("ffmpeg failed: %v, output: %s", err, strings.TrimSpace(string(output)))
	}
	return nil
}

// getVideoDuration returns video duration in seconds using ffprobe
func (w *ThumbWorker) getVideoDuration(src string) float64 {
	cmd := exec.Command("ffprobe",
		"-v", "error",
		"-show_entries", "format=duration",
		"-of", "default=noprint_wrappers=1:nokey=1",
		src,
	)
	output, err := cmd.Output()
	if err != nil {
		return 30 // default to 30 seconds if can't get duration
	}

	var duration float64
	_, err = fmt.Sscanf(strings.TrimSpace(string(output)), "%f", &duration)
	if err != nil {
		return 30
	}
	return duration
}
