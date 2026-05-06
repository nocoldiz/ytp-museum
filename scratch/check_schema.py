import sqlite3
import os

db_path = 'public/db/ytpoopers.db'
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(channels)")
    print([row[1] for row in cursor.fetchall()])
    conn.close()
else:
    print("DB not found")
