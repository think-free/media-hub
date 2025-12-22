package api

import "time"

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Token string `json:"token"`
}

type Library struct {
	ID    int64    `json:"id"`
	Name  string   `json:"name"`
	Roots []string `json:"roots"`
}

type CreateLibraryRequest struct {
	Name  string   `json:"name"`
	Roots []string `json:"roots"`
}

type MediaItem struct {
	ID         int64      `json:"id"`
	LibraryID  int64      `json:"library_id"`
	RelPath    string     `json:"rel_path"`
	Path       string     `json:"path"`
	Kind       string     `json:"kind"`
	Present    bool       `json:"present"`
	SizeBytes  int64      `json:"size_bytes"`
	MTime      *time.Time `json:"mtime,omitempty"`
	LastSeenAt time.Time  `json:"last_seen_at"`
	ThumbURL   string     `json:"thumb_url,omitempty"`
}

type PagedItems struct {
	Page     int         `json:"page"`
	PageSize int         `json:"page_size"`
	Total    int64       `json:"total"`
	Items    []MediaItem `json:"items"`
}
