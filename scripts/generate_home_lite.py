import sqlite3
import json
import os
import sys

# Define database paths relative to project root
DB_MAP = {
    'ytp': 'public/db/ytp.db',
    'sources': 'public/db/other.db',
    'ytpmv': 'public/db/ytpmv.db',
    'collabs': 'public/db/collabs.db',
    'poopers': 'public/db/ytpoopers.db'
}

OUTPUT_FILE = 'public/db/home_lite.json'

def generate_lite():
    print("Generating home_lite.json for static hosting (GitHub Pages)...")
    all_vids = []
    
    for db_type, path in DB_MAP.items():
        if db_type == 'poopers': continue
        if not os.path.exists(path):
            # Try searching in current directory if not in public/db/
            alt_path = path.split('/')[-1]
            if os.path.exists(alt_path):
                path = alt_path
            else:
                print(f"Skipping {db_type} (not found at {path})")
                continue
            
        try:
            conn = sqlite3.connect(path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM videos WHERE (title IS NOT NULL AND title != '') ORDER BY RANDOM() LIMIT 24")
            vids = [dict(r) for r in cursor.fetchall()]
            for v in vids:
                v['db_source'] = db_type
            all_vids.extend(vids)
            conn.close()
            print(f"Added {len(vids)} videos from {db_type}")
        except Exception as e:
            print(f"Error reading {db_type}: {e}")

    channels = []
    try:
        p_path = DB_MAP['poopers']
        if not os.path.exists(p_path):
             alt_path = p_path.split('/')[-1]
             if os.path.exists(alt_path): p_path = alt_path
             
        if os.path.exists(p_path):
            conn = sqlite3.connect(p_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM channels LIMIT 500")
            channels = [dict(r) for r in cursor.fetchall()]
            conn.close()
            print(f"Added {len(channels)} channels for pooperMap")
    except Exception as e:
        print(f"Error reading poopers: {e}")

    data = {
        "success": True,
        "videos": all_vids,
        "channels": channels,
        "generated_at": os.popen('date').read().strip() if os.name != 'nt' else "unknown"
    }

    # Ensure output directory exists
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"Successfully generated {OUTPUT_FILE}")

if __name__ == "__main__":
    generate_lite()
