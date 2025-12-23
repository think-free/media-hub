package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"github.com/example/mediahub/internal/scan"
	"github.com/example/mediahub/internal/stream"
)

type Server struct {
	DB        *pgxpool.Pool
	JWTSecret string
	Scanner   *scan.Scanner
	Streamer  *stream.Streamer
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func (s *Server) Routes() http.Handler {
	r := chi.NewRouter()
	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) })

	r.Post("/api/auth/login", s.handleLogin)
	r.Get("/api/libraries", s.handleLibraries)
	r.Post("/api/libraries", s.handleCreateLibrary)
	r.Delete("/api/libraries/{id}", s.handleDeleteLibrary)
	r.Post("/api/scan", s.handleScan)

	r.Get("/api/items", s.handleItems)
	r.Get("/api/items/{id}", s.handleItemByID)
	r.Get("/api/items/{id}/thumb", s.handleThumb)
	r.Get("/api/items/{id}/stream", s.handleStream)

	r.Get("/api/favorites", s.handleFavoritesList)
	r.Post("/api/favorites/{id}", s.handleFavoriteSet)
	r.Delete("/api/favorites/{id}", s.handleFavoriteUnset)

	r.Get("/api/tags", s.handleTagsList)
	r.Post("/api/tags", s.handleCreateTag)
	r.Delete("/api/tags/{id}", s.handleDeleteTag)
	r.Get("/api/tags/{id}/items", s.handleItemsByTag)
	r.Get("/api/items/{id}/tags", s.handleItemTags)
	r.Post("/api/items/{id}/tags/{tagId}", s.handleAddTagToItem)
	r.Delete("/api/items/{id}/tags/{tagId}", s.handleRemoveTagFromItem)
	r.Get("/api/folders", s.handleFolders)

	// User management
	r.Get("/api/users", s.handleUsersList)
	r.Post("/api/users", s.handleCreateUser)
	r.Delete("/api/users/{id}", s.handleDeleteUser)
	r.Put("/api/users/password", s.handleChangePassword)
	r.Get("/api/users/me", s.handleCurrentUser)

	// Home dashboard
	r.Get("/api/recent", s.handleRecentItems)
	r.Get("/api/history", s.handleHistory)
	r.Post("/api/history/{id}", s.handleRecordView)

	return r
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad json", 400)
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" || req.Password == "" {
		http.Error(w, "missing fields", 400)
		return
	}

	var userID int64
	var hash string
	err := s.DB.QueryRow(r.Context(), "select id, password_hash from app_user where username=$1", req.Username).Scan(&userID, &hash)
	if err != nil {
		http.Error(w, "invalid credentials", 401)
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)) != nil {
		http.Error(w, "invalid credentials", 401)
		return
	}

	tok, err := MakeJWT(s.JWTSecret, userID)
	if err != nil {
		http.Error(w, "token error", 500)
		return
	}
	writeJSON(w, 200, LoginResponse{Token: tok})
}

func (s *Server) handleLibraries(w http.ResponseWriter, r *http.Request) {
	rows, err := s.DB.Query(r.Context(), "select id, name, roots from library order by id asc")
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	defer rows.Close()

	out := []Library{}
	for rows.Next() {
		var l Library
		if err := rows.Scan(&l.ID, &l.Name, &l.Roots); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		out = append(out, l)
	}
	writeJSON(w, 200, out)
}

func (s *Server) handleCreateLibrary(w http.ResponseWriter, r *http.Request) {
	var req CreateLibraryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad json", 400)
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || len(req.Roots) == 0 {
		http.Error(w, "name and roots required", 400)
		return
	}

	var lib Library
	err := s.DB.QueryRow(r.Context(),
		"INSERT INTO library (name, roots) VALUES ($1, $2) RETURNING id, name, roots",
		req.Name, req.Roots,
	).Scan(&lib.ID, &lib.Name, &lib.Roots)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	writeJSON(w, 201, lib)
}

func (s *Server) handleDeleteLibrary(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if id <= 0 {
		http.Error(w, "bad id", 400)
		return
	}
	_, err := s.DB.Exec(r.Context(), "DELETE FROM library WHERE id=$1", id)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleScan(w http.ResponseWriter, r *http.Request) {
	lidStr := r.URL.Query().Get("library_id")
	lid, _ := strconv.ParseInt(lidStr, 10, 64)
	if lid <= 0 {
		http.Error(w, "library_id required", 400)
		return
	}

	// Run scan in background
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
		defer cancel()
		if err := s.Scanner.ScanLibrary(ctx, lid); err != nil {
			log.Printf("scan library %d error: %v", lid, err)
		} else {
			log.Printf("scan library %d completed", lid)
		}
	}()

	writeJSON(w, 200, map[string]any{"started": true})
}

