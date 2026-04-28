import os
import json
from pathlib import Path

def generate_search_index(docs_dir):
    """
    Generates a minified search index to make global search faster.
    Format: [ [id, title, channel, year, views, duration, desc_snippet], ... ]
    """
    v_path = os.path.join(docs_dir, "video_index.json")
    s_path = os.path.join(docs_dir, "sources_index.json")
    out_path = os.path.join(docs_dir, "search_index.json")
    
    print(f"Searching for Video/Source indices in {docs_dir}...")
    
    all_data = {}
    if os.path.exists(v_path):
        with open(v_path, encoding="utf-8") as f:
            all_data.update(json.load(f))
            
    if os.path.exists(s_path):
        with open(s_path, encoding="utf-8") as f:
            all_data.update(json.load(f))
            
    search_data = []
    for vid, info in all_data.items():
        # Title snippet (first 100 chars)
        desc = info.get('description') or ''
        desc_snippet = desc[:100] + ('...' if len(desc) > 100 else '')
        
        search_data.append([
            vid,
            info.get('title') or vid,
            info.get('channel_name') or 'Unknown',
            (info.get('publish_date') or '')[:4],
            info.get('view_count') or 0,
            info.get('duration') or '',
            desc_snippet
        ])
    
    # Sort by title for predictable loading
    search_data.sort(key=lambda x: x[1].lower())
    
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(search_data, f, separators=(',', ':'), ensure_ascii=False)
        
    print(f"Generated {out_path} with {len(search_data)} entries.")

if __name__ == "__main__":
    # If run as standalone, use the db folder in the project root
    PROJECT_ROOT = Path(__file__).resolve().parent.parent
    DB_DIR = PROJECT_ROOT / "db"
    generate_search_index(str(DB_DIR))
