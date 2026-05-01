import sqlite3
import json
import os
import sys

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_DIR = os.path.join(BASE_DIR, "scripts/db")
PUBLIC_DIR = os.path.join(BASE_DIR, "public")

# Split DB Paths
YTP_DB_PATH = os.path.join(PUBLIC_DIR, "ytp.db")
SOURCES_DB_PATH = os.path.join(PUBLIC_DIR, "sources.db")
YTPOOPERS_DB_PATH = os.path.join(PUBLIC_DIR, "ytpoopers.db")

# JSON Paths
VIDEO_INDEX_PATH = os.path.join(DB_DIR, "video_index.json")
CHANNELS_INDEX_PATH = os.path.join(DB_DIR, "ytpoopers_index.json")
SOURCES_INDEX_PATH = os.path.join(DB_DIR, "sources_index.json")
EXCLUDED_VIDEOS_PATH = os.path.join(DB_DIR, "excluded_videos.json")
PLAYLISTS_PATH = os.path.join(DB_DIR, "playlists.json")

def create_common_video_tables(cursor):
    """Creates tables used by both ytp.db and sources.db."""
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
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

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

def create_ytpoopers_schema(cursor):
    """Creates the schema for ytpoopers.db."""
    print("Creating ytpoopers schema...")
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

def create_ytp_schema(cursor):
    """Creates the schema for ytp.db."""
    print("Creating ytp schema...")
    create_common_video_tables(cursor)
    
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

def create_sources_schema(cursor):
    """Creates the schema for sources.db."""
    print("Creating sources schema...")
    create_common_video_tables(cursor)
    
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

def migrate_channels(cursor):
    """Migrates data from ytpoopers_index.json."""
    if not os.path.exists(CHANNELS_INDEX_PATH):
        print(f"Skipping channels: {CHANNELS_INDEX_PATH} not found.")
        return

    print("Migrating channels to ytpoopers.db...")
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

def migrate_video_data(cursor, json_path, label="videos"):
    """Generic migration for video data from a JSON file."""
    if not os.path.exists(json_path):
        print(f"Skipping {label}: {json_path} not found.")
        return

    print(f"Migrating {label} (this may take a moment)...")
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
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
            1 if label == "sources" or info.get('is_source') or (info.get('local_file') and info.get('local_file').startswith('sources/')) else 0
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

        # 4. Handle Sources (only if source_pages table exists in this DB)
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='source_pages'")
        if cursor.fetchone():
            for source_path in info.get('source_pages', []):
                if source_path:
                    source_id = get_or_create('source_pages', 'path', source_path, source_cache)
                    cursor.execute("INSERT OR IGNORE INTO video_sources (video_id, source_page_id) VALUES (?, ?)", (vid_id, source_id))

        count += 1
        if count % 1000 == 0:
            print(f"  Processed {count} {label}...")

def migrate_excluded(cursor):
    """Migrates data from excluded_videos.json to ytp.db."""
    if not os.path.exists(EXCLUDED_VIDEOS_PATH):
        return

    print("Migrating excluded videos...")
    with open(EXCLUDED_VIDEOS_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    for vid_id, info in data.items():
        reason = ""
        if isinstance(info, dict):
            reason = info.get('reason') or info.get('title') or "Excluded"
        else:
            reason = str(info)
            
        try:
            cursor.execute("INSERT OR REPLACE INTO excluded_videos (id, reason) VALUES (?, ?)", (vid_id, reason))
        except sqlite3.Error as e:
            print(f"  Error inserting excluded video {vid_id}: {e}")
            raise

def migrate_playlists(cursor):
    """Migrates data from playlists.json to ytp.db."""
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
    # 1. YT Poopers DB
    print(f"\n--- Migrating {YTPOOPERS_DB_PATH} ---")
    conn_poopers = sqlite3.connect(YTPOOPERS_DB_PATH)
    create_ytpoopers_schema(conn_poopers.cursor())
    migrate_channels(conn_poopers.cursor())
    conn_poopers.commit()
    conn_poopers.close()

    # 2. Sources DB
    print(f"\n--- Migrating {SOURCES_DB_PATH} ---")
    conn_sources = sqlite3.connect(SOURCES_DB_PATH)
    create_sources_schema(conn_sources.cursor())
    migrate_video_data(conn_sources.cursor(), SOURCES_INDEX_PATH, label="sources")
    conn_sources.commit()
    conn_sources.close()

    # 3. YTP DB
    print(f"\n--- Migrating {YTP_DB_PATH} ---")
    conn_ytp = sqlite3.connect(YTP_DB_PATH)
    create_ytp_schema(conn_ytp.cursor())
    migrate_video_data(conn_ytp.cursor(), VIDEO_INDEX_PATH, label="videos")
    migrate_excluded(conn_ytp.cursor())
    migrate_playlists(conn_ytp.cursor())
    conn_ytp.commit()
    conn_ytp.close()

    print("\nMigration completed successfully!")
    print(f"Databases saved to:\n  {YTPOOPERS_DB_PATH}\n  {SOURCES_DB_PATH}\n  {YTP_DB_PATH}")

if __name__ == "__main__":
    main()
