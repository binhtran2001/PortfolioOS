const idb = {
    db: null,
    async open() {
        if (this.db) return this.db;
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('PortfolioOS', 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('fs')) {
                    db.createObjectStore('fs', { keyPath: 'key' });
                }
            };
            req.onsuccess = (e) => { this.db = e.target.result; resolve(this.db); };
            req.onerror = () => reject(req.error);
        });
    },
    async get(key) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('fs', 'readonly');
            const req = tx.objectStore('fs').get(key);
            req.onsuccess = () => resolve(req.result ? req.result.value : undefined);
            req.onerror = () => reject(req.error);
        });
    },
    async set(key, value) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('fs', 'readwrite');
            tx.objectStore('fs').put({ key, value });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },
    async remove(key) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('fs', 'readwrite');
            tx.objectStore('fs').delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },
    async clear() {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('fs', 'readwrite');
            tx.objectStore('fs').clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }
};

class FileSystem {
    constructor() {
        this.storageKey = 'portfolio_fs';
    }

    async init() {
        const existing = await idb.get('fsData');
        if (existing) return;
        const lsData = localStorage.getItem(this.storageKey);
        if (lsData) {
            await idb.set('fsData', JSON.parse(lsData));
            localStorage.removeItem(this.storageKey);
            return;
        }
        const root = {
                '/': {
                    type: 'dir',
                    owner: 'admin',
                    permissions: { read: ['admin', 'guest'], write: ['admin'] },
                    children: ['home']
                },
                '/home': {
                    type: 'dir',
                    owner: 'admin',
                    permissions: { read: ['admin', 'guest'], write: ['admin'] },
                    children: ['guest']
                },
                '/home/guest': {
                    type: 'dir',
                    owner: 'guest',
                    permissions: { read: ['admin', 'guest'], write: ['admin', 'guest'] },
                    children: ['README.md']
                },
                '/home/guest/README.md': {
                    type: 'file',
                    owner: 'guest',
                    permissions: { read: ['admin', 'guest'], write: ['admin', 'guest'] },
                    content: [
                        '# PortfolioOS',
                        '',
                        'An interactive terminal-based portfolio website built with pure HTML, CSS & JavaScript.',
                        '',
                        '## Features',
                        '',
                        '- **Terminal UI**: Full emulator with command history and tab completion',
                        '- **Filesystem**: Hierarchical directories with `mkdir`, `rm`, `cd`, `ls`',
                        '- **Permissions**: User-based read/write access control',
                        '- **User Accounts**: `login` command to switch users',
                        '- **vi Editor**: Minimal editor with normal, insert, and command mode',
                        '- **grep**: Search files and pipe output',
                        '- **Markdown Rendering**: `view` command renders `.md` files',
                        '- **Boot Sequence**: Realistic kernel boot simulation',
                        '',
                        '## Commands',
                        '',
                        'Type `help` to list all commands.',
                        'Type `tips` for a beginner guide.',
                    ].join('\n')
                }
            };
            await idb.set('fsData', root);
    }

    async getAll() { return (await idb.get('fsData')) || {}; }
    async save(fsData) { await idb.set('fsData', fsData); }

    resolvePath(path, cwd) {
        if (!path) return cwd;
        let absolute;
        if (path.startsWith('/')) { absolute = path; }
        else { const base = cwd === '/' ? '' : cwd; absolute = base + '/' + path; }
        const parts = absolute.split('/').filter(Boolean);
        const resolved = [];
        for (const part of parts) {
            if (part === '..') { resolved.pop(); }
            else if (part !== '.') { resolved.push(part); }
        }
        return '/' + resolved.join('/');
    }

    async hasPermission(user, path, type) {
        const fsData = await this.getAll();
        const entry = fsData[path];
        if (!entry) return false;
        if (user === 'admin') return true;
        if (entry.owner === user) return true;
        return entry.permissions && entry.permissions[type] && entry.permissions[type].includes(user);
    }

    async readFile(path, user) {
        if (!(await this.hasPermission(user, path, 'read'))) return { error: 'Permission denied' };
        const fsData = await this.getAll();
        const entry = fsData[path];
        if (!entry || entry.type !== 'file') return { error: 'No such file' };
        return { content: entry.content };
    }

