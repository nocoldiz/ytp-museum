import os
import subprocess
import json
import argparse
import re
import threading
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

try:
    from tqdm import tqdm
except ImportError:
    print("Please install tqdm to view progress bars: pip install tqdm")
    exit(1)

# --- CONFIGURATION ---
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
VIDEO_DIR = PROJECT_ROOT / "videos"
CACHE_FILE = SCRIPT_DIR / "db/converted_cache.json"
DEFAULT_MAX_WORKERS = 2 

# Ensure the database directory exists before we ever try to write to it
CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)

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
TIME_REGEX = re.compile(r"time=(\d{2}):(\d{2}):(\d{2}\.\d{2})")

# Thread locks and caches
cache_lock = Lock()
processed_cache = set()

# Map worker threads to a specific line in the terminal for tqdm
worker_positions = {}
position_lock = threading.Lock()

def get_position():
    """Assigns a persistent terminal row (1, 2, 3...) for each worker thread."""
    with position_lock:
        tid = threading.get_ident()
        if tid not in worker_positions:
            # Offset by 1 so position 0 is left open for the overall progress bar
            worker_positions[tid] = len(worker_positions) + 1
        return worker_positions[tid]

def load_cache():
    global processed_cache
    if CACHE_FILE.exists():
        try:
            with open(CACHE_FILE, "r") as f:
                processed_cache = set(json.load(f))
        except Exception as e:
            print(f"Error loading cache: {e}")
    return processed_cache

def save_to_cache(video_name):
    global processed_cache
    with cache_lock:
        try:
            if video_name not in processed_cache:
                processed_cache.add(video_name)
                with open(CACHE_FILE, "w") as f:
                    json.dump(list(processed_cache), f, indent=4)
        except Exception as e:
            print(f"Error saving to cache: {e}")

def get_size(file_path):
    return Path(file_path).stat().st_size

def get_duration(file_path):
    """Uses ffprobe to fetch the total duration of the video in seconds."""
    cmd = [
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(file_path)
    ]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return float(res.stdout.strip())
    except Exception:
        return 0.0

def process_video(vid_path):
    """
    Compresses a single video file.
    vid_path: string or Path object.
    Returns: Path to the resulting file.
    """
    vid = Path(vid_path)
    if not vid.exists():
        tqdm.write(f"  [ERROR] File not found: {vid}")
        return vid

    temp_output = vid.with_suffix(".temp_h265.mp4")
    cmd = [arg.format(input=str(vid), output=str(temp_output)) for arg in FFMPEG_CMD]
    
    # Prep for Progress Bar
    duration = get_duration(vid)
    pos = get_position()
    short_name = vid.name if len(vid.name) <= 25 else vid.name[:22] + "..."
    
    try:
        # Run ffmpeg, piping stderr so we can read it live
        process = subprocess.Popen(
            cmd, 
            stderr=subprocess.PIPE, 
            universal_newlines=True, 
            encoding='utf-8', 
            errors='replace'
        )
        
        # Individual file progress bar loop
        with tqdm(total=duration, desc=short_name, unit="s", position=pos, leave=False) as pbar:
            last_time = 0.0
            for line in process.stderr:
                match = TIME_REGEX.search(line)
                if match:
                    hours, minutes, seconds = map(float, match.groups())
                    current_time = hours * 3600 + minutes * 60 + seconds
                    increment = current_time - last_time
                    if increment > 0:
                        pbar.update(increment)
                        last_time = current_time
                        
        process.wait()
        
        if process.returncode == 0 and temp_output.exists():
            orig_size = get_size(vid)
            new_size = get_size(temp_output)
            
            if new_size < orig_size:
                reduction = (orig_size - new_size) / orig_size * 100
                tqdm.write(f"  [SUCCESS] {vid.name}: {orig_size/1024/1024:.1f}MB -> {new_size/1024/1024:.1f}MB (-{reduction:.1f}%)")
                
                final_name = vid.with_suffix(".mp4")
                
                if vid.exists():
                    vid.unlink() 
                    
                temp_output.replace(final_name)                
                save_to_cache(final_name.name)
                return final_name
            else:
                tqdm.write(f"  [SKIP] {vid.name}: No size benefit. Keeping original.")
                temp_output.unlink()
                save_to_cache(vid.name)
                return vid
        else:
            tqdm.write(f"  [ERROR] {vid.name}: FFmpeg process failed or output missing.")
            if temp_output.exists():
                temp_output.unlink()
                
    except Exception as e:
        tqdm.write(f"  [ERROR] {vid.name}: {e}")
        if temp_output.exists():
            temp_output.unlink()
    return vid

def main():
    parser = argparse.ArgumentParser(description="Batch or single video H.265/NVENC compression.")
    parser.add_argument("-f", "--file", type=str, help="Compress a single video file.")
    parser.add_argument("-w", "--workers", type=int, default=DEFAULT_MAX_WORKERS, help="Number of parallel workers for batch mode.")
    args = parser.parse_args()

    load_cache()

    if args.file:
        file_path = Path(args.file)
        if not file_path.exists():
            print(f"Error: File {file_path} does not exist.")
            return
        process_video(file_path)
        print("\n--- Single file task complete ---")
        return

    if not VIDEO_DIR.exists():
        print(f"Error: Folder {VIDEO_DIR} does not exist.")
        return

    all_files = [f for f in VIDEO_DIR.rglob("*") if f.suffix.lower() in EXTENSIONS]
    video_files = [f for f in all_files if f.name not in processed_cache]
    
    skipped_count = len(all_files) - len(video_files)
    if skipped_count > 0:
        print(f"Skipping {skipped_count} already processed videos.")

    if not video_files:
        print("No new videos found to compress.")
        return

    print(f"Found {len(video_files)} new videos. Starting Maximum H.265 Compression with {args.workers} workers...\n")

    # Create a master progress bar at position 0
    with tqdm(total=len(video_files), desc="Overall Batch Progress", position=0, leave=True) as master_pbar:
        with ThreadPoolExecutor(max_workers=args.workers) as executor:
            # Submit all video files to the executor
            futures = [executor.submit(process_video, vid) for vid in video_files]
            
            # As each video finishes, update the master progress bar
            for future in as_completed(futures):
                master_pbar.update(1)

    print("\n\n--- All high-compression tasks complete ---")

if __name__ == "__main__":
    main()