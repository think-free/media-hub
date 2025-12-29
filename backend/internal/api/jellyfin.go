package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	_ "github.com/mattn/go-sqlite3"
)

// JellyfinImportResult represents the result of a Jellyfin import
type JellyfinImportResult struct {
	CollectionsImported int      `json:"collections_imported"`
	FavoritesImported   int      `json:"favorites_imported"`
	ItemsMatched        int      `json:"items_matched"`
	ItemsNotFound       int      `json:"items_not_found"`
	Errors              []string `json:"errors,omitempty"`
}

// JellyfinImportOptions specifies what to import
type JellyfinImportOptions struct {
	ImportCollections bool `json:"import_collections"`
	ImportFavorites   bool `json:"import_favorites"`
}

// jellyfinItem represents a media item from Jellyfin's TypedBaseItems table
type jellyfinItem struct {
	ID       string
	Path     string
	Name     string
	Type     string
	ParentID string
}

// jellyfinUserData represents user data from Jellyfin's UserDatas table
type jellyfinUserData struct {
	ItemID     string
	IsFavorite bool
}

// jellyfinCollection represents a collection (BoxSet) from Jellyfin
type jellyfinCollection struct {
	ID      string
	Name    string
	ItemIDs []string
}

// handleJellyfinImport handles the Jellyfin database import
func (s *Server) handleJellyfinImport(w http.ResponseWriter, r *http.Request) {
	uid, ok := UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", 401)
		return
	}

	libraryID, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if libraryID <= 0 {
		http.Error(w, "library_id required", 400)
		return
	}

	// Parse multipart form
	if err := r.ParseMultipartForm(100 << 20); err != nil { // 100MB max
		http.Error(w, "failed to parse form: "+err.Error(), 400)
		return
	}

	// Get the uploaded file
	file, _, err := r.FormFile("database")
	if err != nil {
		http.Error(w, "database file required", 400)
		return
	}
	defer file.Close()

	// Parse options
	var options JellyfinImportOptions
	optionsStr := r.FormValue("options")
	if optionsStr != "" {
		if err := json.Unmarshal([]byte(optionsStr), &options); err != nil {
			http.Error(w, "invalid options: "+err.Error(), 400)
			return
		}
	} else {
		// Default: import both
		options.ImportCollections = true
		options.ImportFavorites = true
	}

	// Save to temp file
	tmpFile, err := os.CreateTemp("", "jellyfin-*.db")
	if err != nil {
		http.Error(w, "failed to create temp file", 500)
		return
	}
	tmpPath := tmpFile.Name()
	defer os.Remove(tmpPath)

	if _, err := io.Copy(tmpFile, file); err != nil {
		tmpFile.Close()
		http.Error(w, "failed to save database", 500)
		return
	}
	tmpFile.Close()

	// Process the import
	result, err := s.processJellyfinImport(r.Context(), libraryID, uid, tmpPath, options)
	if err != nil {
		http.Error(w, "import failed: "+err.Error(), 500)
		return
	}

	writeJSON(w, 200, result)
}

