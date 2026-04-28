# YTP Museum
<img width="1379" height="918" alt="immagine" src="https://github.com/user-attachments/assets/309045c9-1410-458c-a9e0-f776d21984b7" />

Offline scraper and museum for YTP videos, 2009 era Youtube style dashboard and local mirror server for the historic YouTube Poop Italian Forum
(`youtubepoopita.forumfree.it`).

Check data and analytics breakdown here
([https://nocoldiz.github.io/ytpbackup/](https://nocoldiz.github.io/ytpbackup/)) 
---

## Structure

```text
ytpbackup/
├── scripts/
│   ├── forum_scraper.py    # Downloads forum sections, index pages, threads
│   ├── ytp_scraper.py      # Scans for YouTube links and downloads videos
│   ├── compress_videos.py  # Video compression tool
│   └── compress_pages.py   # HTML compression tool

├── server.js           # Main router & Dashboard server
├── server_forum.js     # Legacy Forum Mirror logic
├── package.json
├── docs/               # JSON indexes and web dashboard
├── videos/             # Downloaded YouTube videos organized by channel
│   ├── Sources/        # Source videos for YTPs, not organized by channel
│   ├── despotaaa/
│   ├── ZioTok83/
│   └── bassman85x/
│       └── Youtube Poop ： Mondo Emo (La parodia che ha dato inizio a TUTTO) - 6qXBHVssbg0.mkv
└── site_mirror/
    ├── Home.html
    ├── .scraper_state.json
    ├── Risorse/
    │   ├── index/
    │   │   ├── Risorse.html
    │   │   ├── Risorse - pagina 2.html
    │   │   └── …
    │   ├── 64123456_Thread title.html        ← single-page thread
    │   └── 64123457_Another thread/          ← multi-page thread
    │       ├── page_1.html
    │       └── page_2.html
    └── … (one folder per section)
```
---

## Dashboard Server
<img width="1857" height="898" alt="immagine" src="https://github.com/user-attachments/assets/79f8f5b2-ccb3-419e-b268-35e533229e56" />

The main entry point for the YTP Archive. It serves the interactive dashboard, search interface, and local video playback.

> [!NOTE]
> The dashboard (`docs/index.html`) is designed to work in two modes:
> - **Static Mode**: Can be viewed by opening the file directly or via GitHub Pages. It allows browsing the archive and watching videos via YouTube.
> - **Server Mode**: When running via `npm start`, it enables **local video playback** (for archived videos) and **management features** (flagging sources, banning videos).

### Start

```bash
npm start
```

Runs on [http://localhost:3000](http://localhost:3000) by default.

---

## Forum Server
<img width="1669" height="901" alt="immagine" src="https://github.com/user-attachments/assets/2500efb3-0919-4868-b82a-1d4d7b393810" />

A zero-dependency Node.js HTTP server that serves the scraped pages with all
internal forum links rewritten to local equivalents.

### Requirements

Node.js ≥ 18

### Start

```bash
node server_forum.js
```

Or via npm:

```bash
npm start forum
```

### How links are resolved

| Original URL | Served from |
|---|---|
| `https://youtubepoopita.forumfree.it/` | `site_mirror/Home.html` |
| `?f=6350394` | `site_mirror/Risorse/index/Risorse.html` |
| `?f=6350394&st=30` | `site_mirror/Risorse/index/Risorse - pagina 2.html` |
| `?t=64123456` | `site_mirror/Risorse/64123456_Title.html` |
| `?t=64123456&st=30` | `site_mirror/Risorse/64123456_Title/page_2.html` |

Pagination links in the pages (`?f=…&st=…`, `?t=…&st=…`) are already in query-
string format, so the domain-strip rewrite makes them work immediately.

The forum's `page_jump()` function (used by the "jump to page" dialog) is
overridden with a local implementation that navigates to the correct `?st=`
offset.

---

## YTP Scraper
<img width="1069" height="574" alt="immagine" src="https://github.com/user-attachments/assets/fdb51cd4-150e-43a2-ad29-2afc2e39ade0" />

The `ytp_scraper.py` script is an interactive CLI tool that scans the scraped forum pages (or a predefined list of allowed YouTube channels) to find and archive YouTube videos. It relies on `yt-dlp` to fetch metadata and download the video files.

### How it works

1. **Index Update**: The script scans all local HTML files in the `site_mirror/` directory (specifically sections like *YTP nostrane*, *YTP fai da te*, etc.) for YouTube links. It extracts the video IDs and builds a JSON database (`docs/video_index.json`).
2. **Channel Scraping**: Optionally, it can directly scrape a list of whitelisted YouTube channels for new videos matching specific YTP-related keywords.
3. **Metadata Fetching**: For newly found videos, it queries YouTube via `yt-dlp` to retrieve the title, description, channel name, view count, and publish date. It automatically skips unavailable videos or videos from blacklisted channels.
4. **Downloading**: It downloads the pending videos in the best available quality (up to 720p) along with their thumbnails, organizing them into `videos/{Channel Name}/`.

### Requirements

```bash
pip install yt-dlp beautifulsoup4 lxml
```

### Usage

Launch the interactive menu:

```bash
python ytp_scraper.py
```
