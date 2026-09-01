# container-tui

A minimal Docker-Desktop-style TUI for [Apple containers](https://github.com/apple/container), built with React Ink.

## Requirements

- `container` CLI (`brew install container`) with services running (`container system start`)
- Node.js 20+

## Run

```bash
yarn install
yarn start          # or: yarn tsx src/main.tsx
```

## Keys

### List view
| Key | Action |
|-----|--------|
| `↑`/`↓` or `k`/`j` | Select container |
| `⏎` / `i` | Inspect (full JSON) |
| `l` | Logs (follows tail, auto-refreshes) |
| `s` | Stop (graceful) |
| `x` | Kill (SIGKILL, with confirm) |
| `u` | Start a stopped container |
| `d` | Delete a stopped container (with confirm) |
| `r` | Refresh now |
| `q` | Quit |

### Logs / Inspect view
| Key | Action |
|-----|--------|
| `↑`/`↓`, `PgUp`/`PgDn` | Scroll |
| `g` | Jump to top |
| `G` / `f` | Follow tail |
| `q` / `esc` | Back to list |

The container list auto-refreshes every 2 seconds and shows state, IP, CPUs, memory, and uptime.
