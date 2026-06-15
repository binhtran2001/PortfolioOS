# PortfolioOS

An interactive terminal-based portfolio website built with **pure HTML, CSS & JavaScript**. It simulates a Linux-like shell environment entirely in the browser using `localStorage` for persistence.

## Features

- **Terminal UI**: Full terminal emulator with command prompt, history (`ArrowUp`/`ArrowDown`), and tab completion
- **Filesystem**: Hierarchical directory structure with `mkdir`, `rm`, `cd`, `ls`, and `pwd` commands
- **Permissions**: File/directory ownership with read/write access control tied to user login
- **User Accounts**: `login` command to switch users (admin has full access)
- **File Operations**: `cat`, `touch`, `echo` with redirect (`>`), and pipe (`|`) support
- **grep**: Search file content or pipe output with `-i` flag for case-insensitive mode
- **vi Editor**: Minimal vi-style editor with normal mode (`i`, `x`, `h/j/k/l`), insert mode, and command mode (`:w`, `:q`, `:wq`)
- **Markdown Rendering**: `view` command renders `.md` files with styled headings, code blocks, bold/italic, links, and lists
- **Boot Sequence**: Realistic kernel boot simulation with timed messages and actual timestamps
- **Glob Expansion**: `rm -r /path/to/dir/*` removes directory contents without deleting the directory

## Quick Start

Open `index.html` in any modern browser. No server or build step required.

```
Type "help" to see all available commands.
Type "tips" for a beginner-friendly guide.
```

## Commands

| Command | Description |
|---------|-------------|
| `help` | Show all commands |
| `tips` | Beginner guide |
| `ls [path]` | List directory contents |
| `cat <file>` | Print file contents |
| `view <file>` | Render markdown file |
| `vi <file>` | Edit file (minimal vi) |
| `echo <text>` | Print or redirect (`>`) text |
| `touch <file>` | Create empty file |
| `grep [-i] <pattern> <file>` | Search for pattern |
| `mkdir <dir>` | Create directory |
| `rm [-r] <path>` | Remove file or directory |
| `cd [path]` | Change directory |
| `pwd` | Print working directory |
| `whoami` | Show current user |
| `login <user>` | Switch user |
| `init_fs` | Reset filesystem to defaults |

## Project Structure

- `index.html` — Terminal layout and DOM elements
- `style.css` — Terminal styling, markdown themes, vi editor styles
- `script.js` — All logic: filesystem, commands, vi, boot sequence, markdown renderer

## License

MIT
