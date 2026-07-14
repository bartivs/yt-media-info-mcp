## Why

There is no MCP server that exposes yt-dlp's metadata extraction capabilities to AI assistants. When an AI finds a media URL (via web search or otherwise), it has no structured way to enrich that URL with rich media metadata — title, description, duration, chapters, available subtitles, formats, statistics. This change fills that gap: a yt-dlp-backed MCP server designed to sit alongside other search tools as a metadata-enrichment step in an information-gathering pipeline.

## What Changes

- Add a new MCP server (`yt-dlp-mcp-server`) built in the style of the reference `jobspy-mcp-server` (Node.js + Express + @modelcontextprotocol/sdk, Zod schemas, Winston logging, dual stdio/SSE transports, Docker Compose deployment).
- Wrap yt-dlp as a **persistent Python HTTP service** (FastAPI + uvicorn) rather than `docker run --rm` per call, because metadata enrichment is chatty (multiple calls per conversation) and cold-start per call would dominate latency.
- Expose **3 MCP tools**: `extract_info` (rich curated metadata + raw info dict), `get_transcript` (subtitle text), `search_media` (supplementary discovery via yt-dlp's search syntax).
- Expose **2 MCP prompts**: `analyze_video`, `summarize_transcript`.
- Provide a direct `POST /api` shortcut endpoint (bypassing MCP), mirroring jobspy.
- Two-layer optional auth: yt-dlp site username/password (for protected content) and an optional bearer API key for the server's own HTTP endpoints.
- Two-container Docker Compose shape with a bridge network, healthcheck, and `depends_on`.

## Capabilities

### New Capabilities
- `media-metadata-extraction`: Extract curated + raw structured metadata from a media URL using yt-dlp's extractors across ~1800 supported sites.
- `transcript-extraction`: Fetch subtitle/caption text (with optional timestamps and full concatenated text) for a media URL.
- `media-search`: Supplementary discovery tool that searches supported platforms (e.g. ytsearch) and returns a list of candidate media URLs with minimal metadata.
- `mcp-server-runtime`: The Node.js MCP server itself — transport modes (stdio/SSE/api), environment configuration, logging, SSE progress notifications, optional bearer API key auth, and the HTTP contract with the Python service.
- `python-service`: The persistent FastAPI backend that imports yt-dlp once at startup, caches extractors, and exposes `/info`, `/transcript`, `/search`, `/health` over HTTP to the Node server.

### Modified Capabilities
<!-- None — this is a greenfield project; openspec/specs/ is currently empty. -->

## Impact

- **New code**: `src/` (Node MCP server), `service/` (Python FastAPI app), `compose.yaml`, `Taskfile.yaml`, `package.json`, `service/requirements.txt`, `service/Dockerfile`, `.env`, `AGENTS.md`, `README.md`.
- **Dependencies (Node)**: `@modelcontextprotocol/sdk`, `express`, `cors`, `zod`, `winston`.
- **Dependencies (Python)**: `yt-dlp[default]`, `fastapi`, `uvicorn[standard]`.
- **Docker**: Two images built from repo — `yt-dlp-service` (python:3.12-slim based) and `yt-dlp-mcp-server` (node:20-alpine based). No host Docker socket mount required (HTTP between containers, not Docker-socket subprocess).
- **Configuration**: `.env` with `ENABLE_SSE`, `YTDLP_PORT`, `YTDLP_HOST`, `YTDLP_SERVICE_URL`, `YTDLP_API_KEY`, `YTDLP_USERNAME`, `YTDLP_PASSWORD`, `LOG_LEVEL`.
- **No breaking changes** — greenfield repository (`openspec/specs/` is empty, no existing code).
