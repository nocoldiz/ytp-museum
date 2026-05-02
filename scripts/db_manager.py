import sqlite3
import json
import sys
import os

YTP_DB = 'public/db/ytp.db'
SOURCES_DB = 'public/db/other.db'
POOPERS_DB = 'public/db/ytpoopers.db'
YTPMV_DB = 'public/db/ytpmv.db'
COLLABS_DB = 'public/db/collabs.db'

def get_conn(db_type='ytp'):
    path = YTP_DB
    if db_type == 'sources': path = SOURCES_DB
    elif db_type == 'poopers': path = POOPERS_DB
    elif db_type == 'ytpmv': path = YTPMV_DB
    elif db_type == 'collabs': path = COLLABS_DB
    return sqlite3.connect(path)

def find_video_db(vid_id):
    """Checks which DB contains the video and returns (conn, db_type)."""
    for db_type in ['ytp', 'sources', 'ytpmv', 'collabs']:
        conn = get_conn(db_type)
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM videos WHERE id = ?", (vid_id,))
        if cursor.fetchone():
            return conn, db_type
        conn.close()
    return None, None

def ban_videos(video_ids):
    deleted = []
    skipped = []
    
    for vid_id in video_ids:
        conn, db_type = find_video_db(vid_id)
        if not conn:
            skipped.append(vid_id)
            continue
            
        cursor = conn.cursor()
        cursor.execute("SELECT local_file FROM videos WHERE id = ?", (vid_id,))
        row = cursor.fetchone()
        
        local_file = row[0]
        if local_file:
            abs_path = os.path.join(os.getcwd(), local_file)
            if os.path.exists(abs_path):
                try:
                    os.remove(abs_path)
                except Exception as e:
                    print(f"Error removing {abs_path}: {e}", file=sys.stderr)
                    
        cursor.execute("UPDATE videos SET local_file = NULL WHERE id = ?", (vid_id,))
        deleted.append(vid_id)
        conn.commit()
        conn.close()
        
    return {"success": True, "results": {"deleted": deleted, "skipped": skipped}}

def flag_as_source(video_ids):
    moved = []
    skipped = []
    
    sources_dir = 'sources'
    if not os.path.exists(sources_dir):
        os.makedirs(sources_dir)
        
    for vid_id in video_ids:
        conn_ytp, db_type = find_video_db(vid_id)
        if not conn_ytp or db_type == 'sources':
            if conn_ytp: conn_ytp.close()
            skipped.append(vid_id)
            continue
            
        # 1. Get data from YTP DB
        conn_ytp.row_factory = sqlite3.Row
        cursor_ytp = conn_ytp.cursor()
        cursor_ytp.execute("SELECT * FROM videos WHERE id = ?", (vid_id,))
        v_data = dict(cursor_ytp.fetchone())
        
        # Get tags
        cursor_ytp.execute("SELECT t.name FROM tags t JOIN video_tags vt ON t.id = vt.tag_id WHERE vt.video_id = ?", (vid_id,))
        tags = [r[0] for r in cursor_ytp.fetchall()]
        
        # 2. Move local file if needed
        local_file = v_data['local_file']
        new_rel_path = local_file
        if local_file and not local_file.startswith('sources/'):
            old_path = os.path.join(os.getcwd(), local_file)
            file_name = os.path.basename(local_file)
            new_rel_path = f"sources/{file_name}"
            new_path = os.path.join(os.getcwd(), new_rel_path)
            if os.path.exists(old_path):
                try:
                    os.rename(old_path, new_path)
                except Exception as e:
                    print(f"Error moving {old_path}: {e}", file=sys.stderr)

        # 3. Insert into Sources DB
        conn_sources = get_conn('sources')
        cursor_sources = conn_sources.cursor()
        v_data['local_file'] = new_rel_path
        
        cols = ", ".join(v_data.keys())
        placeholders = ", ".join(["?"] * len(v_data))
        cursor_sources.execute(f"INSERT OR REPLACE INTO videos ({cols}) VALUES ({placeholders})", tuple(v_data.values()))
        
        # Re-insert tags in other.db
        for tag_name in tags:
            cursor_sources.execute("INSERT OR IGNORE INTO tags (name) VALUES (?)", (tag_name,))
            cursor_sources.execute("SELECT id FROM tags WHERE name = ?", (tag_name,))
            tag_id = cursor_sources.fetchone()[0]
            cursor_sources.execute("INSERT OR IGNORE INTO video_tags (video_id, tag_id) VALUES (?, ?)", (vid_id, tag_id))
            
        conn_sources.commit()
        conn_sources.close()
        
        # 4. Remove from YTP DB
        cursor_ytp.execute("DELETE FROM videos WHERE id = ?", (vid_id,))
        cursor_ytp.execute("DELETE FROM video_tags WHERE video_id = ?", (vid_id,))
        conn_ytp.commit()
        conn_ytp.close()
        
        moved.append(vid_id)
        
    return {"success": True, "results": {"moved": moved, "skipped": skipped}}

