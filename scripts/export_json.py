import sqlite3
import json
import os

DB_PATH = 'public/museum.db'
EXPORT_DIR = 'public/db'

def export_to_json():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Export main video index
    print("Exporting video index...")
    cursor.execute("SELECT * FROM videos WHERE is_source = 0")
    videos = {row['id']: dict(row) for row in cursor.fetchall()}
    with open(os.path.join(EXPORT_DIR, 'video_index.json'), 'w', encoding='utf-8') as f:
        json.dump(videos, f, ensure_ascii=False, indent=2)

    # Export sources index
    print("Exporting sources index...")
    cursor.execute("SELECT * FROM videos WHERE is_source = 1")
    sources = {row['id']: dict(row) for row in cursor.fetchall()}
    with open(os.path.join(EXPORT_DIR, 'sources_index.json'), 'w', encoding='utf-8') as f:
        json.dump(sources, f, ensure_ascii=False, indent=2)

    # Export channels
    print("Exporting channels...")
    cursor.execute("SELECT * FROM channels")
    channels = {row['channel_name']: dict(row) for row in cursor.fetchall()}
    with open(os.path.join(EXPORT_DIR, 'ytpoopers_index.json'), 'w', encoding='utf-8') as f:
        json.dump(channels, f, ensure_ascii=False, indent=2)

    # Export individual video files (optional, can be very many)
    # For now, let's just do the main indices.

    conn.close()
    print("Export complete.")

if __name__ == '__main__':
    if not os.path.exists(EXPORT_DIR):
        os.makedirs(EXPORT_DIR)
    export_to_json()
