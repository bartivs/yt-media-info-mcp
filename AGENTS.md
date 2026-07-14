# yt-dlp MCP Server — Agent Guide

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
  - **SSE** (`ENABLE_SSE=1`): Express on `YTDLP_HOST:YTDLP_PORT` (default `0.0.0.0:9423`). Endpoints: `GET /sse`, `POST /messages`, `POST /api`, `GET /health`.
- `POST /api` is a shortcut that calls the Python service directly for a specific tool (bypasses MCP protocol). Usage: `{ "tool": "extract_info", "args": { "url": "..." } }`.
- **Three MCP tools**: `extract_info`, `get_transcript`, `search_media`.
- **Two MCP prompts**: `analyze_video`, `summarize_transcript`.
- Optional bearer API key auth (via `YTDLP_API_KEY` env var) protects HTTP endpoints in SSE mode. stdio mode is unaffected.
- **Docker Compose** deployment: two containers (`yt-dlp-service` + `yt-dlp-mcp-server`) on a bridge network with healthcheck + `depends_on`. No host Docker socket mount required.

## Key files

| Path | Role |
|------|------|
| `src/index.js` | Server bootstrap, transport setup, graceful shutdown, direct `/api` handler |
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
| `compose.yaml` | Two-container Docker Compose with healthcheck + bridge network |
| `.env` | Default environment configuration (committed) |

## Conventions

- **Output field naming**: snake_case (matches yt-dlp's native format — no camelCase conversion).
- **Date format**: ISO 8601 strings. yt-dlp's `upload_date` (`YYYYMMDD`) is normalized (e.g. `2024-01-15`). Unix timestamps are also converted to ISO strings.
- **Error handling**: Best-effort. Complete failures return `{ "isError": true, "error": { "message", "code" } }`. Partial playlist failures return successful entries + `failures: []`.

## Gotchas

- **No ffmpeg**: This server does NOT download media. It is an info-extraction and transcript tool. ffmpeg is not required and not included in the Python image.
- **Python service cold start**: The first request after `docker compose up` will wait for the health check. Subsequent calls are warm.
- **API key**: Set `YTDLP_API_KEY` in `.env` (or better, `.env.local`) to enable bearer auth on HTTP endpoints. Default is empty (no auth). stdio mode is never affected.
- **Username/password**: Per-call `username`/`password` params override `.env` defaults (`YTDLP_USERNAME`/`YTDLP_PASSWORD`). Passed through to yt-dlp's `YoutubeDL` opts for site authentication.
- **`.env` is committed** with safe defaults. Override via `.env.local` (not committed).
- **Search platform mapping**: `youtube` → `ytsearch:`, `google_videos` → `gvsearch:`.
- **Transcript language fallback**: If the requested language is unavailable, the first available language is returned. The response includes the actual language used.
- **No caching**: Each `extract_info` call re-extracts metadata from the URL. No in-memory caching in v1.
- **Supported sites**: All ~1800 yt-dlp extractors work out of the box. No cookie/JWT authentication for private videos in v1.
