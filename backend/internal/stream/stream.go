package stream

import (
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Streamer struct {
	DB *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Streamer {
	return &Streamer{DB: db}
}

func (s *Streamer) StreamByID(w http.ResponseWriter, r *http.Request, id int64) {
	var path string
	var present bool
	err := s.DB.QueryRow(r.Context(), "select path, present from media_item where id=$1", id).Scan(&path, &present)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	if !present {
		http.NotFound(w, r)
		return
	}

	f, err := os.Open(path)
	if err != nil {
		// mark missing
		_, _ = s.DB.Exec(r.Context(),
			"update media_item set present=false, missing_since=coalesce(missing_since,$2), updated_at=$2 where id=$1",
			id, time.Now().UTC(),
		)
		http.NotFound(w, r)
		return
	}
	defer f.Close()

	fi, err := f.Stat()
	if err != nil {
		http.Error(w, "stat error", 500)
		return
	}

	// Content-Type: rely on browser sniffing or add a small map if needed
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Content-Length", strconv.FormatInt(fi.Size(), 10))

	// ServeContent supports Range requests
	http.ServeContent(w, r, filepath.Base(path), fi.ModTime(), f)
}
