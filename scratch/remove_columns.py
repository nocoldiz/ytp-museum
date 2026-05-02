import sqlite3
import os

databases = [
    'public/db/ytp.db',
    'public/db/ytpmv.db',
    'public/db/sources.db',
    'public/db/collabs.db'
]

cols_to_remove = ['created_at', 'updated_at', 'is_source', 'status']

def remove_columns(db_path):
    if not os.path.exists(db_path):
        print(f"Database {db_path} not found.")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Get all tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
    tables = [row[0] for row in cursor.fetchall()]
    
    for table in tables:
        # Get current columns
        cursor.execute(f"PRAGMA table_info({table});")
        columns_info = cursor.fetchall()
        all_cols = [col[1] for col in columns_info]
        
        found_cols = [c for c in cols_to_remove if c in all_cols]
        if not found_cols:
            print(f"No target columns found in table '{table}' of {db_path}")
            continue
            
        print(f"Removing {found_cols} from table '{table}' in {db_path}")
        
        # New column list (preserving order)
        remaining_cols = [c for c in all_cols if c not in cols_to_remove]
        cols_str = ", ".join(remaining_cols)
        
        # Get the original create statement to replicate types/constraints if possible
        # But simpler: just create a new table with the remaining columns
        # To handle constraints/types properly, we'd need more logic.
        # Let's use the ALTER TABLE DROP COLUMN if supported, otherwise the copy method.
        
        try:
            for col in found_cols:
                cursor.execute(f"ALTER TABLE {table} DROP COLUMN {col}")
            print(f"Successfully removed columns from {table} using ALTER TABLE.")
        except sqlite3.OperationalError as e:
            print(f"ALTER TABLE failed, using fallback method for {table}: {e}")
            # Fallback: Recreate table
            # 1. Get original schema
            cursor.execute(f"SELECT sql FROM sqlite_master WHERE type='table' AND name='{table}'")
            original_sql = cursor.fetchone()[0]
            
            # This is tricky to parse manually. 
            # Let's try a safer approach: 
            # 1. Rename old table
            # 2. Create new table with remaining columns (we might lose some constraints here if we are not careful)
            # 3. Copy data
            # 4. Drop old table
            
            # Actually, I'll just use a temporary table
            cursor.execute(f"CREATE TABLE {table}_backup AS SELECT {cols_str} FROM {table}")
            cursor.execute(f"DROP TABLE {table}")
            cursor.execute(f"ALTER TABLE {table}_backup RENAME TO {table}")
            print(f"Successfully removed columns from {table} using backup method.")
            
    conn.commit()
    conn.close()

for db in databases:
    remove_columns(db)
