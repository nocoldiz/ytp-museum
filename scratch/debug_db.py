import sqlite3
import json

db_path = 'public/museum.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("SELECT status, is_source, count(*) FROM videos GROUP BY status, is_source")
rows = cursor.fetchall()

print("Status | Is Source | Count")
for row in rows:
    print(f"{row[0]} | {row[1]} | {row[2]}")

cursor.execute("SELECT * FROM videos WHERE is_source = 0 LIMIT 5")
vids = cursor.fetchall()
print("\nSample videos (is_source=0):")
for v in vids:
    print(v)

conn.close()
