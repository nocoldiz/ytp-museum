import re
import os

with open('public/script.js', 'r') as f:
    lines = f.readlines()

def get_lines(start, end=None):
    if end is None:
        return "".join(lines[start-1:])
    return "".join(lines[start-1:end-1])

def expose_functions(text):
    funcs = re.findall(r'^(?:async )?function\s+([a-zA-Z0-9_]+)', text, re.MULTILINE)
    exports = "\n".join([f"window.{f} = {f};" for f in funcs])
    return text + "\n// Expose functions to global scope\n" + exports + "\n"

files = {
    'js/core/state.js': get_lines(1, 40),
    'js/core/db.js': get_lines(40, 314),
    'js/pages/profiles.js': get_lines(314, 412),
    'js/core/routing.js': get_lines(484, 675),
    'js/ui/theme.js': get_lines(675, 830),
    'js/pages/search.js': get_lines(830, 1206),
    'js/pages/video-player.js': get_lines(1206, 2046),
    'js/pages/import.js': get_lines(2046, 2313),
    'js/ui/renderers.js': get_lines(2313, 2359),
    'js/pages/home.js': get_lines(2359, 2704),
    'js/pages/channels.js': get_lines(2704, 2984),
    'js/pages/years.js': get_lines(2984, 3211),
    'js/pages/overview.js': get_lines(3211, 3333),
    'js/ui/charts.js': get_lines(3333, 3374),
    'js/core/utils.js': get_lines(3374, 3424),
    'js/pages/timeline.js': get_lines(3424, 3957),
    'js/pages/saved.js': get_lines(3957, 4072),
    'js/pages/playlists.js': get_lines(4072, 4360),
    'js/pages/management.js': get_lines(4360)
}

# The INIT section (lines 412-484) should go to the main script.js
init_lines = get_lines(412, 484)

# Create directories
os.makedirs('public/js/core', exist_ok=True)
os.makedirs('public/js/pages', exist_ok=True)
os.makedirs('public/js/ui', exist_ok=True)

# Write files
main_imports = []
for path, content in files.items():
    # Fix state.js
    if path == 'js/core/state.js':
        content = content.replace('let ', 'window.').replace('const ', 'window.')
        content = re.sub(r'window\.dbYTP, dbSources, dbPoopers, dbYTPMV, dbCollabs;', 'window.dbYTP = undefined;\nwindow.dbSources = undefined;\nwindow.dbPoopers = undefined;\nwindow.dbYTPMV = undefined;\nwindow.dbCollabs = undefined;', content)
    else:
        content = expose_functions(content)
        
    with open('public/' + path, 'w') as f:
        f.write(content)
    
    # We need to import the file in script.js
    main_imports.append(f"import './{path}';")

main_content = "\n".join(main_imports) + "\n\n" + expose_functions(init_lines)

with open('public/script.js', 'w') as f:
    f.write(main_content)

print("Modularization complete!")
