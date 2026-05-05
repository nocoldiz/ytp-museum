import sqlite3
import json
import sys
import os

YTP_DB = 'public/db/ytp.db'
SOURCES_DB = 'public/db/other.db'
POOPERS_DB = 'public/db/ytpoopers.db'
YTPMV_DB = 'public/db/ytpmv.db'
COLLABS_DB = 'public/db/collabs.db'
EXCLUDED_JSON = 'scripts/db/excluded_videos.json'

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

def move_db(video_ids, target_db):
    moved = []
    skipped = []
    
    for vid_id in video_ids:
        conn_old, db_old = find_video_db(vid_id)
        # Handle 'other' mapping to 'sources' in backend context if needed, but the UI might send 'other'
        t_db = target_db
        if t_db == 'other': t_db = 'sources'
        
        if not conn_old or db_old == t_db:
            if conn_old: conn_old.close()
            skipped.append(vid_id)
            continue
            
        # 1. Get data from old DB
        conn_old.row_factory = sqlite3.Row
        cursor_old = conn_old.cursor()
        cursor_old.execute("SELECT * FROM videos WHERE id = ?", (vid_id,))
        v_data = dict(cursor_old.fetchone())
        
        # Get tags
        cursor_old.execute("SELECT t.name FROM tags t JOIN video_tags vt ON t.id = vt.tag_id WHERE vt.video_id = ?", (vid_id,))
        tags = [r[0] for r in cursor_old.fetchall()]
        
        # 2. Insert into new DB
        conn_new = get_conn(t_db)
        cursor_new = conn_new.cursor()
        
        cols = ", ".join(v_data.keys())
        placeholders = ", ".join(["?"] * len(v_data))
        cursor_new.execute(f"INSERT OR REPLACE INTO videos ({cols}) VALUES ({placeholders})", tuple(v_data.values()))
        
        # Re-insert tags
        for tag_name in tags:
            cursor_new.execute("INSERT OR IGNORE INTO tags (name) VALUES (?)", (tag_name,))
            cursor_new.execute("SELECT id FROM tags WHERE name = ?", (tag_name,))
            tag_id = cursor_new.fetchone()[0]
            cursor_new.execute("INSERT OR IGNORE INTO video_tags (video_id, tag_id) VALUES (?, ?)", (vid_id, tag_id))
            
        conn_new.commit()
        conn_new.close()
        
        # 3. Remove from old DB
        cursor_old.execute("DELETE FROM videos WHERE id = ?", (vid_id,))
        cursor_old.execute("DELETE FROM video_tags WHERE video_id = ?", (vid_id,))
        conn_old.commit()
        conn_old.close()
        
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

def remove_channel(channel_url):
    deleted_videos_count = 0
    channel_removed = False
    
    # Get channel name for matching if needed
    channel_name = None
    p_conn = get_conn('poopers')
    p_cursor = p_conn.cursor()
    p_cursor.execute("SELECT channel_name FROM channels WHERE channel_url = ?", (channel_url,))
    row = p_cursor.fetchone()
    p_conn.close()
    if row:
        channel_name = row[0]

    # 1. Handle videos in sources (other.db) ONLY
    conn = get_conn('sources')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM videos WHERE channel_url = ?", (channel_url,))
    videos = [dict(r) for r in cursor.fetchall()]
    
    if not videos and channel_name:
        cursor.execute("SELECT * FROM videos WHERE channel_name = ?", (channel_name,))
        videos = [dict(r) for r in cursor.fetchall()]
    
    if videos:
        # Load existing excluded videos
        excluded_data = {}
        if os.path.exists(EXCLUDED_JSON):
            try:
                with open(EXCLUDED_JSON, 'r', encoding='utf-8') as f:
                    excluded_data = json.load(f)
            except: pass
            
        ytp_conn = get_conn('ytp')
        ytp_cursor = ytp_conn.cursor()
        
        for v in videos:
            vid_id = v['id']
            local_file = v.get('local_file')
            
            # Add to JSON
            excluded_data[vid_id] = {
                "url": v.get('url'),
                "title": v.get('title'),
                "description": v.get('description'),
                "channel_name": v.get('channel_name'),
                "channel_url": v.get('channel_url'),
                "publish_date": v.get('publish_date'),
                "view_count": v.get('view_count'),
                "like_count": v.get('like_count'),
                "language": v.get('language'),
                "status": "excluded",
                "local_file": None # We are deleting it
            }
            
            # Add to ytp.db excluded_videos table
            ytp_cursor.execute("INSERT OR IGNORE INTO excluded_videos (id, reason) VALUES (?, ?)", (vid_id, "Channel removed from Poopers"))
            
            # Delete local file
            if local_file:
                abs_path = os.path.join(os.getcwd(), local_file)
                if os.path.exists(abs_path):
                    try: os.remove(abs_path)
                    except: pass
            
            # Delete from sources DB
            cursor.execute("DELETE FROM videos WHERE id = ?", (vid_id,))
            cursor.execute("DELETE FROM video_tags WHERE video_id = ?", (vid_id,))
            deleted_videos_count += 1
            
        # Save JSON
        try:
            with open(EXCLUDED_JSON, 'w', encoding='utf-8') as f:
                json.dump(excluded_data, f, indent=2, ensure_ascii=False)
        except: pass
        
        ytp_conn.commit()
        ytp_conn.close()
        conn.commit()
        
    conn.close()
    
    # 2. Check if channel should be removed from ytpoopers.db
    # It should be removed ONLY if it has NO videos in ytp.db, ytpmv.db, collabs.db
    total_remaining = 0
    for db_type in ['ytp', 'ytpmv', 'collabs']:
        c = get_conn(db_type)
        cur = c.cursor()
        cur.execute("SELECT COUNT(*) FROM videos WHERE channel_url = ?", (channel_url,))
        count = cur.fetchone()[0]
        if count == 0 and channel_name:
            cur.execute("SELECT COUNT(*) FROM videos WHERE channel_name = ?", (channel_name,))
            count = cur.fetchone()[0]
        total_remaining += count
        c.close()
        
    if total_remaining == 0:
        p_conn = get_conn('poopers')
        p_cursor = p_conn.cursor()
        p_cursor.execute("DELETE FROM channels WHERE channel_url = ?", (channel_url,))
        p_conn.commit()
        p_conn.close()
        channel_removed = True
    
    return {
        "success": True, 
        "deletedVideosCount": deleted_videos_count,
        "channelRemovedFromPoopers": channel_removed,
        "remainingVideosInCollections": total_remaining
    }

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
        elif command == "move-db":
            print(json.dumps(move_db(args['videoIds'], args['targetDb'])))
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
        elif command == "remove-channel":
            print(json.dumps(remove_channel(args['channelUrl'])))
        else:
            print(json.dumps({"success": False, "error": f"Unknown command: {command}"}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
