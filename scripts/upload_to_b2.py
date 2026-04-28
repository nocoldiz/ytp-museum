import os
import sys
from pathlib import Path

try:
    from b2sdk.v2 import B2Api, InMemoryAccountInfo, SyncManager, parse_sync_mode
except ImportError:
    print("\n[!] Error: 'b2sdk' library not found.")
    print("    Please install it using: pip install b2sdk\n")
    sys.exit(1)

# --- CONFIGURATION ---
# It is recommended to set these via environment variables for security
B2_KEY_ID = os.environ.get('B2_KEY_ID', 'YOUR_KEY_ID')
B2_KEY = os.environ.get('B2_KEY', 'YOUR_APPLICATION_KEY')
BUCKET_NAME = os.environ.get('B2_BUCKET', 'ytp-museum-bucket')

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DIRS_TO_SYNC = [
    ("db/videos", "videos"),
    ("sources", "sources"),
    ("site_mirror", "forum")
]

def sync_folders():
    info = InMemoryAccountInfo()
    b2_api = B2Api(info)
    
    print(f"🚀 Authorizing with Backblaze B2...")
    try:
        b2_api.authorize_account("production", B2_KEY_ID, B2_KEY)
    except Exception as e:
        print(f"❌ Authorization failed: {e}")
        return

    bucket = b2_api.get_bucket_by_name(BUCKET_NAME)
    sync_manager = SyncManager(b2_api)

    for local_rel, remote_rel in DIRS_TO_SYNC:
        local_path = PROJECT_ROOT / local_rel
        if not local_path.exists():
            print(f"⚠️ Skipping {local_rel}: Folder not found.")
            continue

        print(f"\n📂 Syncing {local_rel} to b2://{BUCKET_NAME}/{remote_rel}/...")
        
        # Source and Destination for Sync
        source = f"file://{local_path.absolute()}"
        destination = f"b2://{BUCKET_NAME}/{remote_rel}"
        
        try:
            # Sync mode 'up' means local to B2
            sync_manager.sync_folders(
                source_folder=parse_sync_mode('up', source, b2_api),
                dest_folder=parse_sync_mode('up', destination, b2_api),
                now_millis=None,
                reporter=None # Uses default console reporter
            )
            print(f"✅ {local_rel} sync complete.")
        except Exception as e:
            print(f"❌ Error syncing {local_rel}: {e}")

if __name__ == "__main__":
    if B2_KEY_ID == 'YOUR_KEY_ID' or B2_KEY == 'YOUR_APPLICATION_KEY':
        print("\n[!] Configuration Missing.")
        print("    Please edit this script or set B2_KEY_ID and B2_KEY environment variables.")
        print("    You can create a key at: https://secure.backblaze.com/app_keys.htm\n")
    else:
        sync_folders()
