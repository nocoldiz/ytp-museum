import os

def split_file(file_path, chunk_size_mb=50):
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        return

    chunk_size = chunk_size_mb * 1024 * 1024
    file_size = os.path.getsize(file_path)
    print(f"Splitting {file_path} ({file_size} bytes) into {chunk_size_mb}MB chunks...")

    with open(file_path, 'rb') as f:
        part_num = 1
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            
            part_name = f"{file_path}.part{part_num}"
            with open(part_name, 'wb') as part_file:
                part_file.write(chunk)
            
            print(f"  Created {part_name} ({len(chunk)} bytes)")
            part_num += 1

    print("Done.")

def join_files(file_path):
    part_num = 1
    parts = []
    while True:
        part_name = f"{file_path}.part{part_num}"
        if not os.path.exists(part_name):
            break
        parts.append(part_name)
        part_num += 1
    
    if not parts:
        return False
        
    print(f"Joining {len(parts)} parts into {file_path}...")
    with open(file_path, 'wb') as output_file:
        for part_name in parts:
            with open(part_name, 'rb') as part_file:
                output_file.write(part_file.read())
            print(f"  Added {part_name}")
    
    print("Done.")
    return True

if __name__ == "__main__":
    split_file("public/db/ytp.db")
