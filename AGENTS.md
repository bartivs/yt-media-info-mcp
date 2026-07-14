# yt-media-info MCP — Agent Guide

## Quick start

```bash
npm install
npm start               # stdio mode (for Claude Desktop)
ENABLE_SSE=1 npm start  # SSE mode (Express on :9423)
npm run dev             # nodemon auto-restart
npm run lint            # ESLint flat config
```

## Architecture

- **Single ESM package** (`"type": "module"`). Entrypoint: `src/index.js`.
- Wraps the **Python yt-dlp library** via a **persistent FastAPI HTTP service** (`yt-dlp-service`), not via `docker run --rm`. The service imports yt-dlp once at startup and caches extractors.
- **Two transport modes** controlled by `ENABLE_SSE` env var:
  - **stdio** (`ENABLE_SSE=0`, default): connect via `StdioServerTransport` — used by Claude Desktop.
  - **SSE** (`ENABLE_SSE=1`): Express on `YT_MEDIA_INFO_HOST:YT_MEDIA_INFO_PORT` (default `0.0.0.0:9423`). Endpoints: `GET /sse`, `POST /messages`, `POST /api`, `GET /health`, `GET /` (cookie upload form), `POST /upload-cookies`, `POST /delete-cookies`.
- `POST /api` is a shortcut that calls the Python service directly for a specific tool (bypasses MCP protocol). Usage: `{ "tool": "extract_info", "args": { "url": "..." } }`.
- **Three MCP tools**: `extract_info`, `get_transcript`, `search_media`.
- **Two MCP prompts**: `analyze_video`, `summarize_transcript`.
- Optional bearer API key auth (via `YT_MEDIA_INFO_API_KEY` env var) protects HTTP endpoints in SSE mode. stdio mode is unaffected.
- **Docker Compose** deployment: two containers (`yt-dlp-service` + `yt-media-info-mcp`) on a bridge network with healthcheck + `depends_on`. No host Docker socket mount required.

## Key files

| Path | Role |
|------|------|
| `src/index.js` | Server bootstrap, transport setup, graceful shutdown, direct `/api` handler, cookie upload routes and helpers |
| `src/tools/extract-info.js` | `extract_info` MCP tool (POSTs to Python `/info`) |
| `src/tools/get-transcript.js` | `get_transcript` MCP tool (POSTs to Python `/transcript`) |
| `src/tools/search-media.js` | `search_media` MCP tool (POSTs to Python `/search`) |
| `src/schemas/extractInfoSchema.js` | Zod param schema for `extract_info` |
| `src/schemas/transcriptSchema.js` | Zod param schema for `get_transcript` |
| `src/schemas/searchSchema.js` | Zod param schema for `search_media` |
| `src/sseManager.js` | SSE transport lifecycle + progress notifications |
| `src/prompts/` | MCP prompt templates (`analyze_video`, `summarize_transcript`) |
| `src/logger.js` | Winston logger (JSON format, colorized console transport) |
| `service/main.py` | FastAPI application with `/health`, `/info`, `/transcript`, `/search` endpoints |
| `service/requirements.txt` | Python dependencies: `yt-dlp[default]`, `fastapi`, `uvicorn[standard]` |
| `compose.yaml` | Three-container Docker Compose with healthcheck + bridge network (plus optional cookie-bot with `--profile cookies`) |
| `.env.example` | Default environment configuration (committed; copy to `.env` and customize) |

## Conventions