func (s *Server) handleItems(w http.ResponseWriter, r *http.Request) {
	lid, _ := strconv.ParseInt(r.URL.Query().Get("library_id"), 10, 64)
	if lid <= 0 {
		http.Error(w, "library_id required", 400)
		return
	}
	kind := strings.TrimSpace(r.URL.Query().Get("kind")) // video/audio/photo/other or empty
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	sort := strings.TrimSpace(r.URL.Query().Get("sort")) // recent|name
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("pageSize"))
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 200 {
		pageSize = 50
	}

	where := []string{"library_id=$1"}
	args := []any{lid}
	argn := 2
	if kind != "" {
		where = append(where, fmt.Sprintf("kind=$%d", argn))
		args = append(args, kind)
		argn++
	}
	where = append(where, "present=true")

	if q != "" {
		where = append(where, fmt.Sprintf("fts @@ websearch_to_tsquery('simple', $%d)", argn))
		args = append(args, q)
		argn++
	}

	orderBy := "last_seen_at desc"
	if sort == "name" {
		orderBy = "rel_path asc"
	}

	whereSQL := strings.Join(where, " and ")

	var total int64
	if err := s.DB.QueryRow(r.Context(), "select count(*) from media_item where "+whereSQL, args...).Scan(&total); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	offset := (page - 1) * pageSize
	args = append(args, pageSize, offset)
	limitArg := argn
	offsetArg := argn + 1

	rows, err := s.DB.Query(r.Context(),
		fmt.Sprintf(`select id, library_id, rel_path, path, kind, present, size_bytes, mtime, last_seen_at, coalesce(thumb_path,'')
		           from media_item where %s order by %s limit $%d offset $%d`, whereSQL, orderBy, limitArg, offsetArg),
		args...,
	)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	defer rows.Close()

	items := []MediaItem{}
	for rows.Next() {
		var it MediaItem
		var mtime *time.Time
		var thumbPath string
		if err := rows.Scan(&it.ID, &it.LibraryID, &it.RelPath, &it.Path, &it.Kind, &it.Present, &it.SizeBytes, &mtime, &it.LastSeenAt, &thumbPath); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		it.MTime = mtime
		if thumbPath != "" {
			it.ThumbURL = fmt.Sprintf("/api/items/%d/thumb", it.ID)
		}
		items = append(items, it)
	}

	writeJSON(w, 200, PagedItems{Page: page, PageSize: pageSize, Total: total, Items: items})
}

func (s *Server) handleItemByID(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if id <= 0 {
		http.Error(w, "bad id", 400)
		return
	}
	var it MediaItem
	var mtime *time.Time
	var thumbPath string
	err := s.DB.QueryRow(r.Context(),
		`select id, library_id, rel_path, path, kind, present, size_bytes, mtime, last_seen_at, coalesce(thumb_path,'')
		 from media_item where id=$1`, id,
	).Scan(&it.ID, &it.LibraryID, &it.RelPath, &it.Path, &it.Kind, &it.Present, &it.SizeBytes, &mtime, &it.LastSeenAt, &thumbPath)
	if err != nil {
		http.Error(w, "not found", 404)
		return
	}
	it.MTime = mtime
	if thumbPath != "" {
		it.ThumbURL = fmt.Sprintf("/api/items/%d/thumb", it.ID)
	}
	writeJSON(w, 200, it)
}

func (s *Server) handleThumb(w http.ResponseWriter, r *http.Request) {
	// Placeholder: serve stored thumb_path if present.
	// Real implementation: generate via worker & store in THUMB_DIR.
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	var thumbPath string
	err := s.DB.QueryRow(r.Context(), "select coalesce(thumb_path,'') from media_item where id=$1", id).Scan(&thumbPath)
	if err != nil || thumbPath == "" {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, thumbPath)
}

func (s *Server) handleStream(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if id <= 0 {
		http.Error(w, "bad id", 400)
		return
	}
	s.Streamer.StreamByID(w, r, id)
}

