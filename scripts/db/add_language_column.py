#!/usr/bin/env python3
"""Add `language` column to ytpoopers.db and populate it from
scripts/db/channels_by_language.txt.

Usage:
  python3 scripts/db/add_language_column.py
"""
import os
import sqlite3
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
POOPERS_DB = os.path.join(ROOT, 'public', 'db', 'ytpoopers.db')
LANG_FILE = os.path.join(ROOT, 'scripts', 'db', 'channels_by_language.txt')

# Databases to update videos.language
VIDEO_DBS = [
    os.path.join(ROOT, 'public', 'db', 'ytp.db'),
    os.path.join(ROOT, 'public', 'db', 'other.db'),
    os.path.join(ROOT, 'public', 'db', 'ytpmv.db'),
    os.path.join(ROOT, 'public', 'db', 'collabs.db'),
]

LANG_MAP = {
    'ENGLISH': 'en',
    'FRENCH': 'fr',
    'GERMAN': 'de',
    'ITALIAN': 'it',
    'RUSSIAN': 'ru',
    'SPANISH': 'es',
}

# map common full names (lowercase) to short codes for normalization
FULL_NAME_MAP = {
    'english': 'en',
    'italian': 'it',
    'french': 'fr',
    'german': 'de',
    'spanish': 'es',
    'russian': 'ru',
}


def parse_language_file(path):
    groups = {}
    current = None
    urls = []
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            m = re.match(r"^([A-Z]+)_CHANNELS\s*=\s*\[", line)
            if m:
                if current and urls:
                    groups[current] = urls
                current = m.group(1)
                urls = []
                continue

            if current:
                if ']' in line:
                    # finish group
                    groups[current] = urls
                    current = None
                    urls = []
                    continue
                line = line.strip()
                if not line: 
                    continue
                # extract quoted URL
                qm = re.search(r'"([^"]+)"', line)
                if qm:
                    urls.append(qm.group(1))

    return groups


def ensure_column(conn):
    cur = conn.cursor()
    cur.execute("PRAGMA table_info(channels)")
    cols = [r[1] for r in cur.fetchall()]
    if 'language' in cols:
        print('language column already exists')
        return False

    cur.execute("ALTER TABLE channels ADD COLUMN language TEXT")
    conn.commit()
    print('Added language column to channels table')
    return True


def ensure_videos_column(conn):
    cur = conn.cursor()
    cur.execute("PRAGMA table_info(videos)")
    cols = [r[1] for r in cur.fetchall()]
    if 'language' in cols:
        return False
    cur.execute("ALTER TABLE videos ADD COLUMN language TEXT")
    conn.commit()
    return True


def populate_languages(conn, mapping):
    cur = conn.cursor()
    updated = 0
    missing = 0
    for url, lang in mapping.items():
        cur.execute("UPDATE channels SET language = ? WHERE channel_url = ?", (lang, url))
        if cur.rowcount == 0:
            missing += 1
        else:
            updated += cur.rowcount
    conn.commit()
    return updated, missing


def populate_videos_languages(conn, mapping):
    cur = conn.cursor()
    updated = 0
    missing = 0
    for url, lang in mapping.items():
        cur.execute("UPDATE videos SET language = ? WHERE channel_url = ? AND (language IS NULL OR language = '' OR lower(language) IN ({placeholders}))".format(placeholders=','.join(['?']*len(FULL_NAME_MAP))), tuple([lang, url] + list(FULL_NAME_MAP.keys())))
        if cur.rowcount == 0:
            missing += 1
        else:
            updated += cur.rowcount
    conn.commit()
    return updated, missing


def normalize_existing_languages_in_channels(conn):
    cur = conn.cursor()
    updated = 0
    for full, code in FULL_NAME_MAP.items():
        cur.execute("UPDATE channels SET language = ? WHERE lower(language) = ?", (code, full))
        updated += cur.rowcount
    conn.commit()
    return updated


def normalize_existing_languages_in_videos(conn):
    cur = conn.cursor()
    updated = 0
    for full, code in FULL_NAME_MAP.items():
        cur.execute("UPDATE videos SET language = ? WHERE lower(language) = ?", (code, full))
        updated += cur.rowcount
    conn.commit()
    return updated


def build_mapping(groups):
    mapping = {}
    for name, urls in groups.items():
        code = LANG_MAP.get(name.upper())
        if not code:
            continue
        for u in urls:
            mapping[u] = code
    return mapping


def main():
    if not os.path.exists(POOPERS_DB):
        print('Database not found:', POOPERS_DB)
        return
    if not os.path.exists(LANG_FILE):
        print('Language file not found:', LANG_FILE)
        return

    groups = parse_language_file(LANG_FILE)
    mapping = build_mapping(groups)
    # 1) Update channels table in ytpoopers.db
    conn = sqlite3.connect(POOPERS_DB)
    try:
        ensure_column(conn)
        updated, missing = populate_languages(conn, mapping)
        norm = normalize_existing_languages_in_channels(conn)
        print(f'ytpoopers.db: Updated {updated} channels; {missing} channel URLs not found in DB; normalized {norm} existing language values')
    finally:
        conn.close()

    # 2) Update videos.language in other DBs
    for db_path in VIDEO_DBS:
        if not os.path.exists(db_path):
            print('Skipping, DB not found:', db_path)
            continue
        cconn = sqlite3.connect(db_path)
        try:
            added = ensure_videos_column(cconn)
            if added:
                print(f'Added language column to videos in {db_path}')
            up, miss = populate_videos_languages(cconn, mapping)
            norm_v = normalize_existing_languages_in_videos(cconn)
            print(f'{os.path.basename(db_path)}: Updated {up} video rows; {miss} channel_url matches had 0 rows updated; normalized {norm_v} existing language values')
        finally:
            cconn.close()


if __name__ == '__main__':
    main()
