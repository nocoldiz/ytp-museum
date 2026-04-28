const { spawn } = require('child_process');
const path = require('path');

/**
 * Helper to run a node script and pipe its output to the main process.
 */
function run(filename) {
    console.log(`[STARTING] ${filename}...`);
    const child = spawn('node', [filename], { 
        stdio: 'inherit',
        shell: true 
    });
    
    child.on('close', (code) => {
        if (code !== 0 && code !== null) {
            console.error(`[ERROR] ${filename} exited with code ${code}`);
        }
    });
}

const mode = process.argv[2];

if (mode === 'dashboard') {
    run('server.js');
} else if (mode === 'forum') {
    run('server_forum.js');
} else {
    // Start both
    run('server.js');
    run('server_forum.js');
}
