#!/usr/bin/env python3
"""
YouTube Poop Italian Forum — Offline Scraper
=============================================
Scrapes all threads from each forum section into organized folders.
Images are embedded as base64 directly in each HTML page.

HOW IMAGES WORK:
  Images are captured at TWO levels to guarantee nothing is missed:
  1) Playwright network interception — captures every image the browser
     downloads, at the transport layer BEFORE CORS applies
  2) Python fallback — after the page loads, any <img> still pointing
     to an http URL gets downloaded via requests using the browser's
     cookies, then embedded as base64

Auto-resumes: just run again and it skips already-saved pages.

Requirements:
    pip install playwright beautifulsoup4 lxml requests
    playwright install chromium

Usage:
    py forum_scraper.py                     # Scrape all sections
    py forum_scraper.py --delay 2.0         # Slower
    py forum_scraper.py --sections 0,1,5    # Specific sections
    py forum_scraper.py --list              # Show section indices
    py forum_scraper.py --no-embed-images   # Skip image embedding
    py forum_scraper.py --embed-css         # Also inline CSS
    py forum_scraper.py --sanity-check      # Verify EVERY page is actually downloaded offline
"""

import os
import re
import sys
import json
import time
import base64
import hashlib
import logging
import argparse
import mimetypes
import threading
from urllib.parse import urljoin, urlparse, urlunparse, unquote, parse_qs
from collections import OrderedDict

import requests as req_lib
from bs4 import BeautifulSoup

# Add the current script's directory to sys.path to ensure imports work correctly
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from compress_pages import compress_html

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("scraper")

# ─── Forum Sections ──────────────────────────────────────────────────────────

SECTIONS = OrderedDict([
    ("Bacheca messaggi",                "https://youtubepoopita.forumfree.it/?f=9997591"),
    ("Eventi",                          "https://youtubepoopita.forumfree.it/?f=10249277"),
    ("Restyling",                       "https://youtubepoopita.forumfree.it/?f=9997592"),
    ("Risorse",                         "https://youtubepoopita.forumfree.it/?f=6350394"),
    ("Old sources",                     "https://youtubepoopita.forumfree.it/?f=9965080"),
    ("Biografie YTP",                   "https://youtubepoopita.forumfree.it/?f=6970084"),
    ("Ganons pub",                      "https://youtubepoopita.forumfree.it/?f=6844333"),
    ("YTP fai da te",                   "https://youtubepoopita.forumfree.it/?f=6342067"),
    ("Serve aiuto",                     "https://youtubepoopita.forumfree.it/?f=6350346"),
    ("Il significato della cacca",      "https://youtubepoopita.forumfree.it/?f=9999652"),
    ("Tutorial per il pooping",         "https://youtubepoopita.forumfree.it/?f=10003245"),
    ("Poop in progress",               "https://youtubepoopita.forumfree.it/?f=7071597"),
    ("YTP da internet",                 "https://youtubepoopita.forumfree.it/?f=6350374"),
    ("YTP nostrane",                    "https://youtubepoopita.forumfree.it/?f=10149353"),
    ("YTPMV dimportazione",             "https://youtubepoopita.forumfree.it/?f=6416911"),
    ("Collab poopeschi",                "https://youtubepoopita.forumfree.it/?f=10902086"),
    ("Club sportivo della foca grassa", "https://youtubepoopita.forumfree.it/?f=6844357"),
    ("Internet memes video",            "https://youtubepoopita.forumfree.it/?f=6342829"),
    ("Altri video",                     "https://youtubepoopita.forumfree.it/?f=6448874"),
    ("Off topic",                       "https://youtubepoopita.forumfree.it/?f=6342068"),
    ("Videogames",                      "https://youtubepoopita.forumfree.it/?f=6350347"),
    ("Cinema",                          "https://youtubepoopita.forumfree.it/?f=6414467"),
    ("Sport",                           "https://youtubepoopita.forumfree.it/?f=10304552"),
    ("Musica",                          "https://youtubepoopita.forumfree.it/?f=6574555"),
    ("Arte e grafica",                  "https://youtubepoopita.forumfree.it/?f=6693231"),
    ("Flood fun",                       "https://youtubepoopita.forumfree.it/?f=10037696"),
    ("THE PIT",                         "https://youtubepoopita.forumfree.it/?f=6342069"),
])

