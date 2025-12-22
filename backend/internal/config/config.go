package config

import (
	"os"
	"strings"
)

type Config struct {
	DatabaseURL   string
	JWTSecret     string
	ThumbDir      string
	IndexOther    bool
	ExtPhoto      map[string]struct{}
	ExtAudio      map[string]struct{}
	ExtVideo      map[string]struct{}
}

func parseCSVSet(v string) map[string]struct{} {
	out := map[string]struct{}{}
	for _, p := range strings.Split(v, ",") {
		p = strings.ToLower(strings.TrimSpace(p))
		if p == "" {
			continue
		}
		out[p] = struct{}{}
	}
	return out
}

func Load() Config {
	indexOther := strings.ToLower(strings.TrimSpace(os.Getenv("INDEX_OTHER"))) == "true"
	cfg := Config{
		DatabaseURL: os.Getenv("DATABASE_URL"),
		JWTSecret:   os.Getenv("JWT_SECRET"),
		ThumbDir:    os.Getenv("THUMB_DIR"),
		IndexOther:  indexOther,
		ExtPhoto:    parseCSVSet(os.Getenv("MEDIA_EXT_PHOTO")),
		ExtAudio:    parseCSVSet(os.Getenv("MEDIA_EXT_AUDIO")),
		ExtVideo:    parseCSVSet(os.Getenv("MEDIA_EXT_VIDEO")),
	}
	if cfg.ThumbDir == "" {
		cfg.ThumbDir = "/data/thumbs"
	}
	return cfg
}
