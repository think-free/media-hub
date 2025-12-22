package main

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"golang.org/x/crypto/bcrypt"

	"github.com/example/mediahub/internal/api"
	"github.com/example/mediahub/internal/config"
	"github.com/example/mediahub/internal/db"
	"github.com/example/mediahub/internal/scan"
	"github.com/example/mediahub/internal/stream"
	"github.com/example/mediahub/internal/worker"
)

func main() {
	cfg := config.Load()
	ctx := context.Background()

	d, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer d.Close()

	if err := d.Migrate(ctx, "/app/migrations"); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	// Default admin user (dev)
	hash, _ := bcrypt.GenerateFromPassword([]byte("admin"), bcrypt.DefaultCost)
	if err := d.EnsureDefaultAdmin(ctx, "admin", string(hash)); err != nil {
		log.Fatalf("ensure admin: %v", err)
	}

	scanner := scan.New(d.Pool, cfg)
	streamer := stream.New(d.Pool)

	// Start thumbnail worker in background
	thumbWorker := worker.NewThumbWorker(d.Pool, cfg)
	go thumbWorker.Run(ctx)

	srv := &api.Server{
		DB:        d.Pool,
		JWTSecret: cfg.JWTSecret,
		Scanner:   scanner,
		Streamer:  streamer,
	}

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	// ✅ CORS must run BEFORE auth middleware so OPTIONS preflight is handled.
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" {
				w.Header().Set("Access-Control-Allow-Origin", origin)
			} else {
				w.Header().Set("Access-Control-Allow-Origin", "*")
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Allow-Credentials", "true")

			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	})

	// ✅ Auth after CORS (AuthMiddleware already exempts /healthz and /api/auth/login)
	r.Use(api.AuthMiddleware(cfg.JWTSecret))

	r.Mount("/", srv.Routes())

	httpSrv := &http.Server{
		Addr:              ":8080",
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
	}

	log.Printf("backend listening on %s", httpSrv.Addr)
	log.Fatal(httpSrv.ListenAndServe())
}
