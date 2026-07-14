## 1. Project Scaffolding

- [ ] 1.1 Create `package.json` (ESM, `"type": "module"`, scripts: start, dev, lint) with dependencies `@modelcontextprotocol/sdk`, `express`, `cors`, `zod`, `winston`
- [ ] 1.2 Create `.env` with defaults: `ENABLE_SSE=0`, `YTDLP_PORT=9423`, `YTDLP_HOST=0.0.0.0`, `YTDLP_SERVICE_URL=http://yt-dlp-service:8000`, `YTDLP_API_KEY=`, `YTDLP_USERNAME=`, `YTDLP_PASSWORD=`, `LOG_LEVEL=info`
- [ ] 1.3 Create `eslint.config.cjs` (flat config) and `.gitignore`
- [ ] 1.4 Create `Taskfile.yaml` mirroring jobspy (start, build aliases)

## 2. Python Service (service/)

- [ ] 2.1 Create `service/requirements.txt` with `yt-dlp[default]`, `fastapi`, `uvicorn[standard]`
- [ ] 2.2 Create `service/Dockerfile` based on `python:3.12-slim`, install requirements, run uvicorn on port 8000
- [ ] 2.3 Implement `service/main.py` FastAPI app with `GET /health`
- [ ] 2.4 Implement `POST /info` endpoint: build `YoutubeDL(opts)`, call `extract_info(url, download=False)`, `sanitize_info`, curate fields, normalize dates to ISO 8601, include `raw` unless `include_raw=false`, build `formats_summary`, handle best-effort errors + playlist `failures`
- [ ] 2.5 Implement `POST /transcript` endpoint: extract info, select subtitle language (with fallback), fetch subtitle content, build `subtitles` segments + `full_text`, honor `timestamps` flag, return no-subtitles error when applicable
- [ ] 2.6 Implement `POST /search` endpoint: map `platform` to yt-dlp search prefix, build `ytsearch{limit}:query` style URL, extract flat playlist info, map entries to minimal result metadata, enforce limit cap (max 50)
- [ ] 2.7 Add per-request `YoutubeDL(opts)` construction (no global reuse), pass-through `username`/`password` to opts, snake_case output

## 3. Node MCP Server (src/)

- [ ] 3.1 Create `src/logger.js` (Winston, JSON + colorized console, `LOG_LEVEL` configurable) mirroring jobspy
- [ ] 3.2 Create `src/sseManager.js` (SSE transport lifecycle + progress notifications) mirroring jobspy
- [ ] 3.3 Create `src/schemas/extractInfoSchema.js` (Zod raw shapes for `extract_info` params: url, include_raw, username, password)
- [ ] 3.4 Create `src/schemas/transcriptSchema.js` (Zod raw shapes: url, language, timestamps, username, password)
- [ ] 3.5 Create `src/schemas/searchSchema.js` (Zod raw shapes: query, limit, platform)
- [ ] 3.6 Create `src/tools/extract-info.js` (tool registration + handler that POSTs to `${YTDLP_SERVICE_URL}/info` and returns MCP content)
- [ ] 3.7 Create `src/tools/get-transcript.js` (tool registration + handler that POSTs to `${YTDLP_SERVICE_URL}/transcript`)
- [ ] 3.8 Create `src/tools/search-media.js` (tool registration + handler that POSTs to `${YTDLP_SERVICE_URL}/search`)
- [ ] 3.9 Create `src/tools/index.js` re-exporting the three tools
- [ ] 3.10 Create `src/prompts/analyze-video.js` and `src/prompts/summarize-transcript.js` (Zod raw shape prompt schemas), plus `src/prompts/index.js`

## 4. Server Bootstrap & Transports (src/index.js)

- [ ] 4.1 Create `src/index.js`: instantiate `McpServer`, register prompts and tools, wire `SseManager`
- [ ] 4.2 Implement stdio transport path (`ENABLE_SSE=0`) using `StdioServerTransport`
- [ ] 4.3 Implement SSE transport path (`ENABLE_SSE=1`): Express + cors + `/sse` + `/messages` + `/health` + `/api` (direct shortcut) mirroring jobspy
- [ ] 4.4 Implement optional bearer API key middleware: when `YTDLP_API_KEY` non-empty, require `Authorization: Bearer <key>` on `/api`, `/sse`, `/messages`; stdio unaffected
- [ ] 4.5 Implement graceful shutdown (`SIGINT`/`SIGTERM`): disconnect transports, close HTTP server, exit 0
- [ ] 4.6 Add SSE progress notifications to tool handlers (SSE mode only)

## 5. Docker Compose

- [ ] 5.1 Create `compose.yaml` with `yt-dlp-service` (build `./service`, expose 8000, `/health` healthcheck, bridge network) and `yt-dlp-mcp-server` (build `.`, ports `${YTDLP_PORT}:9423`, `depends_on` with `condition: service_healthy`, env_file `.env`, same network)
- [ ] 5.2 Create root `Dockerfile` for the Node server (node:20-alpine, `npm install --omit=dev`, run `src/index.js`)
- [ ] 5.3 Verify `docker compose up -d` brings both services up healthy and Node waits for Python readiness

## 6. Documentation

- [ ] 6.1 Create `AGENTS.md` documenting architecture, key files, gotchas (mirroring jobspy's AGENTS.md)
- [ ] 6.2 Create `README.md` with features, prerequisites, install, env var table, usage (stdio + SSE + curl `/api`), Docker Compose, Claude Desktop / Claude Code / LiteLLM connection examples, and the 3 tools' parameter tables
- [ ] 6.3 Document the snake_case output convention, ISO 8601 dates, and that media downloading is out of scope for v1

## 7. Validation & Smoke Tests

- [ ] 7.1 Validate the change: `openspec validate --change yt-dlp-mcp-server`
- [ ] 7.2 Smoke test stdio mode against Claude Desktop config (or a stdio MCP client)
- [ ] 7.3 Smoke test SSE mode: `curl /health`, `curl -X POST /api` for each of the 3 tools, confirm SSE connection via `/sse` + `/messages`
- [ ] 7.4 Smoke test API key auth: with `YTDLP_API_KEY` set, confirm 401 without token and 200 with token
- [ ] 7.5 Verify best-effort error handling: an unsupported/private URL returns an MCP error response; a playlist with failing entries returns `failures[]`