def import_videos(urls, target):
    db_type = 'sources' if target == 'sources' else 'ytp'
    conn = get_conn(db_type)
    cursor = conn.cursor()
    added = []
    skipped = []
    
    import re
    yt_regex = re.compile(r"(?:v=|vi/|shorts/|be/|embed/|watch\?v=|youtu\.be/)([a-zA-Z0-9_-]{11})")
    
    for url in urls:
        url = url.strip()
        if not url: continue
        
        match = yt_regex.search(url)
        if not match:
            skipped.append(url)
            continue
            
        vid_id = match.group(1)
        
        # Check if exists in EITHER db
        existing_conn, _ = find_video_db(vid_id)
        if existing_conn:
            existing_conn.close()
            skipped.append(url)
            continue
            
        cursor.execute("INSERT INTO videos (id, url) VALUES (?, ?)",
                       (vid_id, f"https://www.youtube.com/watch?v={vid_id}"))
        added.append(vid_id)
        
    conn.commit()
    conn.close()
    return {"success": True, "results": {"added": added, "skipped": skipped}}

def set_language(video_ids, language):
    updated = []
    skipped = []
    
    for vid_id in video_ids:
        conn, db_type = find_video_db(vid_id)
        if not conn:
            skipped.append(vid_id)
            continue
            
        cursor = conn.cursor()
        cursor.execute("UPDATE videos SET language = ? WHERE id = ?", (language, vid_id))
        if cursor.rowcount > 0:
            updated.append(vid_id)
        else:
            skipped.append(vid_id)
        conn.commit()
        conn.close()
            
    return {"success": True, "results": {"updated": updated, "skipped": skipped}}

def add_upload_metadata(id, title, channel_name, channel_url, publish_date, language, is_source, local_file, tags):
    db_type = 'sources' if is_source else 'ytp'
    conn = get_conn(db_type)
    cursor = conn.cursor()
    
    cursor.execute("""
        INSERT INTO videos (id, title, channel_name, channel_url, publish_date, language, local_file, view_count, like_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)
    """, (id, title, channel_name, channel_url, publish_date, language, local_file))
    
    for tag_name in tags:
        cursor.execute("INSERT OR IGNORE INTO tags (name) VALUES (?)", (tag_name,))
        cursor.execute("SELECT id FROM tags WHERE name = ?", (tag_name,))
        tag_id = cursor.fetchone()[0]
        cursor.execute("INSERT OR IGNORE INTO video_tags (video_id, tag_id) VALUES (?, ?)", (id, tag_id))
        
    conn.commit()
    conn.close()
    return {"success": True, "id": id}

def create_playlist(name, pl_id):
    conn = get_conn('ytp')
    cursor = conn.cursor()
    cursor.execute("INSERT INTO playlists (id, name) VALUES (?, ?)", (pl_id, name))
    conn.commit()
    conn.close()
    return {"success": True, "playlist": {"id": pl_id, "name": name, "videoIds": []}}

def add_videos_to_playlist(playlist_id, video_ids):
    conn = get_conn('ytp')
    cursor = conn.cursor()
    added = 0
    for vid_id in video_ids:
        cursor.execute("INSERT OR IGNORE INTO playlist_videos (playlist_id, video_id) VALUES (?, ?)", (playlist_id, vid_id))
        added += cursor.rowcount
    conn.commit()
    conn.close()
    return {"success": True, "addedCount": added}

def get_playlists():
    conn = get_conn('ytp')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM playlists")
    rows = cursor.fetchall()
    playlists = {}
    for row in rows:
        pl_id = row['id']
        cursor.execute("SELECT video_id FROM playlist_videos WHERE playlist_id = ?", (pl_id,))
        video_ids = [r[0] for r in cursor.fetchall()]
        d = dict(row)
        d['videoIds'] = video_ids
        playlists[pl_id] = d
    conn.close()
    return {"success": True, "playlists": playlists}

if __name__ == "__main__":
    try:
        command = sys.argv[1]
        args = json.loads(sys.argv[2])
        
        if command == "ban":
            print(json.dumps(ban_videos(args['videoIds'])))
        elif command == "flag-source":
            print(json.dumps(flag_as_source(args['videoIds'])))
        elif command == "import":
            print(json.dumps(import_videos(args['urls'], args['target'])))
        elif command == "set-lang":
            print(json.dumps(set_language(args['videoIds'], args['language'])))
        elif command == "upload":
            print(json.dumps(add_upload_metadata(
                args['id'], args['title'], args['channel_name'], args['channel_url'],
                args['publish_date'], args['language'], args['is_source'], 
                args['local_file'], args['tags']
            )))
        elif command == "create-playlist":
            print(json.dumps(create_playlist(args['name'], args['id'])))
        elif command == "add-to-playlist":
            print(json.dumps(add_videos_to_playlist(args['playlistId'], args['videoIds'])))
        elif command == "get-playlists":
            print(json.dumps(get_playlists()))
        else:
            print(json.dumps({"success": False, "error": f"Unknown command: {command}"}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
