#!/usr/bin/env python3
"""
Import Jellyfin collections and favorites into MediaHub.

Usage:
    python import_jellyfin.py --jellyfin-db /path/to/library.db \
        --mediahub-host localhost --mediahub-port 5432 \
        --user-id 1

Requirements:
    pip install psycopg2-binary

The script will:
    1. Read collections from Jellyfin and create them as tags in MediaHub
    2. Tag media items that belong to each collection (matching by file path)
    3. Import favorites for the specified user
"""

import argparse
import os
import sqlite3
import sys

try:
    import psycopg2
except ImportError:
    print("Please install psycopg2: pip install psycopg2-binary")
    sys.exit(1)


def get_jellyfin_collections(jf_conn):
    """Get collections and their items from Jellyfin database."""
    cursor = jf_conn.cursor()
    
    # Get all collections (BoxSet type)
    cursor.execute("""
        SELECT Id, Name, Path
        FROM TypedBaseItems
        WHERE type = 'MediaBrowser.Controller.Entities.Movies.BoxSet'
           OR type LIKE '%BoxSet%'
    """)
    collections = cursor.fetchall()
    
    result = []
    for coll_id, name, path in collections:
        # Get items in this collection
        cursor.execute("""
            SELECT tbi.Path
            FROM TypedBaseItems tbi
            JOIN CollectionItems ci ON tbi.Id = ci.ItemId
            WHERE ci.CollectionId = ?
        """, (coll_id,))
        items = [row[0] for row in cursor.fetchall() if row[0]]
        
        if not items:
            # Try alternative: get items by parent
            cursor.execute("""
                SELECT Path FROM TypedBaseItems WHERE ParentId = ?
            """, (coll_id,))
            items = [row[0] for row in cursor.fetchall() if row[0]]
        
        result.append({
            'name': name,
            'items': items
        })
    
    return result


def get_jellyfin_favorites(jf_conn, username=None):
    """Get favorite items from Jellyfin database."""
    cursor = jf_conn.cursor()
    
    # Get favorites - stored in UserDatas table
    query = """
        SELECT tbi.Path
        FROM UserDatas ud
        JOIN TypedBaseItems tbi ON ud.ItemId = tbi.Id
        WHERE ud.IsFavorite = 1
    """
    
    if username:
        query = """
            SELECT tbi.Path
            FROM UserDatas ud
            JOIN TypedBaseItems tbi ON ud.ItemId = tbi.Id
            JOIN Users u ON ud.UserId = u.Id
            WHERE ud.IsFavorite = 1 AND u.Username = ?
        """
        cursor.execute(query, (username,))
    else:
        cursor.execute(query)
    
    return [row[0] for row in cursor.fetchall() if row[0]]


def import_to_mediahub(pg_conn, collections, favorites, user_id):
    """Import collections as tags and favorites into MediaHub."""
    cursor = pg_conn.cursor()
    
    stats = {
        'tags_created': 0,
        'items_tagged': 0,
        'favorites_imported': 0,
        'items_not_found': 0
    }
    
    # Import collections as tags
    for coll in collections:
        tag_name = coll['name']
        
        # Create or get tag
        cursor.execute("""
            INSERT INTO tag (name) VALUES (%s)
            ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
            RETURNING id
        """, (tag_name,))
        tag_id = cursor.fetchone()[0]
        stats['tags_created'] += 1
        
        # Tag items
        for item_path in coll['items']:
            # Find item by path (try full path and relative path)
            cursor.execute("""
                SELECT id FROM media_item 
                WHERE path = %s OR path LIKE %s
                LIMIT 1
            """, (item_path, '%' + os.path.basename(item_path)))
            
            result = cursor.fetchone()
            if result:
                item_id = result[0]
                cursor.execute("""
                    INSERT INTO item_tag (item_id, tag_id)
                    VALUES (%s, %s)
                    ON CONFLICT DO NOTHING
                """, (item_id, tag_id))
                stats['items_tagged'] += 1
            else:
                stats['items_not_found'] += 1
                print(f"  Item not found: {item_path}")
    
    # Import favorites
    for fav_path in favorites:
        cursor.execute("""
            SELECT id FROM media_item 
            WHERE path = %s OR path LIKE %s
            LIMIT 1
        """, (fav_path, '%' + os.path.basename(fav_path)))
        
        result = cursor.fetchone()
        if result:
            item_id = result[0]
            cursor.execute("""
                INSERT INTO user_favorite (user_id, item_id)
                VALUES (%s, %s)
                ON CONFLICT DO NOTHING
            """, (user_id, item_id))
            stats['favorites_imported'] += 1
        else:
            print(f"  Favorite not found: {fav_path}")
    
    pg_conn.commit()
    return stats


def main():
    parser = argparse.ArgumentParser(description='Import Jellyfin collections and favorites into MediaHub')
    parser.add_argument('--jellyfin-db', required=True, help='Path to Jellyfin library.db')
    parser.add_argument('--mediahub-host', default='localhost', help='MediaHub PostgreSQL host')
    parser.add_argument('--mediahub-port', default=5432, type=int, help='MediaHub PostgreSQL port')
    parser.add_argument('--mediahub-db', default='mediahub', help='MediaHub database name')
    parser.add_argument('--mediahub-user', default='postgres', help='MediaHub database user')
    parser.add_argument('--mediahub-password', default='postgres', help='MediaHub database password')
    parser.add_argument('--user-id', default=1, type=int, help='MediaHub user ID to import favorites for')
    parser.add_argument('--jellyfin-user', default=None, help='Jellyfin username to import favorites from (optional)')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be imported without making changes')
    
    args = parser.parse_args()
    
    # Connect to Jellyfin SQLite
    if not os.path.exists(args.jellyfin_db):
        print(f"Error: Jellyfin database not found: {args.jellyfin_db}")
        sys.exit(1)
    
    print(f"Connecting to Jellyfin database: {args.jellyfin_db}")
    jf_conn = sqlite3.connect(args.jellyfin_db)
    
    # Get collections
    print("Reading collections...")
    collections = get_jellyfin_collections(jf_conn)
    print(f"  Found {len(collections)} collections")
    for coll in collections:
        print(f"    - {coll['name']}: {len(coll['items'])} items")
    
    # Get favorites
    print("Reading favorites...")
    favorites = get_jellyfin_favorites(jf_conn, args.jellyfin_user)
    print(f"  Found {len(favorites)} favorites")
    
    jf_conn.close()
    
    if args.dry_run:
        print("\n[DRY RUN] No changes made.")
        return
    
    # Connect to MediaHub PostgreSQL
    print(f"\nConnecting to MediaHub database: {args.mediahub_host}:{args.mediahub_port}/{args.mediahub_db}")
    pg_conn = psycopg2.connect(
        host=args.mediahub_host,
        port=args.mediahub_port,
        database=args.mediahub_db,
        user=args.mediahub_user,
        password=args.mediahub_password
    )
    
    # Import
    print("Importing to MediaHub...")
    stats = import_to_mediahub(pg_conn, collections, favorites, args.user_id)
    
    pg_conn.close()
    
    print("\nDone!")
    print(f"  Tags created: {stats['tags_created']}")
    print(f"  Items tagged: {stats['items_tagged']}")
    print(f"  Favorites imported: {stats['favorites_imported']}")
    print(f"  Items not found: {stats['items_not_found']}")


if __name__ == '__main__':
    main()