BASE_DOMAIN = "youtubepoopita.forumfree.it"
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DEFAULT_OUTPUT = os.path.join(PROJECT_ROOT, "site_mirror")
DEFAULT_DELAY = 1.5

HEADERS_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

IMAGE_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico", ".bmp",
    ".tiff", ".tif", ".avif",
}

IMAGE_MIMES = {
    "image/png", "image/jpeg", "image/gif", "image/svg+xml",
    "image/webp", "image/x-icon", "image/bmp", "image/avif",
    "image/tiff",
}

SKIP_PATTERNS = [
    "act=Profile", "act=Reg", "act=Login", "act=Logout",
    "act=Report", "act=Trackprefs", "act=xmlout", "act=rss",
    "act=Msg", "act=Mail", "act=calendar", "act=Help",
    "act=Search", "act=Stats", "act=Online", "act=Forward",
    "do=cfrm", "do=report", "do=new_post",
    "showuser=", "CODE=", "pid=",
]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def normalize_url(url, base_url):
    if not url:
        return None
    url = url.strip()
    if url.startswith(("#", "javascript:", "mailto:", "tel:", "data:")):
        return None
    try:
        full = urljoin(base_url, url)
        parsed = urlparse(full)
    except ValueError:
        return None
    return urlunparse(parsed._replace(fragment=""))


def is_forum_url(url):
    return BASE_DOMAIN in urlparse(url).netloc.lower()


def should_skip(url):
    lower = url.lower()
    return any(p.lower() in lower for p in SKIP_PATTERNS)


def get_thread_id(url):
    return parse_qs(urlparse(url).query).get("t", [None])[0]


def get_forum_id(url):
    return parse_qs(urlparse(url).query).get("f", [None])[0]


def is_thread_url(url):
    return get_thread_id(url) is not None and not should_skip(url)


def safe_filename(name, max_len=80):
    name = re.sub(r'[<>:"/\\|?*]', '_', name)
    name = re.sub(r'\s+', ' ', name).strip()
    name = name[:max_len] if len(name) > max_len else name
    name = name.rstrip('. ')
    return name or '_'


def thread_filepath(section_dir, thread_id, title=None):
    if title:
        return os.path.join(section_dir, f"{thread_id}_{safe_filename(title)}.html")
    return os.path.join(section_dir, f"{thread_id}.html")


def page_filepath(section_dir, thread_id, page_num, title=None):
    subdir = f"{thread_id}_{safe_filename(title)}" if title else str(thread_id)
    d = os.path.join(section_dir, subdir)
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, f"page_{page_num}.html")


def guess_mime(url, content_type=None):
    if content_type:
        ct = content_type.split(";")[0].strip().lower()
        if ct in IMAGE_MIMES:
            return ct
    ext = os.path.splitext(urlparse(url).path)[1].lower()
    mime_map = {
        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp",
        ".ico": "image/x-icon", ".bmp": "image/bmp", ".avif": "image/avif",
    }
    return mime_map.get(ext, "image/png")


def is_image_url(url):
    ext = os.path.splitext(urlparse(url).path)[1].lower()
    return ext in IMAGE_EXTENSIONS


# ─── Image Cache ─────────────────────────────────────────────────────────────

class ImageCache:
    def __init__(self):
        self._cache = {}
        self._lock = threading.Lock()

    def put(self, url, mime_type, data):
        with self._lock:
            self._cache[url] = (mime_type, data)

    def get(self, url):
        with self._lock:
            return self._cache.get(url)

    def get_data_uri(self, url):
        entry = self.get(url)
        if not entry:
            return None
        mime, data = entry
        b64 = base64.b64encode(data).decode("ascii")
        return f"data:{mime};base64,{b64}"

    def clear(self):
        with self._lock:
            self._cache.clear()

    def __len__(self):
        with self._lock:
            return len(self._cache)


# ─── Scraper ──────────────────────────────────────────────────────────────────

