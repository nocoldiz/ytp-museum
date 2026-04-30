import sqlite3
import json
import os
import sys

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_DIR = os.path.join(BASE_DIR, "scripts/db")
PUBLIC_DIR = os.path.join(BASE_DIR, "public")

SQLITE_PATH = os.path.join(PUBLIC_DIR, "museum.db")

# JSON Paths
VIDEO_INDEX_PATH = os.path.join(DB_DIR, "video_index.json")
CHANNELS_INDEX_PATH = os.path.join(DB_DIR, "ytpoopers_index.json")
SOURCES_INDEX_PATH = os.path.join(DB_DIR, "sources_index.json")
EXCLUDED_VIDEOS_PATH = os.path.join(DB_DIR, "excluded_videos.json")
PLAYLISTS_PATH = os.path.join(DB_DIR, "playlists.json")

def create_schema(cursor):
    """Creates the SQLite schema."""
    print("Creating schema...")
    
    # Core tables
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS channels (
        channel_url TEXT PRIMARY KEY,
        channel_name TEXT NOT NULL,
        thumbnail TEXT,
        description TEXT,
        subscriber_count INTEGER,
        creation_date TEXT,
        aliases TEXT -- JSON string of list
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS videos (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        title TEXT,
        description TEXT,
        channel_url TEXT,
        publish_date TEXT,
        view_count INTEGER DEFAULT 0,
        like_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        local_file TEXT,
        language TEXT,
        channel_name TEXT,
        is_source INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (channel_url) REFERENCES channels(url)
    )
    """)

    # Many-to-Many / Lists
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS video_tags (
        video_id TEXT,
        tag_id INTEGER,
        PRIMARY KEY (video_id, tag_id),
        FOREIGN KEY (video_id) REFERENCES videos(id),
        FOREIGN KEY (tag_id) REFERENCES tags(id)
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS video_sections (
        video_id TEXT,
        section_id INTEGER,
        PRIMARY KEY (video_id, section_id),
        FOREIGN KEY (video_id) REFERENCES videos(id),
        FOREIGN KEY (section_id) REFERENCES sections(id)
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS source_pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT UNIQUE NOT NULL
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS video_sources (
        video_id TEXT,
        source_page_id INTEGER,
        PRIMARY KEY (video_id, source_page_id),
        FOREIGN KEY (video_id) REFERENCES videos(id),
        FOREIGN KEY (source_page_id) REFERENCES source_pages(id)
    )
    """)

    # Playlists
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS playlists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS playlist_videos (
        playlist_id TEXT,
        video_id TEXT,
        position INTEGER,
        PRIMARY KEY (playlist_id, video_id),
        FOREIGN KEY (playlist_id) REFERENCES playlists(id),
        FOREIGN KEY (video_id) REFERENCES videos(id)
    )
    """)

    # Excluded Videos
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS excluded_videos (
        id TEXT PRIMARY KEY,
        reason TEXT,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

def migrate_channels(cursor):
    """Migrates data from ytpoopers_index.json."""
    if not os.path.exists(CHANNELS_INDEX_PATH):
        print(f"Skipping channels: {CHANNELS_INDEX_PATH} not found.")
        return

    print("Migrating channels...")
    with open(CHANNELS_INDEX_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    for url, info in data.items():
        name = info.get('channel_name') or url
        try:
            cursor.execute("""
                INSERT OR REPLACE INTO channels 
                (channel_url, channel_name, thumbnail, description, subscriber_count, creation_date, aliases)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                url,
                name,
                info.get('thumbnail'),
                info.get('description'),
                info.get('subscriber_count'),
                info.get('creation_date'),
                json.dumps(info.get('alias', []))
            ))
        except sqlite3.Error as e:
            print(f"  Error inserting channel {url}: {e}")
            raise

