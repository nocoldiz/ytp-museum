import os
import json
import shutil
import re

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCES_INDEX_PATH = os.path.join(BASE_DIR, 'docs', 'sources_index.json')
VIDEO_INDEX_PATH = os.path.join(BASE_DIR, 'docs', 'video_index.json')
VIDEOS_DIR = os.path.join(BASE_DIR, 'videos')
SOURCES_DIR = os.path.join(BASE_DIR, 'sources')

def load_json(path):
    if not os.path.exists(path):
        print(f"Warning: {path} not found.")
        return {}
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def extract_video_id(filename):
    # Regex to match YouTube ID (11 chars) at the end of the filename
    # Matches patterns like: "title [ID].mp4", "title - ID.jpg", "ID.mp4"
    patterns = [
        r'\[([a-zA-Z0-9_-]{11})\]\.[^.]+$',  # [ID].ext
        r' - ([a-zA-Z0-9_-]{11})\.[^.]+$',   # - ID.ext
        r'([a-zA-Z0-9_-]{11})\.[^.]+$'        # ID.ext (fallback)
    ]
    
    for pattern in patterns:
        match = re.search(pattern, filename)
        if match:
            return match.group(1)
    return None

def main():
    print("Loading indices...")
    sources_index = load_json(SOURCES_INDEX_PATH)
    video_index = load_json(VIDEO_INDEX_PATH)
    
    if not os.path.exists(SOURCES_DIR):
        os.makedirs(SOURCES_DIR)
        
    print(f"Scanning {VIDEOS_DIR} recursively...")
    
    # Collect all files first to avoid issues if moving files while walking
    all_files = []
    for root, dirs, files in os.walk(VIDEOS_DIR):
        # Skip the sources directory if it happens to be inside videos (unlikely given BASE_DIR logic but safe)
        if os.path.abspath(root) == os.path.abspath(SOURCES_DIR):
            continue
            
        for filename in files:
            all_files.append((root, filename))
    
    moved_count = 0
    skipped_count = 0
    
    for root, filename in all_files:
        video_id = extract_video_id(filename)
        
        if not video_id:
            # Only print warning if it's not a common system file
            if not filename.startswith('.'):
                print(f"Could not identify ID for: {filename}")
            skipped_count += 1
            continue
            
        src_path = os.path.join(root, filename)
        
        # Determine destination
        if video_id in sources_index:
            dest_dir = SOURCES_DIR
        else:
            video_data = video_index.get(video_id)
            author = "Unknown Channel"
            if video_data and 'channel_name' in video_data:
                author = video_data['channel_name']
            
            author_folder = "".join([c for c in author if c.isalnum() or c in (' ', '.', '_', '-')]).strip()
            if not author_folder:
                author_folder = "Unknown Channel"
                
            dest_dir = os.path.join(VIDEOS_DIR, author_folder)
            
        # Check if file is already at destination
        if os.path.abspath(src_path) == os.path.abspath(os.path.join(dest_dir, filename)):
            skipped_count += 1
            continue

        # Create destination directory if it doesn't exist
        if not os.path.exists(dest_dir):
            os.makedirs(dest_dir)
            
        # Perform move
        dest_path = os.path.join(dest_dir, filename)
        
        # Handle filename collisions
        if os.path.exists(dest_path) and os.path.abspath(src_path) != os.path.abspath(dest_path):
            print(f"Collision: {dest_path} already exists. Skipping.")
            skipped_count += 1
            continue
            
        print(f"Moving {filename} to {os.path.relpath(dest_dir, BASE_DIR)}")
        try:
            shutil.move(src_path, dest_path)
            moved_count += 1
        except Exception as e:
            print(f"Error moving {filename}: {e}")
            
    print(f"\nDone! Moved {moved_count} files, skipped {skipped_count} files.")

if __name__ == "__main__":
    main()
