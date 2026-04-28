import os
import sys
import time
from bs4 import BeautifulSoup
import minify_html

def compress_html(html_content):
    """
    Purges unwanted tags and minifies HTML content.
    Returns the compressed HTML string.
    """
    # Parse HTML
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # ---------------------------------------------------------
    # PURGE PHASE: Remove Scripts & Specific User Requests
    # ---------------------------------------------------------
    
    # 1. Remove all <script> and <noscript> tags
    for tag in soup.find_all(['script', 'noscript']):
        tag.decompose()

    # 2. Remove explicit classes
    for class_name in ["menuwrap", "rc-anchor", "grecaptcha-error"]:
        for tag in soup.find_all(class_=class_name):
            tag.decompose()

    # 3. Remove explicit IDs
    for id_name in ["FFA-box", "recaptcha-token", "emoticons2"]:
        for tag in soup.find_all(id=id_name):
            tag.decompose()

    # 4. Remove ANY element where class or id contains "recaptcha"
    recaptcha_tags = soup.find_all(
        lambda tag: (tag.get('id') and 'recaptcha' in tag.get('id').lower()) or 
                    (tag.get('class') and any('recaptcha' in c.lower() for c in tag.get('class')))
    )
    for tag in recaptcha_tags:
        tag.decompose()

    # 5. Remove Creative Commons link and the exact <img> following it
    cc_links = soup.find_all('a', href="http://creativecommons.org/licenses/by-nc-sa/3.0/", rel="license")
    for cc_link in cc_links:
        # Try to find the image as a direct sibling first
        next_img = cc_link.find_next_sibling('img')
        
        # Fallback: if it's nested differently, find the very next img tag in the document
        if not next_img:
            next_img = cc_link.find_next('img')
            
        # Delete the image if found, then delete the <a> tag
        if next_img:
            next_img.decompose()
        cc_link.decompose()

    # 6. Remove the <img> tag located just before id="ffHtmlBottomEnd"
    bottom_end = soup.find(id="ffHtmlBottomEnd")
    if bottom_end:
        # Find the immediately preceding <img> tag in the HTML structure
        prev_img = bottom_end.find_previous('img')
        if prev_img:
            prev_img.decompose()

    # Convert the fully purged soup back to a string
    cleaned_html = str(soup)

    # ---------------------------------------------------------
    # MINIFICATION PHASE
    # ---------------------------------------------------------
    minified_html = minify_html.minify(
        cleaned_html,
        minify_css=True,                 # Minify inline CSS
        minify_js=False,                 # Not needed, we removed scripts
        remove_processing_instructions=True, 
        keep_html_and_head_opening_tags=True,
        keep_closing_tags=True           # Keeps the view safe from browser rendering quirks
    )
    
    return minified_html

def compress_file(filepath):
    """
    Compresses a single HTML file in place.
    Returns the number of bytes saved.
    """
    try:
        # Get original file size
        original_size = os.path.getsize(filepath)

        # Read the HTML content
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            html_content = f.read()

        # Compress
        minified_html = compress_html(html_content)

        # Write the compressed content back to the file
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(minified_html)

        # Calculate savings
        new_size = os.path.getsize(filepath)
        saved = original_size - new_size
        return saved

    except Exception as e:
        print(f"❌ Error processing {filepath}: {e}")
        return 0

def compress_html_files(root_dir="."):
    files_processed = 0
    total_saved_bytes = 0
    start_time = time.time()

    print(f"Starting recursive mass compression and cleanup in: {os.path.abspath(root_dir)}\n")

    # Walk through all directories and files recursively
    for dirpath, _, filenames in os.walk(root_dir):
        for filename in filenames:
            # Target both .html and .htm files
            if filename.lower().endswith(('.html', '.htm')):
                filepath = os.path.join(dirpath, filename)
                saved = compress_file(filepath)
                if saved > 0:
                    total_saved_bytes += saved
                    files_processed += 1
                    print(f"✅ Cleaned & Compressed: {filepath} | Saved: {saved / 1024:.2f} KB")

    # Final Statistics
    elapsed = time.time() - start_time
    mb_saved = total_saved_bytes / (1024 * 1024)
    
    print("\n" + "="*40)
    print(" MASS COMPRESSION COMPLETE")
    print("="*40)
    print(f"Files Processed : {files_processed}")
    print(f"Total Space Saved: {mb_saved:.2f} MB")
    print(f"Time Taken       : {elapsed:.2f} seconds")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        target = sys.argv[1]
        if os.path.isfile(target):
            print(f"Compressing single file: {target}")
            saved = compress_file(target)
            print(f"Done. Saved {saved / 1024:.2f} KB")
        elif os.path.isdir(target):
            compress_html_files(target)
        else:
            print(f"Error: {target} is not a valid file or directory.")
    else:
        # Defaults to project root (one level up from scripts/)
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        compress_html_files(project_root)