    async writeFile(path, content, user) {
        const fsData = await this.getAll();
        const fileExists = !!fsData[path];
        if (fileExists) {
            if (!(await this.hasPermission(user, path, 'write'))) return { error: 'Permission denied' };
        } else {
            const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
            if (!(await this.hasPermission(user, parentPath, 'write'))) return { error: 'Permission denied' };
            if (fsData[parentPath] && fsData[parentPath].type === 'dir') {
                const name = path.split('/').pop();
                if (!fsData[parentPath].children.includes(name)) {
                    fsData[parentPath].children.push(name);
                }
            }
        }
        fsData[path] = {
            type: 'file',
            content,
            owner: fileExists ? fsData[path].owner : user,
            permissions: fileExists ? fsData[path].permissions : { read: [user, 'admin'], write: [user, 'admin'] }
        };
        await this.save(fsData);
        return { success: true };
    }

    async mkdir(path, user) {
        const fsData = await this.getAll();
        if (fsData[path]) return { error: 'Directory already exists' };
        const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
        if (!(await this.hasPermission(user, parentPath, 'write'))) return { error: 'Permission denied' };
        fsData[path] = {
            type: 'dir',
            owner: user,
            permissions: { read: [user, 'admin'], write: [user, 'admin'] },
            children: []
        };
        const name = path.split('/').pop();
        if (fsData[parentPath] && fsData[parentPath].type === 'dir') {
            if (!fsData[parentPath].children.includes(name)) {
                fsData[parentPath].children.push(name);
            }
        }
        await this.save(fsData);
        return { success: true };
    }

    async rm(path, user, recursive) {
        if (path === '/') return { error: 'Cannot remove root' };
        const fsData = await this.getAll();
        if (!fsData[path]) return { error: `rm: ${path}: No such file or directory` };
        const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
        if (!(await this.hasPermission(user, parentPath, 'write'))) return { error: 'Permission denied' };
        if (fsData[path].type === 'dir') {
            const children = fsData[path].children || [];
            if (children.length > 0 && !recursive) {
                return { error: `rm: ${path}: is a directory (use -r to remove)` };
            }
            const prefix = path === '/' ? '/' : path + '/';
            Object.keys(fsData).forEach(key => {
                if (key.startsWith(prefix)) delete fsData[key];
            });
        }
        delete fsData[path];
        const name = path.split('/').pop();
        if (fsData[parentPath] && fsData[parentPath].type === 'dir') {
            fsData[parentPath].children = fsData[parentPath].children.filter(c => c !== name);
        }
        await this.save(fsData);
        return { success: true };
    }

    async list(path, user) {
        if (!(await this.hasPermission(user, path, 'read'))) return { error: 'Permission denied' };
        const fsData = await this.getAll();
        const entry = fsData[path];
        if (!entry || entry.type !== 'dir') return { error: 'Not a directory' };
        const prefix = path === '/' ? '/' : path + '/';
        const labeled = entry.children.map(name => {
            const childPath = prefix + name;
            const child = fsData[childPath];
            return child && child.type === 'dir' ? name + '/' : name;
        });
        return { content: labeled.join('  ') };
    }
}

const fs = new FileSystem();
(async () => { await fs.init(); bootSequence(); })();
let currentUser = 'guest';
let cwd = '/home/guest';
let commandHistory = [];
let historyIndex = -1;

let viMode = false;
let viFile = null;
let viBuffer = [''];
let viNormalMode = true;

let multilineActive = false;
let multilineDelimiter = '';
let multilinePrefix = '';
let multilineBuffer = '';

let pipeActive = false;

const outputDiv = document.getElementById('output');
const inputField = document.getElementById('command-input');
const promptSpan = document.getElementById('prompt');
const inputLine = document.getElementById('input-line');
const viContainer = document.getElementById('vi-container');
const viEditor = document.getElementById('vi-editor');
const viBar = document.getElementById('vi-bar');
const viInput = document.getElementById('vi-input');
const viPrompt = document.getElementById('vi-prompt');
const viStatusbar = document.getElementById('vi-statusbar');

function print(text, className = '') {
    const div = document.createElement('div');
    div.className = className;
    div.textContent = text;
    outputDiv.appendChild(div);
    document.getElementById('terminal').scrollTop = document.getElementById('terminal').scrollHeight;
}

function printHTML(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    outputDiv.appendChild(div);
    document.getElementById('terminal').scrollTop = document.getElementById('terminal').scrollHeight;
}