func (s *Server) handleFavoritesList(w http.ResponseWriter, r *http.Request) {
	uid, ok := UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", 401)
		return
	}

	rows, err := s.DB.Query(r.Context(), `
		select mi.id, mi.library_id, mi.rel_path, mi.path, mi.kind, mi.present, mi.size_bytes, mi.mtime, mi.last_seen_at, coalesce(mi.thumb_path,'')
		from user_favorite uf
		join media_item mi on mi.id=uf.item_id
		where uf.user_id=$1
		order by uf.created_at desc
		limit 500`, uid)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	defer rows.Close()

	out := []MediaItem{}
	for rows.Next() {
		var it MediaItem
		var mtime *time.Time
		var thumb string
		if err := rows.Scan(&it.ID, &it.LibraryID, &it.RelPath, &it.Path, &it.Kind, &it.Present, &it.SizeBytes, &mtime, &it.LastSeenAt, &thumb); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		it.MTime = mtime
		if thumb != "" {
			it.ThumbURL = fmt.Sprintf("/api/items/%d/thumb", it.ID)
		}
		out = append(out, it)
	}
	writeJSON(w, 200, out)
}

func (s *Server) handleFavoriteSet(w http.ResponseWriter, r *http.Request) {
	uid, ok := UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", 401)
		return
	}
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if id <= 0 {
		http.Error(w, "bad id", 400)
		return
	}
	_, err := s.DB.Exec(r.Context(), "insert into user_favorite(user_id,item_id) values ($1,$2) on conflict do nothing", uid, id)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleFavoriteUnset(w http.ResponseWriter, r *http.Request) {
	uid, ok := UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", 401)
		return
	}
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if id <= 0 {
		http.Error(w, "bad id", 400)
		return
	}
	_, err := s.DB.Exec(r.Context(), "delete from user_favorite where user_id=$1 and item_id=$2", uid, id)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleTagsList(w http.ResponseWriter, r *http.Request) {
	type Tag struct {
		ID    int64  `json:"id"`
		Name  string `json:"name"`
		Count int64  `json:"count"`
	}
	rows, err := s.DB.Query(r.Context(), `
		select t.id, t.name, count(it.item_id) as c
		from tag t
		left join item_tag it on it.tag_id=t.id
		group by t.id, t.name
		order by c desc, t.name asc
		limit 5000`)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	defer rows.Close()

	out := []Tag{}
	for rows.Next() {
		var t Tag
		if err := rows.Scan(&t.ID, &t.Name, &t.Count); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		out = append(out, t)
	}
	writeJSON(w, 200, out)
}

func (s *Server) handleCreateTag(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad json", 400)
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		http.Error(w, "name required", 400)
		return
	}

	var id int64
	err := s.DB.QueryRow(r.Context(),
		"INSERT INTO tag (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id",
		req.Name,
	).Scan(&id)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	writeJSON(w, 201, map[string]any{"id": id, "name": req.Name})
}

