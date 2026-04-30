import os
import subprocess
import json
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from threading import Lock

# --- CONFIGURATION ---
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
VIDEO_DIR = PROJECT_ROOT / "db" / "videos"
CACHE_FILE = SCRIPT_DIR / "db/converted_cache.json"
MAX_WORKERS = 2 

# FFmpeg settings for Maximum NVENC Compression
FFMPEG_CMD = [
    "ffmpeg", "-y", 
    "-hwaccel", "cuda",             
    "-i", "{input}",
    "-c:v", "hevc_nvenc",           
    "-preset", "p7",                
    "-tune", "hq",                  
    "-rc", "vbr",                   
    "-multipass", "fullres",        
    "-cq", "28",                    
    "-c:a", "copy",                 
    "-tag:v", "hvc1",               
    "{output}"
]

EXTENSIONS = {".mp4", ".mkv", ".avi", ".mov", ".flv", ".wmv", ".ts"}

# Thread lock to prevent JSON corruption when writing from multiple workers
cache_lock = Lock()

def load_cache():
    if CACHE_FILE.exists():
        try:
            with open(CACHE_FILE, "r") as f:
                return set(json.load(f))
        except Exception as e:
            print(f"Error loading cache: {e}")
    return set()

def save_to_cache(video_name):
    with cache_lock:
        processed = list(load_cache())
        if video_name not in processed:
            processed.append(video_name)
            with open(CACHE_FILE, "w") as f:
                json.dump(processed, f, indent=4)

def get_size(file_path):
    return file_path.stat().st_size

def process_video(vid):
    temp_output = vid.with_suffix(".temp_h265.mp4")
    print(f"Processing (High Compression): {vid.name}")
    
    cmd = [arg.format(input=str(vid), output=str(temp_output)) for arg in FFMPEG_CMD]
    
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True)
        
        if temp_output.exists():
            orig_size = get_size(vid)
            new_size = get_size(temp_output)
            
            if new_size < orig_size:
                reduction = (orig_size - new_size) / orig_size * 100
                print(f"  [SUCCESS] {vid.name}: {orig_size/1024/1024:.1f}MB -> {new_size/1024/1024:.1f}MB (-{reduction:.1f}%)")
                
                final_name = vid.with_suffix(".mp4")
                vid.unlink() 
                temp_output.rename(final_name)
                # Save the new name to cache
                save_to_cache(final_name.name)
            else:
                print(f"  [SKIP] {vid.name}: No size benefit. Keeping original.")
                temp_output.unlink()
                # Even if we keep the original, mark it as "checked" in cache
                save_to_cache(vid.name)
                
    except Exception as e:
        print(f"  [ERROR] {vid.name}: {e}")
        if temp_output.exists():
            temp_output.unlink()

def main():
    if not VIDEO_DIR.exists():
        print(f"Error: Folder {VIDEO_DIR} does not exist.")
        return

    # Load cache and find files
    converted_cache = load_cache()
    all_files = [f for f in VIDEO_DIR.rglob("*") if f.suffix.lower() in EXTENSIONS]
    
    # Filter out already processed files
    video_files = [f for f in all_files if f.name not in converted_cache]
    
    skipped_count = len(all_files) - len(video_files)
    if skipped_count > 0:
        print(f"Skipping {skipped_count} already processed videos.")

    print(f"Found {len(video_files)} new videos. Starting Maximum H.265 Compression...\n")

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        executor.map(process_video, video_files)

    print("\n--- All high-compression tasks complete ---")

if __name__ == "__main__":
    main()