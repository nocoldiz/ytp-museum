import os

def merge_file(output_path, part_prefix):
    print(f"Merging {part_prefix}.part* into {output_path}...")
    
    parts = []
    part_num = 1
    while True:
        part_name = f"{part_prefix}.part{part_num}"
        if not os.path.exists(part_name):
            break
        parts.append(part_name)
        part_num += 1

    if not parts:
        print("No parts found to merge.")
        return

    with open(output_path, 'wb') as output_file:
        for part in parts:
            print(f"  Reading {part}...")
            with open(part, 'rb') as f:
                output_file.write(f.read())

    print(f"Done. Created {output_path} ({os.path.getsize(output_path)} bytes).")

if __name__ == "__main__":
    merge_file("public/ytp.db", "public/ytp.db")