func (s *Server) handleDeleteTag(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if id <= 0 {
		http.Error(w, "bad id", 400)
		return
	}
	_, err := s.DB.Exec(r.Context(), "DELETE FROM tag WHERE id=$1", id)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleItemTags(w http.ResponseWriter, r *http.Request) {
	itemID, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if itemID <= 0 {
		http.Error(w, "bad item id", 400)
		return
	}

	type Tag struct {
		ID   int64  `json:"id"`
		Name string `json:"name"`
	}

	rows, err := s.DB.Query(r.Context(), `
		SELECT t.id, t.name
		FROM tag t
		JOIN item_tag it ON it.tag_id = t.id
		WHERE it.item_id = $1
		ORDER BY t.name ASC
	`, itemID)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	defer rows.Close()

	out := []Tag{}
	for rows.Next() {
		var t Tag
		if err := rows.Scan(&t.ID, &t.Name); err != nil {
			continue
		}
		out = append(out, t)
	}
	writeJSON(w, 200, out)
}

func (s *Server) handleAddTagToItem(w http.ResponseWriter, r *http.Request) {
	itemID, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	tagID, _ := strconv.ParseInt(chi.URLParam(r, "tagId"), 10, 64)
	if itemID <= 0 || tagID <= 0 {
		http.Error(w, "bad ids", 400)
		return
	}

	_, err := s.DB.Exec(r.Context(),
		"INSERT INTO item_tag (item_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
		itemID, tagID,
	)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleRemoveTagFromItem(w http.ResponseWriter, r *http.Request) {
	itemID, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	tagID, _ := strconv.ParseInt(chi.URLParam(r, "tagId"), 10, 64)
	if itemID <= 0 || tagID <= 0 {
		http.Error(w, "bad ids", 400)
		return
	}

	_, err := s.DB.Exec(r.Context(),
		"DELETE FROM item_tag WHERE item_id = $1 AND tag_id = $2",
		itemID, tagID,
	)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	// Auto-delete tag if it has no more items
	_, _ = s.DB.Exec(r.Context(),
		"DELETE FROM tag WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM item_tag WHERE tag_id = $1)",
		tagID,
	)

	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleItemsByTag(w http.ResponseWriter, r *http.Request) {
	tagID, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if tagID <= 0 {
		http.Error(w, "bad tag id", 400)
		return
	}

	rows, err := s.DB.Query(r.Context(), `
		select mi.id, mi.library_id, mi.rel_path, mi.path, mi.kind, mi.present, mi.size_bytes, mi.mtime, mi.last_seen_at, coalesce(mi.thumb_path,'')
		from item_tag it
		join media_item mi on mi.id=it.item_id
		where it.tag_id=$1 and mi.present=true
		order by mi.rel_path asc
		limit 5000`, tagID)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	defer rows.Close()

	out := []MediaItem{}
	for rows.Next() {
		var it MediaItem
		var mtime *time.Time
		var thumb string
		if err := rows.Scan(&it.ID, &it.LibraryID, &it.RelPath, &it.Path, &it.Kind, &it.Present, &it.SizeBytes, &mtime, &it.LastSeenAt, &thumb); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		it.MTime = mtime
		if thumb != "" {
			it.ThumbURL = fmt.Sprintf("/api/items/%d/thumb", it.ID)
		}
		out = append(out, it)
	}
	writeJSON(w, 200, out)
}

func (s *Server) handleFolders(w http.ResponseWriter, r *http.Request) {
	lid, _ := strconv.ParseInt(r.URL.Query().Get("library_id"), 10, 64)
	if lid <= 0 {
		http.Error(w, "library_id required", 400)
		return
	}
	path := strings.TrimSpace(r.URL.Query().Get("path"))
	path = strings.Trim(path, "/")

	type FoldersResponse struct {
		Folders []string    `json:"folders"`
		Items   []MediaItem `json:"items"`
	}

	// Get all rel_paths for this library, then filter in Go
	rows, err := s.DB.Query(r.Context(), `
		SELECT id, library_id, rel_path, path, kind, present, size_bytes, mtime, last_seen_at, coalesce(thumb_path,'')
		FROM media_item
		WHERE library_id = $1 AND present = true
		ORDER BY rel_path ASC
	`, lid)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	defer rows.Close()

	folderSet := make(map[string]bool)
	var items []MediaItem

	for rows.Next() {
		var it MediaItem
		var mtime *time.Time
		var thumb string
		if err := rows.Scan(&it.ID, &it.LibraryID, &it.RelPath, &it.Path, &it.Kind, &it.Present, &it.SizeBytes, &mtime, &it.LastSeenAt, &thumb); err != nil {
			continue
		}
		it.MTime = mtime
		if thumb != "" {
			it.ThumbURL = fmt.Sprintf("/api/items/%d/thumb", it.ID)
		}

		// Check if this item is under the current path
		if path == "" {
			// At root level
			if strings.Contains(it.RelPath, "/") {
				// Has subdirectory - extract first folder
				parts := strings.SplitN(it.RelPath, "/", 2)
				folderSet[parts[0]] = true
			} else {
				// File at root level
				items = append(items, it)
			}
		} else {
			// In a subfolder
			prefix := path + "/"
			if strings.HasPrefix(it.RelPath, prefix) {
				rest := strings.TrimPrefix(it.RelPath, prefix)
				if strings.Contains(rest, "/") {
					// Has further subdirectory
					parts := strings.SplitN(rest, "/", 2)
					folderSet[parts[0]] = true
				} else {
					// File in this folder
					items = append(items, it)
				}
			}
		}
	}

	// Convert folder set to sorted slice
	folders := make([]string, 0, len(folderSet))
	for f := range folderSet {
		folders = append(folders, f)
	}
	// Sort folders
	for i := 0; i < len(folders); i++ {
		for j := i + 1; j < len(folders); j++ {
			if folders[i] > folders[j] {
				folders[i], folders[j] = folders[j], folders[i]
			}
		}
	}

	// Limit items to 500
	if len(items) > 500 {
		items = items[:500]
	}

	writeJSON(w, 200, FoldersResponse{Folders: folders, Items: items})
}

// User management handlers

func (s *Server) handleUsersList(w http.ResponseWriter, r *http.Request) {
	type User struct {
		ID        int64  `json:"id"`
		Username  string `json:"username"`
		CreatedAt string `json:"created_at"`
	}
	rows, err := s.DB.Query(r.Context(), "SELECT id, username, created_at FROM app_user ORDER BY id")
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		var createdAt time.Time
		if err := rows.Scan(&u.ID, &u.Username, &createdAt); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		u.CreatedAt = createdAt.Format(time.RFC3339)
		users = append(users, u)
	}
	writeJSON(w, 200, users)
}

func (s *Server) handleCreateUser(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad json", 400)
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" || req.Password == "" {
		http.Error(w, "username and password required", 400)
		return
	}
	if len(req.Password) < 4 {
		http.Error(w, "password too short (min 4)", 400)
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "hash error", 500)
		return
	}

	var id int64
	err = s.DB.QueryRow(r.Context(),
		"INSERT INTO app_user (username, password_hash, created_at) VALUES ($1, $2, $3) RETURNING id",
		req.Username, string(hash), time.Now().UTC(),
	).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			http.Error(w, "username already exists", 409)
			return
		}
		http.Error(w, err.Error(), 500)
		return
	}

	writeJSON(w, 201, map[string]any{"id": id, "username": req.Username})
}