def migrate_videos(cursor):
    """Migrates data from video_index.json."""
    if not os.path.exists(VIDEO_INDEX_PATH):
        print(f"Skipping videos: {VIDEO_INDEX_PATH} not found.")
        return

    print("Migrating videos (this may take a moment)...")
    with open(VIDEO_INDEX_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    source_data = {}
    if os.path.exists(SOURCES_INDEX_PATH):
        print("Loading sources index...")
        with open(SOURCES_INDEX_PATH, 'r', encoding='utf-8') as f:
            source_data = json.load(f)
        data.update(source_data)

    # Cache for IDs to avoid redundant lookups
    tag_cache = {}
    section_cache = {}
    source_cache = {}

    def get_or_create(table, column, value, cache):
        if value in cache:
            return cache[value]
        cursor.execute(f"INSERT OR IGNORE INTO {table} ({column}) VALUES (?)", (value,))
        cursor.execute(f"SELECT id FROM {table} WHERE {column} = ?", (value,))
        idx = cursor.fetchone()[0]
        cache[value] = idx
        return idx

    count = 0
    for vid_id, info in data.items():
        # 1. Insert Video
        cursor.execute("""
            INSERT OR REPLACE INTO videos 
            (id, url, title, description, channel_url, publish_date, view_count, like_count, status, local_file, language, channel_name, is_source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            vid_id,
            info.get('url', f"https://www.youtube.com/watch?v={vid_id}"),
            info.get('title'),
            info.get('description'),
            info.get('channel_url'),
            info.get('publish_date'),
            info.get('view_count', 0),
            info.get('like_count', 0),
            info.get('status', 'pending'),
            info.get('local_file'),
            info.get('language'),
            info.get('channel_name') or info.get('nickname'),
            1 if vid_id in source_data or info.get('is_source') or (info.get('local_file') and info.get('local_file').startswith('sources/')) else 0
        ))

        # 2. Handle Tags
        for tag_name in info.get('tags', []):
            if tag_name:
                tag_id = get_or_create('tags', 'name', tag_name, tag_cache)
                cursor.execute("INSERT OR IGNORE INTO video_tags (video_id, tag_id) VALUES (?, ?)", (vid_id, tag_id))

        # 3. Handle Sections
        for section_name in info.get('sections', []):
            if section_name:
                section_id = get_or_create('sections', 'name', section_name, section_cache)
                cursor.execute("INSERT OR IGNORE INTO video_sections (video_id, section_id) VALUES (?, ?)", (vid_id, section_id))

        # 4. Handle Sources
        for source_path in info.get('source_pages', []):
            if source_path:
                source_id = get_or_create('source_pages', 'path', source_path, source_cache)
                cursor.execute("INSERT OR IGNORE INTO video_sources (video_id, source_page_id) VALUES (?, ?)", (vid_id, source_id))

        count += 1
        if count % 1000 == 0:
            print(f"  Processed {count} videos...")

def migrate_excluded(cursor):
    """Migrates data from excluded_videos.json."""
    if not os.path.exists(EXCLUDED_VIDEOS_PATH):
        return

    print("Migrating excluded videos...")
    with open(EXCLUDED_VIDEOS_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    for vid_id, info in data.items():
        reason = ""
        if isinstance(info, dict):
            # If it's a full metadata object, we might want to store it or a summary
            reason = info.get('reason') or info.get('title') or "Excluded"
        else:
            reason = str(info)
            
        try:
            cursor.execute("INSERT OR REPLACE INTO excluded_videos (id, reason) VALUES (?, ?)", (vid_id, reason))
        except sqlite3.Error as e:
            print(f"  Error inserting excluded video {vid_id}: {e}")
            raise

def migrate_playlists(cursor):
    """Migrates data from playlists.json."""
    if not os.path.exists(PLAYLISTS_PATH):
        return

    print("Migrating playlists...")
    with open(PLAYLISTS_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    for pl_id, info in data.items():
        cursor.execute("INSERT OR REPLACE INTO playlists (id, name, created_at) VALUES (?, ?, ?)", 
                       (pl_id, info.get('name'), info.get('created_at')))
        
        for i, vid_id in enumerate(info.get('videoIds', [])):
            cursor.execute("INSERT OR REPLACE INTO playlist_videos (playlist_id, video_id, position) VALUES (?, ?, ?)",
                           (pl_id, vid_id, i))

def main():
    if os.path.exists(SQLITE_PATH):
        print(f"Warning: {SQLITE_PATH} already exists. It will be updated.")
    
    conn = sqlite3.connect(SQLITE_PATH)
    cursor = conn.cursor()
    
    try:
        create_schema(cursor)
        migrate_channels(cursor)
        migrate_videos(cursor)
        migrate_excluded(cursor)
        migrate_playlists(cursor)
        
        conn.commit()
        print("\nMigration completed successfully!")
        print(f"Database saved to: {SQLITE_PATH}")
        
    except Exception as e:
        conn.rollback()
        print(f"\nError during migration: {e}")
        sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    main()