- **Output field naming**: snake_case (matches yt-dlp's native format — no camelCase conversion).
- **Date format**: ISO 8601 strings. yt-dlp's `upload_date` (`YYYYMMDD`) is normalized (e.g. `2024-01-15`). Unix timestamps are also converted to ISO strings.
- **Error handling**: Best-effort. Complete failures return `{ "isError": true, "error": { "message", "code" } }`. Partial playlist failures return successful entries + `failures: []`.

## Gotchas

- **No ffmpeg**: This server does NOT download media. It is an info-extraction and transcript tool. ffmpeg is not required and not included in the Python image.
- **Python service cold start**: The first request after `docker compose up` will wait for the health check. Subsequent calls are warm.
- **API key**: Set `YT_MEDIA_INFO_API_KEY` in `.env` (copy from `.env.example` first). Default is empty (no auth). stdio mode is never affected.
- **Username/password**: Per-call `username`/`password` params override `.env.example` defaults (`YT_MEDIA_INFO_USERNAME`/`YT_MEDIA_INFO_PASSWORD`). Passed through to yt-dlp's `YoutubeDL` opts for site authentication.
- **`.env.example` is committed** with safe defaults. Copy to `.env` and customize. Use `.env.local` for secrets that should not be tracked.
- **Search platform mapping**: `youtube` → `ytsearch:`, `google_videos` → `gvsearch:`.
- **Transcript language fallback**: If the requested language is unavailable, the first available language is returned. The response includes the actual language used.
- **No caching**: Each `extract_info` call re-extracts metadata from the URL. No in-memory caching in v1.
- **Supported sites**: All ~1800 yt-dlp extractors work out of the box. No cookie/JWT authentication for private videos in v1.

## cookie-bot (optional sidecar)

A headless Playwright+Chromium sidecar that maintains fresh session cookies for
YouTube, Vimeo, and Twitch. Cookies are written atomically to a shared Docker
volume and consumed by the Python service on every yt-dlp call.

### Architecture

- **Directory**: `cookie-bot/cookie_bot/` — Python package
- **Dockerfile**: `cookie-bot/Dockerfile` — base `mcr.microsoft.com/playwright/python:v1.53.0`
- **Service name**: `cookie-bot` (Compose profile `--profile cookies`)
- **CDP port**: Port `9222` is exposed for remote debugging during `--setup` mode
- **Shared volume**: `cookies-data` named volume (ro mount on yt-media-info-service, rw on cookie-bot)
- **Cookie file**: `/data/cookies.txt` (Netscape format, read by yt-dlp as `cookiefile`)
- **Session persistence**: Playwright `storage_state()` saved to `/data/browser-state.json`

### Environment variables

All cookie-related vars are **optional**. The system works without cookies.

| Variable | Used by | Description |
|----------|---------|-------------|
| `YT_MEDIA_INFO_COOKIES_FILE` | Python service | Path to Netscape cookie file on shared volume |
| `BOT_REFRESH_INTERVAL` | cookie-bot | Seconds between refresh cycles (default 14400) |
| `GOOGLE_EMAIL` / `PASSWORD` | cookie-bot | Google account credentials |
| `GOOGLE_TOTP_SECRET` | cookie-bot | TOTP seed for 2FA (optional) |
| `VIMEO_EMAIL` / `PASSWORD` | cookie-bot | Vimeo account credentials |
| `TWITCH_EMAIL` / `PASSWORD` | cookie-bot | Twitch account credentials |
| `TWITCH_TOTP_SECRET` | cookie-bot | TOTP seed for 2FA (optional) |

### Setup steps

1. Configure provider credentials in `.env`
2. Start with profile: `docker compose --profile cookies up -d`
3. Run interactive setup: `docker compose --profile cookies run --service-ports cookie-bot --setup`
4. Connect via `chrome://inspect` to `<SERVER_IP>:9222` (e.g. `192.168.1.20:9222`), log in, press Enter in terminal
5. Bot runs automatically, refreshing cookies every 4 hours

### Gotchas

- **CAPTCHA limitation**: Automated login cannot solve CAPTCHAs. Run `--setup` for interactive login.
- **Playwright image size**: ~1.2 GB. Gated behind `--profile cookies` to avoid pulling by default.
- **CDP setup requirement**: First deployment requires a `--setup` run. The bot can't bootstrap itself without help.
- **Vimeo no 2FA**: Vimeo provider does not include 2FA support (Vimeo rarely uses it).
- **Session expiry**: If automated re-login fails, re-run `--setup` to establish a fresh session.
- **Cookie file staleness**: If cookies expire and the bot can't refresh, yt-dlp falls back to cookieless behaviour (same as current).

### Web upload as seed path

The MCP server's web upload form at `http://<host>:<port>/` (default `http://localhost:9423/`) is the recommended way to seed the initial cookie file before the cookie-bot takes over automated refreshes. Upload a `cookies.txt` exported from your browser, then let the bot handle periodic refreshes.

To seed cookies before starting the bot:

1. Export cookies: `yt-dlp --cookies-from-browser chrome --cookies cookies.txt`
2. Navigate to `http://localhost:9423/`
3. Upload the file — it's written to `/data/cookies.txt` on the shared volume
4. Start the cookie-bot: `docker compose --profile cookies up -d`

The bot will pick up the existing cookies and begin its refresh cycle.
