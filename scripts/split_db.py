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

if __name__ == "__main__":
    split_file("public/ytp.db")
