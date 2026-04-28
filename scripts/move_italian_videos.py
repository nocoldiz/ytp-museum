import os
import json
import shutil
import re
import math

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VIDEO_INDEX_PATH = os.path.join(BASE_DIR, 'db', 'video_index.json')
VIDEOS_DIR = os.path.join(BASE_DIR, 'db', 'videos')
ITALIAN_DEST_DIR = os.path.join(BASE_DIR, 'italian_videos')

def load_json(path):
    if not os.path.exists(path):
        print(f"Error: {path} not found.")
        return {}
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def extract_video_id(filename):
    patterns = [
        r'\[([a-zA-Z0-9_-]{11})\]\.[^.]+$',
        r' - ([a-zA-Z0-9_-]{11})\.[^.]+$',
        r'([a-zA-Z0-9_-]{11})\.[^.]+$'
    ]
    for pattern in patterns:
        match = re.search(pattern, filename)
        if match:
            return match.group(1)
    return None

def format_size(size_bytes):
    if size_bytes == 0:
        return "0B"
    size_name = ("B", "KB", "MB", "GB", "TB")
    i = int(math.floor(math.log(size_bytes, 1024)))
    p = math.pow(1024, i)
    s = round(size_bytes / p, 2)
    return f"{s} {size_name[i]}"

def main():
    print("Loading video index...")
    video_index = load_json(VIDEO_INDEX_PATH)
    
    if not os.path.exists(ITALIAN_DEST_DIR):
        os.makedirs(ITALIAN_DEST_DIR)
        
    print(f"Scanning {VIDEOS_DIR} recursively for Italian videos...")
    
    all_files = []
    for root, dirs, files in os.walk(VIDEOS_DIR):
        # Avoid scanning the destination folder if it happens to be inside
        if os.path.abspath(root).startswith(os.path.abspath(ITALIAN_DEST_DIR)):
            continue
            
        for filename in files:
            all_files.append((root, filename))
    
    to_move = []
    total_size = 0
    skipped_count = 0
    
    for root, filename in all_files:
        video_id = extract_video_id(filename)
        if not video_id:
            # We don't necessarily skip these in the final report if they aren't even identified as videos
            continue
            
        video_data = video_index.get(video_id)
        if not video_data or video_data.get('language') != 'italian':
            continue
            
        src_path = os.path.join(root, filename)
        
        # Get channel name for subfolder
        author = video_data.get('channel_name', 'Unknown Channel')
        author_folder = "".join([c for c in author if c.isalnum() or c in (' ', '.', '_', '-')]).strip()
        if not author_folder:
            author_folder = "Unknown Channel"
            
        dest_dir = os.path.join(ITALIAN_DEST_DIR, author_folder)
        dest_path = os.path.join(dest_dir, filename)
        
        # Check for collision
        if os.path.exists(dest_path):
            skipped_count += 1
            continue
            
        file_size = os.path.getsize(src_path)
        to_move.append({
            'src': src_path,
            'dest_dir': dest_dir,
            'dest': dest_path,
            'filename': filename,
            'author_folder': author_folder
        })
        total_size += file_size
            
    if not to_move:
        print("No Italian videos found to move.")
        return

    print(f"\nFound {len(to_move)} Italian videos to move.")
    print(f"Total size: {format_size(total_size)}")
    if skipped_count > 0:
        print(f"Note: {skipped_count} files were skipped because they already exist in the destination.")
    
    confirm = input("\nDo you want to actually move these files? (y/N): ").strip().lower()
    if confirm not in ['y', 'yes']:
        print("Operation cancelled.")
        return

    moved_count = 0
    error_count = 0
    
    for item in to_move:
        if not os.path.exists(item['dest_dir']):
            os.makedirs(item['dest_dir'])
            
        print(f"Moving Italian video {item['filename']} to italian_videos/{item['author_folder']}/")
        try:
            shutil.move(item['src'], item['dest'])
            moved_count += 1
        except Exception as e:
            print(f"Error moving {item['filename']}: {e}")
            error_count += 1
            
    print(f"\nDone! Moved {moved_count} Italian files. Errors: {error_count}.")

if __name__ == "__main__":
    main()