function escapeHtml(str) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return str.replace(/[&<>"']/g, c => map[c]);
}

function exitViMode() {
    viMode = false;
    viFile = null;
    viBuffer = [''];
    viNormalMode = true;
    viContainer.style.display = 'none';
    outputDiv.style.display = '';
    inputLine.style.display = 'flex';
    inputField.focus();
    updatePrompt();
}

function viUpdateStatusbar() {
    const lines = viBuffer.length;
    const mode = viNormalMode ? 'NORMAL' : 'INSERT';
    const file = viFile.split('/').pop();
    viStatusbar.textContent = `"${file}" ${lines}L  -- ${mode} --`;
}

function viEnterCommandMode() {
    viNormalMode = false;
    viEditor.readOnly = true;
    viBar.style.display = 'flex';
    viInput.value = '';
    viInput.focus();
    viUpdateStatusbar();
}

function viLeaveInsertMode() {
    viNormalMode = true;
    viEditor.readOnly = true;
    viBar.style.display = 'none';
    viEditor.focus();
    viUpdateStatusbar();
}

async function writeViBuffer() {
    const content = viBuffer.join('\n');
    const result = await fs.writeFile(viFile, content, currentUser);
    if (result.error) {
        print(result.error);
    } else {
        print('"' + viFile + '" ' + viBuffer.length + 'L written');
    }
}

async function processViCommand(cmd) {
    if (cmd === 'q' || cmd === 'q!') {
        exitViMode();
        return;
    }
    if (cmd === 'w' || cmd === 'w!') {
        await writeViBuffer();
        viNormalMode = true;
        viEditor.readOnly = true;
        viBar.style.display = 'none';
        viEditor.focus();
        viUpdateStatusbar();
        return;
    }
    if (cmd === 'wq' || cmd === 'wq!') {
        await writeViBuffer();
        exitViMode();
        return;
    }
    if (cmd) print('E492: Not an editor command: ' + cmd);
    viNormalMode = true;
    viEditor.readOnly = true;
    viBar.style.display = 'none';
    viEditor.focus();
    viUpdateStatusbar();
}

function renderMarkdown(md) {
    const lines = md.split('\n');
    let html = '';
    let inCodeBlock = false;
    let codeContent = '';

    for (const line of lines) {
        if (line.trimStart().startsWith('```')) {
            if (inCodeBlock) {
                html += `<div class="md-code-block">${escapeHtml(codeContent)}</div>`;
                codeContent = '';
                inCodeBlock = false;
            } else {
                inCodeBlock = true;
            }
            continue;
        }

        if (inCodeBlock) {
            codeContent += line + '\n';
            continue;
        }

        if (line.trim() === '') {
            html += '<br>';
            continue;
        }

        if (line.startsWith('# ')) {
            html += `<div class="md-h1">${escapeHtml(line.slice(2))}</div>`;
            continue;
        }
        if (line.startsWith('## ')) {
            html += `<div class="md-h2">${escapeHtml(line.slice(3))}</div>`;
            continue;
        }
        if (line.startsWith('### ')) {
            html += `<div class="md-h3">${escapeHtml(line.slice(4))}</div>`;
            continue;
        }

        if (/^[-*_]{3,}$/.test(line.trim())) {
            html += '<hr class="md-hr">';
            continue;
        }

        let processed = escapeHtml(line);
        processed = processed.replace(/\*\*(.+?)\*\*/g, '<strong class="md-bold">$1</strong>');
        processed = processed.replace(/\*(.+?)\*/g, '<em class="md-italic">$1</em>');
        processed = processed.replace(/`(.+?)`/g, '<span class="md-inline-code">$1</span>');
        processed = processed.replace(/\[(.+?)\]\((.+?)\)/g, '<a class="md-link" href="$2" target="_blank">$1</a>');

        if (line.trim().match(/^[-*+]\s/)) {
            const indent = line.search(/\S/);
            const text = line.trim().replace(/^[-*+]\s/, '');
            html += `<div class="md-list-item" style="margin-left:${16 + indent * 8}px">• ${text}</div>`;
            continue;
        }

        html += `<div class="md-text">${processed}</div>`;
    }

    if (inCodeBlock) {
        html += `<div class="md-code-block">${escapeHtml(codeContent)}</div>`;
    }

    return html;
}

function updatePrompt() {
    if (multilineActive) {
        promptSpan.textContent = '> ';
        return;
    }
    const displayPath = cwd === `/home/${currentUser}` ? '~' : cwd;
    promptSpan.textContent = `${currentUser}@portfolio:${displayPath}$ `;
}

async function expandGlob(pattern) {
    // Only support simple glob with one *: prefix*suffix
    const starIdx = pattern.indexOf('*');
    if (starIdx === -1) return [fs.resolvePath(pattern, cwd)];

    const prefix = pattern.slice(0, starIdx);
    const suffix = pattern.slice(starIdx + 1);

    // Resolve the prefix directory
    const dirPath = fs.resolvePath(prefix.replace(/\/$/, '') || '.', cwd);
            const fsData = await fs.getAll();
    const entry = fsData[dirPath];
    if (!entry || entry.type !== 'dir') return [fs.resolvePath(pattern, cwd)];

    const base = dirPath === '/' ? '/' : dirPath + '/';
    const matches = entry.children.filter(name => name.endsWith(suffix));
    return matches.map(name => base + name);
}

const commands = {
    help: () => [
        'Available commands:',
        '  help               – show this message',
        '  tips               – guide for new users',
        '  clear              – clear the terminal',
        '  ls [path]          – list directory contents',
        '  cat <file>         – print file contents',
        '  view <file>        – render markdown file with formatting',
        '  vi <file>          – edit file (minimal vi)',
        '  echo <text>        – print text (supports > redirect)',
        '  touch <file>       – create an empty file',
        '  grep [opts] <pattern> [file]  – search for pattern in file or pipe input',
        '  mkdir <dir>        – create a directory',
        '  rm [-r] <path>     – remove a file or directory',
        '  cd [path]          – change directory (cd .. works)',
        '  pwd                – print current directory',
        '  whoami             – print current user',
        '  login <user>       – switch user',
        '  js <file>          – execute JavaScript file or piped/heredoc code',
        '  init_fs            – initialize file system terminal data',
    ].join('\n'),

    tips: () => [
        '=== Getting Started Guide ===',
        '',
        '--- READING FILES ---',
        '  cat README.md           Display raw file contents',
        '  view README.md          Render .md files with formatting',
        '  cat ~/README.md         Display a file by path',
        '  cat /home/guest/README.md  Use full path from root',
        '',
        '--- EDITING FILES (vi) ---',
        '  vi file.txt             Open file in editor (creates on :w, not on open)',
        '  i                       Enter insert mode (type to edit)',
        '  Esc                     Return to normal mode',
        '  x                       Delete character under cursor (normal mode)',
        '  h/j/k/l                 Cursor movement (normal mode)',
        '  :                       Enter command mode',
        '  :w                      Save file (stays open)',
        '  :q                      Quit',
        '  :wq                     Save and quit',
        '',
        '--- WRITING FILES ---',
        '  echo hello world > note.txt   Write text into a new file',
        '  echo some text > note.txt     Overwrite an existing file',
        '',
        '--- NAVIGATION ---',
        '  ls                     List files in the current directory',
        '  cd projects            Enter a folder named "projects"',
        '  cd ..                  Go up one folder',
        '  cd ~ or cd             Go to your home folder',
        '  pwd                    Show which folder you are in',
        '',
        '--- USER ACCOUNTS ---',
        '  whoami                 See your current username',
        '  login admin            Switch to admin (has full permissions)',
        '  login guest            Switch back to guest',
        '',
        '--- CREATING & DELETING ---',
        '  touch file.txt          Create an empty file',
        '  echo text > file.txt    Create a file with content via redirect',
        '  mkdir myfolder          Create a new empty folder',
        '  rm file.txt             Delete a regular file',
        '  rm -r myfolder          Delete a folder (requires -r)',
        '',
        '--- PIPES & REDIRECT ---',
        '  cat README.md | grep portfolio   Filter output with grep',
        '  cat README.md | grep -i portfolio  Case-insensitive search',
        '  ls | grep .txt              Filter directory listing',
        '  echo data > file.txt        Redirect output into a file',
        '',
        '--- JAVASCRIPT ---',
        '  js script.js             Execute a .js file from the filesystem',
        '  js << CODE               Execute multi-line JS via heredoc',
        '  (then type code, then CODE on its own line)',
        '  cat file.js | js         Pipe JS code from another command',
        '',
        '--- MULTILINE (HEREDOC) ---',
        '  Use << DELIM to start a multiline input block.',
        '  Type DELIM on its own line to end it.',
        '  Example: cat << EOF  then lines  then EOF',
        '',
        'Tip: Press Tab to autocomplete commands.',
        '     Press ArrowUp/Down to recall previous commands.',
    ].join('\n'),

    clear: () => {
        outputDiv.innerHTML = '';
        return '';
    },
    whoami: () => currentUser,
    pwd: () => cwd,
    ls: async (args) => {
        const path = args[0] ? fs.resolvePath(args[0], cwd) : cwd;
        const result = await fs.list(path, currentUser);
        return result.error ? result.error : (result.content || '');
    },
    cat: async (args) => {
        if (!args[0]) return 'Usage: cat <file>';
        const path = fs.resolvePath(args[0], cwd);
        const result = await fs.readFile(path, currentUser);
        if (!result.error) return result.content;
        if (pipeActive && args[0].includes('\n')) return args[0];
        return result.error;
    },
    view: async (args) => {
        if (!args[0]) return 'Usage: view <file>';
        const path = fs.resolvePath(args[0], cwd);
        const result = await fs.readFile(path, currentUser);
        if (result.error) return result.error;
        printHTML(renderMarkdown(result.content));
        return '';
    },
    echo: (args) => args.join(' '),
    js: async (args) => {
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;
        const lines = [];
        const capture = (msgs) => msgs.map(m => typeof m === 'object' ? JSON.stringify(m, null, 2) : String(m)).join(' ');
        console.log = (...msgs) => void lines.push(capture(msgs));
        console.error = (...msgs) => void lines.push('Error: ' + capture(msgs));
        console.warn = (...msgs) => void lines.push('Warning: ' + capture(msgs));
        const restore = () => {
            console.log = originalLog;
            console.error = originalError;
            console.warn = originalWarn;
        };
        let code;
        if (args[0]) {
            const path = fs.resolvePath(args[0], cwd);
            const file = await fs.readFile(path, currentUser);
            if (!file.error) code = file.content;
        }
        if (!code && pipeActive) code = args.join(' ');
        if (!code) { restore(); return 'Usage: js <file.js> or pipe/heredoc code to js'; }
        try {
            let result = eval(code);
            restore();
            const output = lines.join('\n');
            if (result === undefined) return output || 'undefined';
            if (result === null) return output || 'null';
            const resultStr = String(result);
            return output ? output + '\n' + resultStr : resultStr;
        } catch (e) {
            restore();
            lines.push(`Error: ${e.message}`);
            return lines.join('\n');
        }
    },
    grep: async (args) => {
        if (args.length < 1) return 'Usage: grep [-i] <pattern> [file]';

        const ignoreCase = args.includes('-i');
        const filteredArgs = args.filter(a => !a.startsWith('-'));
        if (filteredArgs.length < 1) return 'Usage: grep [-i] <pattern> [file]';

        // If first arg has newlines, we're in pipe mode: content = args[0], pattern = args[1]
        const pipeMode = filteredArgs[0].includes('\n');
        let content, pattern;

        if (pipeMode) {
            content = filteredArgs[0];
            pattern = filteredArgs[1];
            if (!pattern) return 'Usage: grep [-i] <pattern>';
        } else {
            pattern = filteredArgs[0];
            if (!filteredArgs[1]) return 'Usage: grep [-i] <pattern> <file>';
            const path = fs.resolvePath(filteredArgs[1], cwd);
            const result = await fs.readFile(path, currentUser);
            if (result.error) return result.error;
            content = result.content;
        }

        const flags = ignoreCase ? 'gi' : 'g';
        let re;
        try {
            re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
        } catch (e) {
            return `grep: invalid pattern: ${e.message}`;
        }
        const lines = content.split('\n');
        const matched = lines.filter(line => re.test(line));
        return matched.join('\n') || 'No matches';
    },
    mkdir: async (args) => {
        if (!args[0]) return 'Usage: mkdir <directory>';
        const path = fs.resolvePath(args[0], cwd);
        const result = await fs.mkdir(path, currentUser);
        return result.error ? result.error : `mkdir: created directory '${args[0]}'`;
    },
    touch: async (args) => {
        if (!args[0]) return 'Usage: touch <file>';
        const path = fs.resolvePath(args[0], cwd);
        const existing = await fs.readFile(path, currentUser);
        if (!existing.error) return '';
        const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
        if (!(await fs.hasPermission(currentUser, parentPath, 'write'))) return 'Permission denied';
        const result = await fs.writeFile(path, '', currentUser);
        return result.error || '';
    },
    vi: async (args) => {
        if (!args[0]) return 'Usage: vi <file>';
        const path = fs.resolvePath(args[0], cwd);
        const data = await fs.getAll();
        const entry = data[path];

        if (entry && entry.type === 'dir') return 'E495: Can\'t edit a directory';
        if (entry && !(await fs.hasPermission(currentUser, path, 'read'))) return 'Permission denied';

        if (entry) {
            const r = await fs.readFile(path, currentUser);
            viBuffer = r.error ? [''] : r.content.split('\n');
            if (viBuffer.length === 0) viBuffer = [''];
        } else {
            const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
            if (!(await fs.hasPermission(currentUser, parentPath, 'write'))) return 'Permission denied';
            viBuffer = [''];
        }

        viMode = true;
        viFile = path;
        viNormalMode = true;

        outputDiv.style.display = 'none';
        inputLine.style.display = 'none';
        viContainer.style.display = 'flex';
        viEditor.value = viBuffer.join('\n');
        viEditor.readOnly = true;
        viBar.style.display = 'none';
        viUpdateStatusbar();
        viEditor.focus();
        return '';
    },
    rm: async (args) => {
        if (!args[0]) return 'Usage: rm [-r] <path>';
        const recursive = args.includes('-r');
        const paths = args.filter(a => !a.startsWith('-'));
        if (!paths[0]) return 'Usage: rm [-r] <path>';

        const expanded = (await Promise.all(paths.map(p => expandGlob(p)))).flat();
        const results = await Promise.all(expanded.map(path => fs.rm(path, currentUser, recursive)));
        return results.map(r => r.error || '').filter(r => r).join('\n');
    },
    cd: async (args) => {
        const target = args[0] || `/home/${currentUser}`;
        const path = fs.resolvePath(target, cwd);
        const fsData = await fs.getAll();
        if (!fsData[path]) return `cd: ${target}: No such file or directory`;
        if (fsData[path].type !== 'dir') return `cd: ${target}: Not a directory`;
        if (!(await fs.hasPermission(currentUser, path, 'read'))) return `cd: ${target}: Permission denied`;
        cwd = path;
        updatePrompt();
        return '';
    },
    login: async (args) => {
        if (!args[0]) return 'Usage: login <username>';
        const homePath = `/home/${args[0]}`;
        const fsData = await fs.getAll();
        if (!fsData[homePath] || fsData[homePath].type !== 'dir') return `login: ${args[0]}: no home directory`;
        currentUser = args[0];
        cwd = homePath;
        updatePrompt();
        return `Logged in as ${currentUser}`;
    },
    init_fs: async (args) => {
        await idb.clear();
        await fs.init();
        return 'File system reinitialized.';
    }
};

async function executeCommand(cmdLine, heredocInput) {
    try {
        let outputFile = null;
        if (cmdLine.includes('>')) {
            const gtIndex = cmdLine.indexOf('>');
            outputFile = cmdLine.slice(gtIndex + 1).trim();
            cmdLine = cmdLine.slice(0, gtIndex).trim();
        }

        const pipeParts = cmdLine.split('|');
        let pipeInput = heredocInput || null;

        for (let i = 0; i < pipeParts.length; i++) {
            const part = pipeParts[i].trim();
            const tokens = part.split(/\s+/);
            const cmdName = tokens[0];
            const args = tokens.slice(1);

            if (!cmdName) { pipeInput = ''; continue; }

            if (commands[cmdName]) {
                const hasPipe = pipeInput !== null;
                const effectiveArgs = (hasPipe && cmdName !== 'echo')
                ? [pipeInput, ...args]
                : args;
                if (hasPipe) pipeActive = true;
                pipeInput = await commands[cmdName](effectiveArgs);
                pipeActive = false;
            } else {
                pipeInput = `command not found: ${cmdName}`;
            }
        }

        const lastResult = pipeInput;

        if (outputFile) {
            const path = fs.resolvePath(outputFile, cwd);
            const result = await fs.writeFile(path, lastResult ?? '', currentUser);
            return result.error ? result.error : '';
        }

        return lastResult ?? '';
    } catch (e) {
        return `System error: ${e.message}`;
    }
}

async function bootSequence() {
    inputLine.style.display = 'none';

    const bootLog = [
        { text: 'Linux version 6.1.0-portfolio (gcc@12.2.0) #1 SMP PREEMPT_DYNAMIC Mon Jun 15 2026', sleep: [0.02, 0.08] },
        { text: 'Command line: BOOT_IMAGE=/boot/vmlinuz-6.1.0-portfolio root=UUID=f47ac10b-58cc-4372-a567-0e02b2c3d479 ro quiet', sleep: [0.02, 0.06] },
        { text: 'x86/fpu: Supporting FXSAVE and XSAVE feature sets', sleep: [0.01, 0.04] },
        { text: 'x86/fpu: Enabled xstate features, context size is 1232 bytes', sleep: [0.01, 0.03] },
        { text: 'smpboot: CPU0: Intel(R) Core(TM) i7-9750H (family: 6, model: 158, stepping: 10)', sleep: [0.02, 0.05] },
        { text: 'smpboot: CPU1: Intel(R) Core(TM) i7-9750H (family: 6, model: 158, stepping: 10)', sleep: [0.02, 0.05] },
        { text: 'Memory: 16384K/16384K available (16384K kernel code, 0K reserved)', sleep: [0.01, 0.04] },
        { text: 'Unpacking initramfs...', sleep: [0.5, 1.2] },
        { text: 'Initramfs unpacked: 4096 bytes', sleep: [0.01, 0.03] },
        { text: 'input: AT Translated Set 2 keyboard as /devices/platform/i8042/serio0/input/input0', sleep: [0.05, 0.12] },
        { text: 'usbcore: Registered new interface driver usbhid', sleep: [0.03, 0.08] },
        { text: 'usb 1-1: new high-speed USB device number 2 using xhci_hcd', sleep: [0.1, 0.25] },
        { text: 'e1000: Intel(R) PRO/1000 Network Driver - version 7.3.21-k8-NAPI', sleep: [0.03, 0.07] },
        { text: 'e1000 0000:00:03.0 eth0: (PCI:33MHz:32-bit) 52:54:00:12:34:56', sleep: [0.02, 0.06] },
        { text: 'e1000 0000:00:03.0 eth0: Link is Up (1000Mbps / Full Duplex)', sleep: [0.2, 0.5] },
        { text: 'fbcon: Deferred console takeover', sleep: [0.02, 0.05] },
        { text: 'Console: switching to colour frame buffer device 128x48', sleep: [0.1, 0.3] },
        { text: 'portfolio_drv: loading out-of-tree module taints kernel.', sleep: [0.3, 0.8] },
        { text: 'portfolio_drv: module verification failed: signature and/or required key missing - tainting kernel', sleep: [0.03, 0.08] },
        { text: 'portfolio_drv: Portfolio Interactive Terminal Driver v1.0', sleep: [0.02, 0.06] },
        { text: 'EXT4-fs (sda1): mounted filesystem with ordered data mode. Quota mode: disabled.', sleep: [0.4, 1.0] },
        { text: 'EXT4-fs (sda2): mounted filesystem with ordered data mode. Quota mode: disabled.', sleep: [0.3, 0.8] },
        { text: 'Starting systemd...', sleep: [0.2, 0.4] },
        { text: 'systemd[1]: Reached target Local File Systems.', sleep: [0.03, 0.08] },
        { text: 'systemd[1]: Reached target Network.', sleep: [0.03, 0.08] },
        { text: 'systemd[1]: Started Console Getty on tty1.', sleep: [0.05, 0.1] },
        { text: 'Arch Linux 6.1.0-portfolio (tty1)', sleep: [0.02, 0.06] },
        { text: '', sleep: [0.02, 0.04] },
        { text: 'portfolio login: ', sleep: [0.01, 0.02] },
    ];

    const start = performance.now();

    for (const entry of bootLog) {
        const elapsed = (performance.now() - start) / 1000;
        const ts = elapsed.toFixed(6).padStart(10, ' ');
        print(`[${ts}] ${entry.text}`, 'boot-msg');
        if (entry.sleep) {
            const [min, max] = entry.sleep;
            const ms = (min + Math.random() * (max - min)) * 1000;
            await new Promise(resolve => setTimeout(resolve, ms));
        }
    }

    // Load real README.md content from disk into the filesystem
    try {
        const res = await fetch('README.md');
        if (res.ok) {
            const readme = await res.text();
    const fsData = await fs.getAll();
            if (fsData['/home/guest/README.md']) {
                fsData['/home/guest/README.md'].content = readme;
                await fs.save(fsData);
            }
        }
    } catch (_) {}

    outputDiv.innerHTML = '';
    inputLine.style.display = 'flex';
    updatePrompt();
    inputField.focus();
}

inputField.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
        if (multilineActive) {
            const line = inputField.value;
            inputField.value = '';
            print(`> ${line}`);

            if (line === multilineDelimiter) {
                multilineActive = false;
                updatePrompt();
                commandHistory.push(`${multilinePrefix} << ${multilineDelimiter}`);
                historyIndex = commandHistory.length;
                const result = await executeCommand(multilinePrefix, multilineBuffer.replace(/\n$/, ''));
                if (result) print(result);
            } else {
                multilineBuffer += line + '\n';
            }
            inputField.focus();
            return;
        }

        const commandLine = inputField.value.trim();
        inputField.value = '';

        print(`${promptSpan.textContent}${commandLine}`);

        if (commandLine) {
            const heredocMatch = commandLine.match(/<<\s*(\w+)/);
            if (heredocMatch) {
                const before = commandLine.slice(0, heredocMatch.index).trim();
                const after = commandLine.slice(heredocMatch.index + heredocMatch[0].length).trim();
                multilineActive = true;
                multilineDelimiter = heredocMatch[1];
                multilinePrefix = (before + ' ' + after).trim();
                multilineBuffer = '';
                updatePrompt();
                inputField.focus();
                return;
            }

            commandHistory.push(commandLine);
            historyIndex = commandHistory.length;
            const result = await executeCommand(commandLine);
            if (result) print(result);
        }
    } else if (e.key === 'ArrowUp') {
        if (!viMode && historyIndex > 0) {
            historyIndex--;
            inputField.value = commandHistory[historyIndex];
        }
        e.preventDefault();
    } else if (e.key === 'ArrowDown') {
        if (viMode) {
            e.preventDefault();
        } else if (historyIndex < commandHistory.length - 1) {
            historyIndex++;
            inputField.value = commandHistory[historyIndex];
        } else {
            historyIndex = commandHistory.length;
            inputField.value = '';
        }
        e.preventDefault();
    } else if (e.key === 'Tab') {
        if (viMode) { e.preventDefault(); return; }
        e.preventDefault();
        const input = inputField.value;
        const tokens = input.split(/\s+/);
        if (tokens.length === 1) {
            const partial = tokens[0];
            const matches = Object.keys(commands).filter(c => c.startsWith(partial));
            if (matches.length === 1) {
                inputField.value = matches[0] + ' ';
            }
        }
    }
});

viInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
        const cmd = viInput.value.trim();
        viInput.value = '';
        if (cmd) await processViCommand(cmd);
        e.preventDefault();
    } else if (e.key === 'Escape') {
        viNormalMode = true;
        viEditor.readOnly = true;
        viBar.style.display = 'none';
        viEditor.focus();
        viUpdateStatusbar();
        e.preventDefault();
    } else if (e.key === 'Tab' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
    }
});

viEditor.addEventListener('keydown', (e) => {
    if (!viMode) return;

    if (viNormalMode) {
        if (e.key === ':') {
            viEnterCommandMode();
            e.preventDefault();
        } else if (e.key === 'i') {
            viNormalMode = false;
            viEditor.readOnly = false;
            viUpdateStatusbar();
            e.preventDefault();
        } else if (e.key === 'x' || e.key === 'Delete') {
            const start = viEditor.selectionStart;
            if (start < viEditor.value.length) {
                viEditor.value = viEditor.value.slice(0, start) + viEditor.value.slice(start + 1);
            }
            viBuffer = viEditor.value.split('\n');
            e.preventDefault();
        } else if (e.key === 'd' && e.ctrlKey) {
            // Ctrl+D - skip
        } else if (e.key === 'Escape' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            // Allow cursor navigation in normal mode
        } else if (e.key === 'h') {
            viEditor.selectionStart = Math.max(0, viEditor.selectionStart - 1);
            viEditor.selectionEnd = viEditor.selectionStart;
            e.preventDefault();
        } else if (e.key === 'l') {
            viEditor.selectionStart = Math.min(viEditor.value.length, viEditor.selectionStart + 1);
            viEditor.selectionEnd = viEditor.selectionStart;
            e.preventDefault();
        } else if (e.key === 'j') {
            const pos = viEditor.selectionStart;
            const lines = viEditor.value.substr(0, pos).split('\n');
            const curLine = lines.length - 1;
            const col = lines[curLine].length;
            if (curLine < viBuffer.length - 1) {
                const nextLineOffset = pos + viBuffer[curLine + 1].length + 1;
                const targetCol = Math.min(col, viBuffer[curLine + 1].length);
                viEditor.selectionStart = nextLineOffset - viBuffer[curLine + 1].length + targetCol;
                viEditor.selectionEnd = viEditor.selectionStart;
            }
            e.preventDefault();
        } else if (e.key === 'k') {
            const pos = viEditor.selectionStart;
            const before = viEditor.value.substr(0, pos);
            const lines = before.split('\n');
            const curLine = lines.length - 1;
            const col = lines[curLine].length;
            if (curLine > 0) {
                const prevLineStart = before.length - lines[curLine].length - 1;
                const prevLineLen = viBuffer[curLine - 1].length;
                const targetCol = Math.min(col, prevLineLen);
                viEditor.selectionStart = prevLineStart - prevLineLen + targetCol;
                viEditor.selectionEnd = viEditor.selectionStart;
            }
            e.preventDefault();
        } else {
            e.preventDefault();
        }
    } else {
        // Insert mode — re-sync buffer on input
        requestAnimationFrame(() => {
            viBuffer = viEditor.value.split('\n');
            viUpdateStatusbar();
        });
        if (e.key === 'Escape') {
            viLeaveInsertMode();
            e.preventDefault();
        }
    }
});

viEditor.addEventListener('input', () => {
    if (viMode && !viNormalMode) {
        viBuffer = viEditor.value.split('\n');
        viUpdateStatusbar();
    }
});
