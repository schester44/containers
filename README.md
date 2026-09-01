# container-tui

A terminal UI for [Apple containers](https://github.com/apple/container). Lists containers and lets you view logs, inspect, start, stop, kill, and delete them.

## Requirements

- macOS with the `container` CLI (`brew install container`), services running (`container system start`)
- Node.js 20+
- Yarn

## Usage

```bash
yarn install
yarn start
```

The list refreshes every 2 seconds and shows state, IP, CPUs, memory, and uptime.

### Keys

**List view**

| Key | Action |
|-----|--------|
| `↑`/`↓` or `k`/`j` | Select container |
| `⏎` / `i` | Inspect (JSON) |
| `l` | Logs (follows tail) |
| `s` | Stop |
| `x` | Kill (confirms first) |
| `u` | Start a stopped container |
| `d` | Delete a stopped container (confirms first) |
| `r` | Refresh |
| `q` | Quit |

**Logs / inspect view**

| Key | Action |
|-----|--------|
| `↑`/`↓`, `PgUp`/`PgDn` | Scroll |
| `g` | Top |
| `G` / `f` | Follow tail |
| `q` / `esc` | Back |