func (s *Server) handleDeleteUser(w http.ResponseWriter, r *http.Request) {
	userID, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if userID <= 0 {
		http.Error(w, "bad id", 400)
		return
	}

	// Cannot delete if only 1 user left
	var count int64
	_ = s.DB.QueryRow(r.Context(), "SELECT COUNT(*) FROM app_user").Scan(&count)
	if count <= 1 {
		http.Error(w, "cannot delete last user", 400)
		return
	}

	_, err := s.DB.Exec(r.Context(), "DELETE FROM app_user WHERE id = $1", userID)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	// Check if user deleted themselves
	currentUserID, _ := UserIDFromContext(r.Context())
	isSelf := userID == currentUserID

	writeJSON(w, 200, map[string]any{"ok": true, "self_deleted": isSelf})
}

func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	userID, ok := UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", 401)
		return
	}

	var req struct {
		OldPassword string `json:"old_password"`
		NewPassword string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad json", 400)
		return
	}
	if req.NewPassword == "" {
		http.Error(w, "new password required", 400)
		return
	}
	if len(req.NewPassword) < 4 {
		http.Error(w, "password too short (min 4)", 400)
		return
	}

	// Verify old password
	var currentHash string
	err := s.DB.QueryRow(r.Context(), "SELECT password_hash FROM app_user WHERE id = $1", userID).Scan(&currentHash)
	if err != nil {
		http.Error(w, "user not found", 404)
		return
	}

	if bcrypt.CompareHashAndPassword([]byte(currentHash), []byte(req.OldPassword)) != nil {
		http.Error(w, "old password incorrect", 401)
		return
	}

	// Generate new hash
	newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "hash error", 500)
		return
	}

	_, err = s.DB.Exec(r.Context(), "UPDATE app_user SET password_hash = $2 WHERE id = $1", userID, string(newHash))
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleCurrentUser(w http.ResponseWriter, r *http.Request) {
	userID, ok := UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", 401)
		return
	}

	var username string
	err := s.DB.QueryRow(r.Context(), "SELECT username FROM app_user WHERE id = $1", userID).Scan(&username)
	if err != nil {
		http.Error(w, "user not found", 404)
		return
	}

	writeJSON(w, 200, map[string]any{"id": userID, "username": username})
}

