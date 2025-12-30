package scan

import (
	"context"
	"fmt"
	"io/fs"
	"path/filepath"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/example/mediahub/internal/config"
)

type Scanner struct {
	DB  *pgxpool.Pool
	Cfg config.Config
}

func New(db *pgxpool.Pool, cfg config.Config) *Scanner {
	return &Scanner{DB: db, Cfg: cfg}
}

func (s *Scanner) kindForExt(ext string) (string, bool) {
	ext = strings.TrimPrefix(strings.ToLower(ext), ".")
	if _, ok := s.Cfg.ExtPhoto[ext]; ok {
		return "photo", true
	}
	if _, ok := s.Cfg.ExtAudio[ext]; ok {
		return "audio", true
	}
	if _, ok := s.Cfg.ExtVideo[ext]; ok {
		return "video", true
	}
	if s.Cfg.IndexOther {
		return "other", true
	}
	return "", false
}

func (s *Scanner) ScanLibrary(ctx context.Context, libraryID int64) error {
	var roots []string
	err := s.DB.QueryRow(ctx, "select roots from library where id=$1", libraryID).Scan(&roots)
	if err != nil {
		return fmt.Errorf("library not found: %w", err)
	}

	startedAt := time.Now().UTC()

	var runID int64
	if err := s.DB.QueryRow(ctx, "insert into scan_run(library_id, started_at) values ($1,$2) returning id", libraryID, startedAt).Scan(&runID); err != nil {
		return err
	}

	// Walk roots
	for _, root := range roots {
		root = filepath.Clean(root)
		walkFn := func(path string, d fs.DirEntry, werr error) error {
			if werr != nil {
				return nil
			} // skip errors, keep scanning
			if d.IsDir() {
				return nil
			}

			kind, ok := s.kindForExt(filepath.Ext(path))
			if !ok {
				return nil
			}

			info, err := d.Info()
			if err != nil {
				return nil
			}

			rel := path
			if strings.HasPrefix(path, root) {
				rel = strings.TrimPrefix(path, root)
				rel = strings.TrimPrefix(rel, string(filepath.Separator))
			}

			size := info.Size()
			mtime := info.ModTime().UTC()

			// Upsert, update if changed
			// If size/mtime changed, schedule jobs (metadata/thumb).
			// xmax = 0 means INSERT (new), xmax <> 0 means UPDATE (existing)
			var itemID int64
			var isUpdate bool
			err = s.DB.QueryRow(ctx, `
				insert into media_item(library_id, path, rel_path, kind, present, size_bytes, mtime, last_seen_at, updated_at)
				values ($1,$2,$3,$4,true,$5,$6,$7,$7)
				on conflict (path) do update set
					library_id=excluded.library_id,
					rel_path=excluded.rel_path,
					kind=excluded.kind,
					present=true,
					missing_since=null,
					last_seen_at=excluded.last_seen_at,
					updated_at=excluded.updated_at,
					size_bytes=excluded.size_bytes,
					mtime=excluded.mtime
				returning id, (xmax <> 0) as is_update
			`, libraryID, path, rel, kind, size, mtime, startedAt).Scan(&itemID, &isUpdate)
			if err != nil {
				return nil
			}

			// For new items (insert) or changed items (update with different content)
			// Create thumb job for video and photo types
			if !isUpdate && (kind == "video" || kind == "photo") {
				// New item - create thumb job
				_, _ = s.DB.Exec(ctx, "insert into job(kind,item_id,run_at,attempts) values ('thumb',$1,NOW(),0) on conflict do nothing", itemID)
			} else if isUpdate {
				// Existing item that was updated - enqueue jobs (best-effort)
				_, _ = s.DB.Exec(ctx, "insert into job(kind,item_id) values ('metadata',$1) on conflict do nothing", itemID)
				_, _ = s.DB.Exec(ctx, "insert into job(kind,item_id) values ('thumb',$1) on conflict do nothing", itemID)
			}
			return nil
		}

		_ = filepath.WalkDir(root, walkFn)
	}

	// Mark missing any item not seen in this run
	_, err = s.DB.Exec(ctx, `
		update media_item
		set present=false,
		    missing_since=case when missing_since is null then $2 else missing_since end,
		    updated_at=$2
		where library_id=$1 and last_seen_at < $3 and present=true
	`, libraryID, time.Now().UTC(), startedAt)
	if err != nil {
		return err
	}

	_, _ = s.DB.Exec(ctx, "update scan_run set finished_at=$2 where id=$1", runID, time.Now().UTC())
	return nil
}