class ForumScraper:
    def __init__(self, args):
        self.output_dir = args.output
        self.delay = args.delay
        self.embed_images = not args.no_embed_images
        self.embed_css = args.embed_css
        self.thread_url = getattr(args, "thread_url", None)
        self.sanity_check = getattr(args, "sanity_check", False)

        all_names = list(SECTIONS.keys())
        if args.sections is not None:
            indices = [int(x.strip()) for x in args.sections.split(",")]
            self.section_list = [(all_names[i], SECTIONS[all_names[i]]) for i in indices]
        else:
            self.section_list = list(SECTIONS.items())

        self._pw = None
        self._browser = None
        self._context = None
        self._page = None
        self._image_cache = ImageCache()
        self._req_session = req_lib.Session()
        self._req_session.headers.update({
            "User-Agent": HEADERS_UA,
            "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
        })

        self.state = {}
        self.state_file = os.path.join(self.output_dir, ".scraper_state.json")

    def load_state(self):
        if os.path.exists(self.state_file):
            with open(self.state_file) as f:
                self.state = json.load(f)

    def save_state(self):
        os.makedirs(self.output_dir, exist_ok=True)
        with open(self.state_file, "w") as f:
            json.dump(self.state, f, indent=2)

    def section_state(self, name):
        if name not in self.state:
            self.state[name] = {
                "threads_found": [],
                "threads_done": [],
                "thread_pages_done": [],
            }
        return self.state[name]

    def _on_response(self, response):
        try:
            url = response.url
            ct = response.headers.get("content-type", "")
            mime = ct.split(";")[0].strip().lower()

            if mime in IMAGE_MIMES or is_image_url(url):
                body = response.body()
                if body and len(body) > 100:
                    if mime not in IMAGE_MIMES:
                        mime = guess_mime(url)
                    self._image_cache.put(url, mime, body)
        except Exception:
            pass

    def start_browser(self):
        from playwright.sync_api import sync_playwright
        log.info("🚀 Launching Chromium...")
        self._pw = sync_playwright().start()
        self._browser = self._pw.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox"],
        )
        self._context = self._browser.new_context(
            user_agent=HEADERS_UA, locale="it-IT",
            viewport={"width": 1920, "height": 1080},
        )
        self._page = self._context.new_page()
        self._page.route("**/*.{mp4,webm,ogg,avi,flv}", lambda r: r.abort())
        self._page.on("response", self._on_response)
        log.info("✓ Browser ready (image interception active)\n")

    def stop_browser(self):
        try:
            self._browser.close()
            self._pw.stop()
        except Exception:
            pass

    def _sync_cookies(self):
        try:
            cookies = self._context.cookies()
            self._req_session.cookies.clear()
            for c in cookies:
                self._req_session.cookies.set(
                    c["name"], c["value"], domain=c.get("domain", "")
                )
        except Exception:
            pass

    def _download_image_requests(self, url):
        try:
            resp = self._req_session.get(url, timeout=15, stream=True)
            resp.raise_for_status()
            ct = resp.headers.get("Content-Type", "")
            if "text/html" in ct.lower():
                return None
            data = resp.content
            if len(data) < 100:
                return None
            mime = guess_mime(url, ct)
            return mime, data
        except Exception:
            return None

    def _embed_images_in_html(self, html, page_url):
        soup = BeautifulSoup(html, "lxml")
        converted = 0
        fallback_downloaded = 0

        img_tags = soup.find_all("img")
        for img in img_tags:
            src = None
            for attr in ("src", "data-src", "data-lazy-src", "data-original",
                         "data-url", "data-image"):
                val = img.get(attr)
                if val and val.startswith("http"):
                    src = val
                    break

            if not src or src.startswith("data:"):
                continue

            full_src = normalize_url(src, page_url)
            if not full_src:
                continue

            data_uri = self._image_cache.get_data_uri(full_src)
            if not data_uri:
                data_uri = self._image_cache.get_data_uri(src)

            if not data_uri:
                result = self._download_image_requests(full_src)
                if result:
                    mime, raw = result
                    b64 = base64.b64encode(raw).decode("ascii")
                    data_uri = f"data:{mime};base64,{b64}"
                    self._image_cache.put(full_src, mime, raw)
                    fallback_downloaded += 1

            if data_uri:
                img["src"] = data_uri
                for attr in ("data-src", "data-lazy-src", "data-original",
                             "data-url", "data-image", "srcset", "loading"):
                    if img.get(attr):
                        del img[attr]
                converted += 1

        bg_converted = 0
        for tag in soup.find_all(style=True):
            style = tag["style"]
            urls = re.findall(r'url\(["\']?(https?://[^"\')\s]+)["\']?\)', style)
            for img_url in urls:
                data_uri = self._image_cache.get_data_uri(img_url)
                if not data_uri:
                    result = self._download_image_requests(img_url)
                    if result:
                        mime, raw = result
                        b64 = base64.b64encode(raw).decode("ascii")
                        data_uri = f"data:{mime};base64,{b64}"
                        self._image_cache.put(img_url, mime, raw)
                if data_uri:
                    style = style.replace(img_url, data_uri)
                    bg_converted += 1
            tag["style"] = style

        return str(soup)

    def _embed_css_in_html(self, html, page_url):
        soup = BeautifulSoup(html, "lxml")
        inlined = 0
        for link in soup.find_all("link", rel="stylesheet", href=True):
            href = normalize_url(link["href"], page_url)
            if not href:
                continue
            try:
                resp = self._req_session.get(href, timeout=15)
                resp.raise_for_status()
                css_text = resp.text

                def replace_css_url(m):
                    u = m.group(1)
                    data_uri = self._image_cache.get_data_uri(u)
                    if not data_uri:
                        result = self._download_image_requests(u)
                        if result:
                            mime, raw = result
                            b64 = base64.b64encode(raw).decode("ascii")
                            data_uri = f"data:{mime};base64,{b64}"
                    if data_uri:
                        return f"url('{data_uri}')"
                    return m.group(0)

                css_text = re.sub(
                    r'url\(["\']?(https?://[^"\')\s]+)["\']?\)',
                    replace_css_url, css_text
                )
                style_tag = soup.new_tag("style")
                style_tag.string = css_text
                link.replace_with(style_tag)
                inlined += 1
            except Exception:
                pass
        return str(soup)

    def fetch_page(self, url, embed=True):
        try:
            self._image_cache.clear()
            self._page.goto(url, wait_until="domcontentloaded", timeout=30000)
            self._page.wait_for_timeout(2000)
            try:
                self._page.wait_for_load_state("networkidle", timeout=10000)
            except Exception:
                pass

            if embed and self.embed_images:
                try:
                    self._page.evaluate("""
                        () => new Promise(resolve => {
                            let total = 0; const dist = 400;
                            const t = setInterval(() => {
                                window.scrollBy(0, dist); total += dist;
                                if (total >= document.body.scrollHeight) {
                                    clearInterval(t); window.scrollTo(0,0); resolve();
                                }
                            }, 80);
                            setTimeout(() => { clearInterval(t); resolve(); }, 20000);
                        })
                    """)
                    self._page.wait_for_timeout(2000)
                    try:
                        self._page.wait_for_load_state("networkidle", timeout=8000)
                    except Exception:
                        pass
                except Exception:
                    pass

            html = self._page.content()
            self._sync_cookies()

            if embed and self.embed_images:
                html = self._embed_images_in_html(html, url)
            if embed and self.embed_css:
                html = self._embed_css_in_html(html, url)

            time.sleep(self.delay)
            return html

        except Exception as e:
            log.warning(f"    ✗ Failed: {e}")
            return None

    def discover_threads_and_save_index(self, section_name, section_url, section_dir):
        """Discovers threads while saving the HTML layout pages natively."""
        forum_id = get_forum_id(section_url)
        threads = OrderedDict()
        page_url = section_url
        page_num = 0

        index_dir = os.path.join(section_dir, "index")
        os.makedirs(index_dir, exist_ok=True)

        while page_url:
            page_num += 1
            log.info(f"    Scanning & saving listing page {page_num}...")
            
            # Fetch with embed=True to ensure offline layout cache is accurate
            html = self.fetch_page(page_url, embed=True)
            if html is None:
                break

            # Save the index layout page
            if page_num == 1:
                filename = f"{safe_filename(section_name)}.html"
            else:
                filename = f"{safe_filename(section_name)} - pagina {page_num}.html"

            filepath = os.path.join(index_dir, filename)
            compressed_html = compress_html(html)
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(compressed_html)

            soup = BeautifulSoup(html, "lxml")
            found_new = False
            for a in soup.find_all("a", href=True):
                href = normalize_url(a["href"], page_url)
                if not href or not is_forum_url(href) or not is_thread_url(href):
                    continue
                tid = get_thread_id(href)
                base_thread = f"https://{BASE_DOMAIN}/?t={tid}"
                if base_thread not in threads:
                    title = a.get_text(strip=True) or f"Thread {tid}"
                    threads[base_thread] = title
                    found_new = True

            # Find chronologically sequential next listing page
            next_url = None
            min_next_st = float('inf')
            current_st = int(parse_qs(urlparse(page_url).query).get("st", [0])[0])

            for a in soup.find_all("a", href=True):
                href = normalize_url(a["href"], page_url)
                if not href:
                    continue
                qs = parse_qs(urlparse(href).query)
                if qs.get("f", [None])[0] == forum_id and "st" in qs:
                    st_val = int(qs["st"][0])
                    # Ensure we navigate directly to the immediate next pagination count
                    if current_st < st_val < min_next_st:
                        min_next_st = st_val
                        next_url = href

            if not found_new and not next_url:
                break
            elif next_url:
                page_url = next_url
            else:
                break

        return list(threads.items())

    def scan_saved_index_for_threads(self):
        """Scan already-saved index HTML files for thread links not yet in threads_found."""
        print("\n" + "─" * 70)
        print("  SCANNING SAVED INDEX PAGES FOR NEW THREADS")
        print("─" * 70)

        updated = 0
        for sec_name, sec_url in self.section_list:
            ss = self.section_state(sec_name)

            if not ss.get("index_pages_saved"):
                continue

            section_dir = os.path.join(self.output_dir, safe_filename(sec_name))
            index_dir = os.path.join(section_dir, "index")

            if not os.path.isdir(index_dir):
                continue

            known_urls = set(ss["threads_found"][::2])
            new_threads = OrderedDict()

            for html_file in sorted(os.listdir(index_dir)):
                if not html_file.endswith(".html"):
                    continue
                file_path = os.path.join(index_dir, html_file)
                try:
                    with open(file_path, encoding="utf-8") as f:
                        html = f.read()
                except Exception as e:
                    log.warning(f"    Could not read {html_file}: {e}")
                    continue

                soup = BeautifulSoup(html, "lxml")
                for a in soup.find_all("a", href=True):
                    href = normalize_url(a["href"], sec_url)
                    if not href or not is_forum_url(href) or not is_thread_url(href):
                        continue
                    tid = get_thread_id(href)
                    base_thread = f"https://{BASE_DOMAIN}/?t={tid}"
                    if base_thread not in known_urls and base_thread not in new_threads:
                        title = a.get_text(strip=True) or f"Thread {tid}"
                        new_threads[base_thread] = title

            if new_threads:
                log.info(f"  📁 {sec_name}: +{len(new_threads)} new thread(s) from saved index")
                for u, t in new_threads.items():
                    ss["threads_found"].extend([u, t])
                updated += 1
            else:
                log.info(f"  📁 {sec_name}: no new threads in saved index")

        if updated:
            self.save_state()
            log.info(f"  ✓ Updated threads_found for {updated} section(s)")

    def discover_thread_pages(self, thread_url, html):
        soup = BeautifulSoup(html, "lxml")
        tid = get_thread_id(thread_url)
        pages = {0: thread_url}
        for a in soup.find_all("a", href=True):
            href = normalize_url(a["href"], thread_url)
            if not href:
                continue
            qs = parse_qs(urlparse(href).query)
            if qs.get("t", [None])[0] == tid and "st" in qs:
                st = int(qs["st"][0])
                pages[st] = href
        return sorted(pages.items(), key=lambda x: x[0])

    def save_thread(self, section_dir, thread_url, thread_title, ss):
        tid = get_thread_id(thread_url)

        html = self.fetch_page(thread_url, embed=True)
        if html is None:
            return 0

        thread_pages = self.discover_thread_pages(thread_url, html)

        if len(thread_pages) <= 1:
            fpath = thread_filepath(section_dir, tid, thread_title)
            os.makedirs(os.path.dirname(fpath), exist_ok=True)
            compressed_html = compress_html(html)
            with open(fpath, "w", encoding="utf-8") as f:
                f.write(compressed_html)
            ss["thread_pages_done"].append(thread_url)
            return 1
        else:
            saved = 0
            for st_val, pg_url in thread_pages:
                pg_num = (st_val // 30) + 1 if st_val > 0 else 1
                fpath = page_filepath(section_dir, tid, pg_num, thread_title)

                if os.path.exists(fpath) and os.path.getsize(fpath) > 200:
                    if pg_url not in ss["thread_pages_done"]:
                        ss["thread_pages_done"].append(pg_url)
                    saved += 1
                    continue

                if st_val == 0:
                    pg_html = html
                else:
                    log.info(f"      Page {pg_num}...")
                    pg_html = self.fetch_page(pg_url, embed=True)
                    if pg_html is None:
                        continue

                os.makedirs(os.path.dirname(fpath), exist_ok=True)
                compressed_pg_html = compress_html(pg_html)
                with open(fpath, "w", encoding="utf-8") as f:
                    f.write(compressed_pg_html)
                ss["thread_pages_done"].append(pg_url)
                saved += 1

            return saved

    def run(self):
        print()
        print("=" * 70)
        print("  YouTube Poop Italian Forum — Offline Scraper")
        print(f"  Output:       {os.path.abspath(self.output_dir)}")
        print(f"  Sections:     {len(self.section_list)}")
        print(f"  Delay:        {self.delay}s")
        print(f"  Embed images: {'yes (base64 in HTML)' if self.embed_images else 'no'}")
        print(f"  Embed CSS:    {'yes' if self.embed_css else 'no'}")
        if self.sanity_check:
            print(f"  Sanity Check: enabled (verifying all downloaded pages)")
        if self.thread_url:
            print(f"  Thread URL:   {self.thread_url}")
        print("=" * 70)
        print()

        os.makedirs(self.output_dir, exist_ok=True)
        self.load_state()
        self.start_browser()

        try:
            if self.thread_url:
                self._run_single_thread_mode()
            else:
                self._run_full_mode()
        except KeyboardInterrupt:
            log.warning("\n\n⚠ Interrupted! Progress saved. Run again to resume.")
        finally:
            self.stop_browser()
            self.save_state()

        if not self.thread_url:
            self._print_summary()

    def _run_single_thread_mode(self):
        """Scrape exactly one thread URL.  Called by the local mirror server."""
        t_url = self.thread_url
        tid   = get_thread_id(t_url)
        if not tid:
            log.error(f"  ✗ Invalid --thread-url: {t_url}")
            return

        if not self.section_list:
            log.error("  ✗ --thread-url requires --sections N to specify the target folder.")
            return

        sec_name, _ = self.section_list[0]
        ss           = self.section_state(sec_name)
        section_dir  = os.path.join(self.output_dir, safe_filename(sec_name))
        os.makedirs(section_dir, exist_ok=True)

        # Register in threads_found if not already there
        known = set(ss["threads_found"][::2])
        if t_url not in known:
            ss["threads_found"].extend([t_url, f"Thread {tid}"])
            self.save_state()

        threads = dict(zip(ss["threads_found"][::2], ss["threads_found"][1::2]))
        t_title = threads.get(t_url, f"Thread {tid}")

        log.info(f"  🎯 Single thread [{sec_name}]: {t_title}")
        pages_saved = self.save_thread(section_dir, t_url, t_title, ss)
        if t_url not in ss["threads_done"]:
            ss["threads_done"].append(t_url)
        self.save_state()
        log.info(f"  ✓ Saved {pages_saved} page(s)")

    def _thread_on_disk(self, section_dir, tid, title):
        """Return True if at least one saved file exists for this thread."""
        safe_title = safe_filename(title)
        if os.path.exists(os.path.join(section_dir, f"{tid}_{safe_title}.html")):
            return True
        subdir = os.path.join(section_dir, f"{tid}_{safe_title}")
        if os.path.isdir(subdir) and any(
            f.startswith("page_") and f.endswith(".html")
            for f in os.listdir(subdir)
        ):
            return True
        # fallback: match by tid prefix in case stored title differs
        try:
            for entry in os.listdir(section_dir):
                if entry.startswith(f"{tid}_") or entry == f"{tid}.html":
                    full = os.path.join(section_dir, entry)
                    if os.path.isfile(full):
                        return True
                    if os.path.isdir(full) and any(
                        f.startswith("page_") for f in os.listdir(full)
                    ):
                        return True
        except OSError:
            pass
        return False

    def _restore_missing_threads(self):
        """Remove from threads_done any thread whose files are absent on disk."""
        print("\n" + "─" * 70)
        print("  CHECKING THREADS_DONE AGAINST DISK")
        print("─" * 70)
        total_restored = 0
        for sec_name, _ in self.section_list:
            ss = self.section_state(sec_name)
            if not ss["threads_done"]:
                continue
            section_dir = os.path.join(self.output_dir, safe_filename(sec_name))
            title_map = dict(zip(ss["threads_found"][::2], ss["threads_found"][1::2]))
            missing = [
                t_url for t_url in ss["threads_done"]
                if not self._thread_on_disk(
                    section_dir, get_thread_id(t_url),
                    title_map.get(t_url, f"Thread {get_thread_id(t_url)}")
                )
            ]
            if missing:
                log.info(f"  📁 {sec_name}: {len(missing)} missing from disk — will re-fetch")
                for u in missing:
                    ss["threads_done"].remove(u)
                total_restored += len(missing)
            else:
                log.info(f"  📁 {sec_name}: all done threads present on disk")
        if total_restored:
            self.save_state()
            log.info(f"  ✓ Restored {total_restored} thread(s) to fetch queue")

    def _sanity_check_threads(self):
        """Sanity check: parse the locally saved first page to verify ALL pages exist offline."""
        print("\n" + "─" * 70)
        print("  SANITY CHECK: VERIFYING ALL PAGES ARE DOWNLOADED")
        print("─" * 70)
        total_restored = 0
        for sec_name, _ in self.section_list:
            ss = self.section_state(sec_name)
            if not ss.get("threads_done"):
                continue
            section_dir = os.path.join(self.output_dir, safe_filename(sec_name))
            title_map = dict(zip(ss["threads_found"][::2], ss["threads_found"][1::2]))
            
            missing = []
            for t_url in list(ss["threads_done"]):  
                tid = get_thread_id(t_url)
                title = title_map.get(t_url, f"Thread {tid}")
                safe_title = safe_filename(title)
                
                single_path = os.path.join(section_dir, f"{tid}_{safe_title}.html")
                multi_dir = os.path.join(section_dir, f"{tid}_{safe_title}")
                multi_path = os.path.join(multi_dir, "page_1.html")
                
                local_html_path = None
                if os.path.exists(single_path) and os.path.getsize(single_path) > 200:
                    local_html_path = single_path
                elif os.path.exists(multi_path) and os.path.getsize(multi_path) > 200:
                    local_html_path = multi_path
                
                # fallback: match by tid prefix in case stored title differs
                if not local_html_path:
                    try:
                        for entry in os.listdir(section_dir):
                            if entry.startswith(f"{tid}_") or entry == f"{tid}.html":
                                full = os.path.join(section_dir, entry)
                                if os.path.isfile(full) and os.path.getsize(full) > 200:
                                    local_html_path = full
                                    break
                                if os.path.isdir(full):
                                    p1 = os.path.join(full, "page_1.html")
                                    if os.path.isfile(p1) and os.path.getsize(p1) > 200:
                                        local_html_path = p1
                                        break
                    except OSError:
                        pass

                if not local_html_path:
                    missing.append(t_url)
                    continue
                    
                # Read local file to discover offline pages
                try:
                    with open(local_html_path, "r", encoding="utf-8") as f:
                        html = f.read()
                except Exception:
                    missing.append(t_url)
                    continue
                    
                thread_pages = self.discover_thread_pages(t_url, html)
                
                if len(thread_pages) > 1:
                    all_present = True
                    for st_val, pg_url in thread_pages:
                        pg_num = (st_val // 30) + 1 if st_val > 0 else 1
                        
                        if os.path.isfile(local_html_path) and os.path.dirname(local_html_path) == section_dir:
                            # Thread should have multiple pages, but was saved as single file
                            all_present = False
                            break
                        else:
                            d = os.path.dirname(local_html_path)
                            fpath = os.path.join(d, f"page_{pg_num}.html")
                            if not (os.path.exists(fpath) and os.path.getsize(fpath) > 200):
                                all_present = False
                                break
                                
                    if not all_present:
                        missing.append(t_url)

            if missing:
                log.info(f"  📁 {sec_name}: {len(missing)} incomplete thread(s) found — will re-fetch")
                for u in missing:
                    ss["threads_done"].remove(u)
                total_restored += len(missing)
            else:
                log.info(f"  📁 {sec_name}: all done threads verified perfectly")

        if total_restored:
            self.save_state()
            log.info(f"  ✓ Restored {total_restored} thread(s) to fetch queue")

    def _run_full_mode(self):
        """Full multi-section scrape (original run logic)."""
        # ─── Pre-pass: re-queue threads missing from disk ───
        if self.sanity_check:
            self._sanity_check_threads()
        else:
            self._restore_missing_threads()

        # ─── Pass 1: Fetch Threads ───
        print("\n" + "─" * 70)
        print("  FETCHING THREAD PAGES")
        print("─" * 70)
        for sec_idx, (sec_name, sec_url) in enumerate(self.section_list):
            ss = self.section_state(sec_name)
            section_dir = os.path.join(self.output_dir, safe_filename(sec_name))

            print(f"\n  📝 [{sec_idx+1}/{len(self.section_list)}] {sec_name} (Threads)")

            threads = list(zip(
                ss["threads_found"][::2], ss["threads_found"][1::2]
            ))

            total = len(threads)
            done_set = set(ss["threads_done"])
            done = len(done_set)

            if total == 0:
                log.info(f"  No threads found.")
                continue

            for t_idx, (t_url, t_title) in enumerate(threads):
                tid = get_thread_id(t_url)
                if t_url in done_set:
                    continue

                done += 1
                pct = done / total * 100
                log.info(
                    f"    [{done}/{total}] ({pct:.0f}%) "
                    f"Thread {tid}: {t_title[:50]}"
                )

                pages_saved = self.save_thread(section_dir, t_url, t_title, ss)
                ss["threads_done"].append(t_url)

                if pages_saved:
                    log.info(
                        f"      ✓ Saved ({pages_saved} "
                        f"page{'s' if pages_saved > 1 else ''})"
                    )

                if done % 5 == 0:
                    self.save_state()

            self.save_state()
            pct = (done / total * 100) if total > 0 else 100
            log.info(f"  ✅ {sec_name}: {done}/{total} ({pct:.0f}%)")

    def _print_summary(self):
        print()
        print("=" * 70)
        print("  SUMMARY")
        print("=" * 70)
        print(f"  {'Section':<40} {'Done':>6} / {'Total':>6}  {'%':>6}")
        print(f"  {'─'*40} {'─'*6}   {'─'*6}  {'─'*6}")

        grand_done = 0
        grand_total = 0

        for sec_name, sec_url in self.section_list:
            ss = self.section_state(sec_name)
            total = len(ss.get("threads_found", [])) // 2
            done = len(ss.get("threads_done", []))
            pct = (done / total * 100) if total > 0 else 0
            grand_done += done
            grand_total += total

            bar_len = 15
            filled = int(bar_len * done / total) if total > 0 else 0
            bar = "█" * filled + "░" * (bar_len - filled)
            status = "✅" if done >= total and total > 0 else "⏳"
            print(f"  {status} {sec_name:<38} {done:>5} / {total:>5}  {pct:>5.0f}%  {bar}")

        grand_pct = (grand_done / grand_total * 100) if grand_total > 0 else 0
        print(f"  {'─'*40} {'─'*6}   {'─'*6}  {'─'*6}")
        print(f"  {'TOTAL':<40} {grand_done:>5} / {grand_total:>5}  {grand_pct:>5.0f}%")
        print()
        print(f"  Output: {os.path.abspath(self.output_dir)}")
        print(f"  Each HTML file is self-contained with embedded images.")
        print(f"  Run again to resume any incomplete sections.")
        print("=" * 70)


def main():
    p = argparse.ArgumentParser(description="Scrape YTP Italian Forum by section.")
    p.add_argument("--output", default=DEFAULT_OUTPUT, help="Output directory")
    p.add_argument("--delay",  type=float, default=DEFAULT_DELAY, help="Delay (s)")
    p.add_argument("--no-embed-images", action="store_true", help="Skip image embedding")
    p.add_argument("--embed-css", action="store_true", help="Also inline CSS")
    p.add_argument("--sections", default=None,
                   help="Comma-separated section indices (e.g. 0,1,5)")
    p.add_argument("--thread-url", default=None,
                   help="Scrape a single thread URL (requires --sections N for target folder)")
    p.add_argument("--sanity-check", action="store_true", help="Recheck every page of completed threads to ensure they are fully downloaded")
    p.add_argument("--list", action="store_true", help="List sections and exit")

    args = p.parse_args()

    if args.list:
        print("\nForum Sections:")
        print(f"{'Idx':<4} {'Name':<40} {'URL'}")
        print("─" * 90)
        for i, (name, url) in enumerate(SECTIONS.items()):
            print(f"{i:<4} {name:<40} {url}")
        print(f"\nUse --sections 0,1,5 to scrape specific sections.")
        sys.exit(0)

    try:
        import playwright
    except ImportError:
        print("Install Playwright:")
        print("  pip install playwright && playwright install chromium")
        sys.exit(1)

    scraper = ForumScraper(args)
    scraper.run()


if __name__ == "__main__":
    main()