// handleRecentItems returns recently added media items
func (s *Server) handleRecentItems(w http.ResponseWriter, r *http.Request) {
	limitStr := r.URL.Query().Get("limit")
	limit := 20
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}

	// Optional library filter
	libraryIDStr := r.URL.Query().Get("library_id")
	var libraryID *int64
	if libraryIDStr != "" {
		if id, err := strconv.ParseInt(libraryIDStr, 10, 64); err == nil {
			libraryID = &id
		}
	}

	var rows pgx.Rows
	var err error
	if libraryID != nil {
		rows, err = s.DB.Query(r.Context(), `
			SELECT id, library_id, path, rel_path, kind, size_bytes, duration_ms, width, height,
			       thumb_path IS NOT NULL as has_thumb, created_at
			FROM media_item
			WHERE present = true AND library_id = $1
			ORDER BY created_at DESC
			LIMIT $2`, *libraryID, limit)
	} else {
		rows, err = s.DB.Query(r.Context(), `
			SELECT id, library_id, path, rel_path, kind, size_bytes, duration_ms, width, height,
			       thumb_path IS NOT NULL as has_thumb, created_at
			FROM media_item
			WHERE present = true
			ORDER BY created_at DESC
			LIMIT $1`, limit)
	}
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	defer rows.Close()

	items := []map[string]any{}
	for rows.Next() {
		var (
			id, libID, size           int64
			path, relPath, kind       string
			durationMs, width, height *int
			hasThumb                  bool
			createdAt                 time.Time
		)
		if err := rows.Scan(&id, &libID, &path, &relPath, &kind, &size, &durationMs, &width, &height, &hasThumb, &createdAt); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		items = append(items, map[string]any{
			"id": id, "library_id": libID, "path": path, "rel_path": relPath,
			"kind": kind, "size_bytes": size, "duration_ms": durationMs,
			"width": width, "height": height, "thumb_url": hasThumb, "created_at": createdAt,
		})
	}
	writeJSON(w, 200, items)
}

// handleHistory returns recently viewed items for the current user
func (s *Server) handleHistory(w http.ResponseWriter, r *http.Request) {
	userID, ok := UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", 401)
		return
	}

	limitStr := r.URL.Query().Get("limit")
	limit := 20
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}

	// Optional library filter
	libraryIDStr := r.URL.Query().Get("library_id")
	var libraryID *int64
	if libraryIDStr != "" {
		if id, err := strconv.ParseInt(libraryIDStr, 10, 64); err == nil {
			libraryID = &id
		}
	}

	var rows pgx.Rows
	var err error
	if libraryID != nil {
		rows, err = s.DB.Query(r.Context(), `
			SELECT m.id, m.library_id, m.path, m.rel_path, m.kind, m.size_bytes,
			       m.duration_ms, m.width, m.height,
			       m.thumb_path IS NOT NULL as has_thumb, up.last_played_at
			FROM user_playback up
			JOIN media_item m ON m.id = up.item_id
			WHERE up.user_id = $1 AND m.present = true AND m.library_id = $2
			ORDER BY up.last_played_at DESC
			LIMIT $3`, userID, *libraryID, limit)
	} else {
		rows, err = s.DB.Query(r.Context(), `
			SELECT m.id, m.library_id, m.path, m.rel_path, m.kind, m.size_bytes,
			       m.duration_ms, m.width, m.height,
			       m.thumb_path IS NOT NULL as has_thumb, up.last_played_at
			FROM user_playback up
			JOIN media_item m ON m.id = up.item_id
			WHERE up.user_id = $1 AND m.present = true
			ORDER BY up.last_played_at DESC
			LIMIT $2`, userID, limit)
	}
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	defer rows.Close()

	items := []map[string]any{}
	for rows.Next() {
		var (
			id, libID, size           int64
			path, relPath, kind       string
			durationMs, width, height *int
			hasThumb                  bool
			lastPlayed                time.Time
		)
		if err := rows.Scan(&id, &libID, &path, &relPath, &kind, &size, &durationMs, &width, &height, &hasThumb, &lastPlayed); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		items = append(items, map[string]any{
			"id": id, "library_id": libID, "path": path, "rel_path": relPath,
			"kind": kind, "size_bytes": size, "duration_ms": durationMs,
			"width": width, "height": height, "thumb_url": hasThumb, "last_played_at": lastPlayed,
		})
	}
	writeJSON(w, 200, items)
}

// handleRecordView records that the user viewed an item
func (s *Server) handleRecordView(w http.ResponseWriter, r *http.Request) {
	userID, ok := UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", 401)
		return
	}

	itemID, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if itemID <= 0 {
		http.Error(w, "bad id", 400)
		return
	}

	// Upsert into user_playback
	_, err := s.DB.Exec(r.Context(), `
		INSERT INTO user_playback (user_id, item_id, position_ms, last_played_at)
		VALUES ($1, $2, 0, NOW())
		ON CONFLICT (user_id, item_id) DO UPDATE SET last_played_at = NOW()`,
		userID, itemID)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}