// processJellyfinImport processes the Jellyfin database and imports data
func (s *Server) processJellyfinImport(ctx context.Context, libraryID, userID int64, dbPath string, options JellyfinImportOptions) (*JellyfinImportResult, error) {
	// Open SQLite database
	sqliteDB, err := sql.Open("sqlite3", dbPath+"?mode=ro")
	if err != nil {
		return nil, fmt.Errorf("failed to open jellyfin database: %w", err)
	}
	defer sqliteDB.Close()

	result := &JellyfinImportResult{}

	// Build a map of MediaHub items by path for matching
	mediaHubItems := make(map[string]int64) // path -> item_id
	rows, err := s.DB.Query(ctx,
		"SELECT id, path FROM media_item WHERE library_id = $1 AND present = true", libraryID)
	if err != nil {
		return nil, fmt.Errorf("failed to query media items: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var id int64
		var path string
		if err := rows.Scan(&id, &path); err != nil {
			continue
		}
		// Normalize path for matching
		normalizedPath := normalizePath(path)
		mediaHubItems[normalizedPath] = id
	}

	if len(mediaHubItems) == 0 {
		return nil, fmt.Errorf("no items found in library")
	}

	// Parse Jellyfin items
	jellyfinItems, err := parseJellyfinItems(sqliteDB)
	if err != nil {
		result.Errors = append(result.Errors, "Failed to parse items: "+err.Error())
	}

	// Build Jellyfin ID -> item map
	jellyfinIDToItem := make(map[string]*jellyfinItem)
	for i := range jellyfinItems {
		jellyfinIDToItem[jellyfinItems[i].ID] = &jellyfinItems[i]
	}

	// Import collections as tags
	if options.ImportCollections {
		collections, err := parseJellyfinCollections(sqliteDB, jellyfinItems)
		if err != nil {
			result.Errors = append(result.Errors, "Failed to parse collections: "+err.Error())
		} else {
			for _, coll := range collections {
				if coll.Name == "" || len(coll.ItemIDs) == 0 {
					continue
				}

				// Create tag for collection
				var tagID int64
				err := s.DB.QueryRow(ctx,
					"INSERT INTO tag (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id",
					coll.Name,
				).Scan(&tagID)
				if err != nil {
					result.Errors = append(result.Errors, fmt.Sprintf("Failed to create tag %s: %v", coll.Name, err))
					continue
				}

				tagItemsAdded := 0
				for _, jellyfinItemID := range coll.ItemIDs {
					// Find the Jellyfin item
					jItem := jellyfinIDToItem[jellyfinItemID]
					if jItem == nil || jItem.Path == "" {
						continue
					}

					// Match to MediaHub item by path
					normalizedPath := normalizePath(jItem.Path)
					mediaHubID, found := mediaHubItems[normalizedPath]
					if !found {
						result.ItemsNotFound++
						continue
					}

					// Add tag to item
					_, err := s.DB.Exec(ctx,
						"INSERT INTO item_tag (item_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
						mediaHubID, tagID,
					)
					if err == nil {
						tagItemsAdded++
						result.ItemsMatched++
					}
				}

				if tagItemsAdded > 0 {
					result.CollectionsImported++
					log.Printf("Imported collection '%s' with %d items", coll.Name, tagItemsAdded)
				}
			}
		}
	}

	// Import favorites
	if options.ImportFavorites {
		userDatas, err := parseJellyfinUserData(sqliteDB)
		if err != nil {
			result.Errors = append(result.Errors, "Failed to parse user data: "+err.Error())
		} else {
			for _, ud := range userDatas {
				if !ud.IsFavorite {
					continue
				}

				// Find the Jellyfin item
				jItem := jellyfinIDToItem[ud.ItemID]
				if jItem == nil || jItem.Path == "" {
					continue
				}

				// Match to MediaHub item by path
				normalizedPath := normalizePath(jItem.Path)
				mediaHubID, found := mediaHubItems[normalizedPath]
				if !found {
					result.ItemsNotFound++
					continue
				}

				// Add favorite
				_, err := s.DB.Exec(ctx,
					"INSERT INTO user_favorite (user_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
					userID, mediaHubID,
				)
				if err == nil {
					result.FavoritesImported++
					result.ItemsMatched++
				}
			}
		}
	}

	return result, nil
}

// parseJellyfinItems parses the TypedBaseItems table from Jellyfin
func parseJellyfinItems(db *sql.DB) ([]jellyfinItem, error) {
	// Jellyfin stores items in TypedBaseItems
	// The Path column contains the file path
	rows, err := db.Query(`
		SELECT 
			COALESCE(guid, ''), 
			COALESCE(Path, ''), 
			COALESCE(Name, ''),
			COALESCE(type, ''),
			COALESCE(ParentId, '')
		FROM TypedBaseItems
		WHERE Path IS NOT NULL AND Path != ''
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []jellyfinItem
	for rows.Next() {
		var item jellyfinItem
		if err := rows.Scan(&item.ID, &item.Path, &item.Name, &item.Type, &item.ParentID); err != nil {
			continue
		}
		items = append(items, item)
	}
	return items, nil
}

// parseJellyfinCollections parses BoxSet collections from Jellyfin
func parseJellyfinCollections(db *sql.DB, allItems []jellyfinItem) ([]jellyfinCollection, error) {
	// BoxSets are collection items in Jellyfin
	rows, err := db.Query(`
		SELECT 
			COALESCE(guid, ''), 
			COALESCE(Name, '')
		FROM TypedBaseItems
		WHERE type LIKE '%BoxSet%'
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var collections []jellyfinCollection
	for rows.Next() {
		var coll jellyfinCollection
		if err := rows.Scan(&coll.ID, &coll.Name); err != nil {
			continue
		}

		// Find items that belong to this collection
		// In Jellyfin, collection membership is stored in various ways
		// Try to find items with ParentId matching the collection ID
		for _, item := range allItems {
			if item.ParentID == coll.ID {
				coll.ItemIDs = append(coll.ItemIDs, item.ID)
			}
		}

		// Also try the CollectionItems table if it exists
		itemRows, err := db.Query(`
			SELECT COALESCE(ItemId, '')
			FROM CollectionItems
			WHERE CollectionId = ?
		`, coll.ID)
		if err == nil {
			for itemRows.Next() {
				var itemID string
				if itemRows.Scan(&itemID) == nil && itemID != "" {
					coll.ItemIDs = append(coll.ItemIDs, itemID)
				}
			}
			itemRows.Close()
		}

		if len(coll.ItemIDs) > 0 {
			collections = append(collections, coll)
		}
	}
	return collections, nil
}

// parseJellyfinUserData parses user data (favorites) from Jellyfin
func parseJellyfinUserData(db *sql.DB) ([]jellyfinUserData, error) {
	rows, err := db.Query(`
		SELECT 
			COALESCE(ItemId, ''),
			COALESCE(IsFavorite, 0)
		FROM UserDatas
		WHERE IsFavorite = 1
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var userData []jellyfinUserData
	for rows.Next() {
		var ud jellyfinUserData
		var isFav int
		if err := rows.Scan(&ud.ItemID, &isFav); err != nil {
			continue
		}
		ud.IsFavorite = isFav == 1
		if ud.IsFavorite {
			userData = append(userData, ud)
		}
	}
	return userData, nil
}

// normalizePath normalizes file paths for comparison
func normalizePath(path string) string {
	// Convert to forward slashes, lowercase, and clean
	path = filepath.ToSlash(path)
	path = strings.ToLower(path)
	path = filepath.Clean(path)
	return path
}
