## Context

This is a greenfield project: an MCP server that exposes yt-dlp's metadata-extraction capabilities to AI assistants. The reference implementation is `bartivs/jobspy-mcp-server`, a Node.js MCP server that wraps a Python tool (JobSpy) for job search. We adopt jobspy's architectural *style* (Node MCP server + Express + Zod + Winston + dual stdio/SSE transport + Docker Compose) but deviate on the Node↔Python wire protocol: where jobspy spawns `docker run --rm` per request, we use a **persistent Python HTTP service**, because metadata enrichment is chatty (multiple calls per conversation) and per-call cold start (~1-2s of `import yt_dlp` + extractor loading) would dominate latency.

yt-dlp is a Python library/CLI supporting ~1800 sites. Its `YoutubeDL.extract_info(url, download=False)` returns a rich info dict (~100+ fields for YouTube). We curate a useful subset at the top level of our response and nest the full sanitized dict under `raw`. The server does NOT download media — it is a metadata-enrichment step designed to sit alongside search tools in an information-gathering pipeline.

## Goals / Non-Goals

**Goals:**
- Expose 3 MCP tools (`extract_info`, `get_transcript`, `search_media`) and 2 prompts (`analyze_video`, `summarize_transcript`) to AI assistants.
- Keep per-call latency low by running a persistent Python service that imports yt-dlp once at startup and caches extractors.
- Match jobspy's transport/runtime style (stdio + SSE + `/api`, Express, Winston, Zod, `.env`, Taskfile, AGENTS.md).
- Return curated + raw metadata with snake_case field naming (matching yt-dlp native), ISO 8601 dates.
- Support optional two-layer auth: yt-dlp site username/password and a bearer API key for our HTTP endpoints.
- Ship as a two-container Docker Compose deployment with healthcheck + `depends_on`.

**Non-Goals:**
- Downloading media files (no ffmpeg, no merge, no post-processing, no output volumes). Out of scope for v1.
- Cookie-from-browser support. Out of scope for v1.
- Rate limiting. Out of scope for v1.
- Caching of extracted info across calls. Out of scope for v1 (each call re-extracts).
- A plugin/extension system. Out of scope.

## Decisions

### D1: Persistent Python HTTP service over `docker run --rm`
jobspy uses `execSync("docker run --rm jobspy <args>")` per request. We instead run a long-lived FastAPI/uvicorn process that imports yt-dlp at startup. Rationale: jobspy is a one-shot scraper (one call per search); we are a chatty metadata extractor (info → maybe transcript → maybe search → info again). Per-call cold start (~1-2s) would be paid 5+ times per conversation. A persistent service pays it once and keeps extractors in memory. Alternatives considered: `docker run --rm` (rejected — cold start dominates); direct yt-dlp CLI binary (rejected — less control over output shaping, still cold per call).

### D2: FastAPI + uvicorn for the Python service
FastAPI gives Pydantic request models that parallel our Zod schemas on the Node side (nice symmetry), automatic `/docs` Swagger UI for debugging the service in isolation, and runs sync `def` endpoints in a threadpool automatically (yt-dlp's `extract_info` is blocking/synchronous). Alternatives: Flask + waitress (simpler, but no auto-docs, no Pydantic symmetry); Starlette alone (too manual).

### D3: HTTP over Docker bridge network (no Docker socket mount)
The Node container calls `http://yt-dlp-service:8000/<endpoint>`. No `/var/run/docker.sock` mount is required (unlike jobspy). This removes a security surface and a dependency on docker-cli in the Node image. The Python service is `expose`-only (not `ports`) — internal to the compose network.

### D4: Two containers, healthcheck + `depends_on`
`compose.yaml` defines `yt-dlp-service` (Python) with a `/health` healthcheck, and `yt-dlp-mcp-server` (Node) with `depends_on: { condition: service_healthy }`. This avoids startup races where Node tries to call Python before it is ready. Names are descriptive (`yt-dlp-service`, `yt-dlp-mcp-server`) rather than terse.

### D5: Three tools, curated + raw output
- `extract_info(url, include_raw?)` → curated fields + nested `raw` (full sanitized info dict, omittable via `include_raw: false`).
- `get_transcript(url, language?, timestamps?)` → subtitle segments (optional) + concatenated `full_text`.
- `search_media(query, limit?, platform?)` → list of candidate results with minimal metadata. Supplementary to external search tools.

Curated fields are snake_case, ISO 8601 dates. Format information is summarized at top level (`formats_summary`) with raw formats inside `raw`. Thumbnails returned as URLs only, plus a convenience `thumbnail` field (best quality).

### D6: Two-layer optional auth
- Layer 1 (yt-dlp site auth): optional `username`/`password` tool params, OR `YTDLP_USERNAME`/`YTDLP_PASSWORD` env defaults. Passed into `YoutubeDL` opts.
- Layer 2 (our server): optional `YTDLP_API_KEY` env var. If set, HTTP endpoints (`/api`, `/sse`, `/messages`) require `Authorization: Bearer <key>`. stdio mode is unaffected (local, no HTTP). If unset, no auth.

### D7: Best-effort error handling
Full extraction failure → MCP standard `{ isError: true, error: { message, code } }`. Missing fields → returned as `null`. Playlist with some failed entries → successful entries returned plus a `failures: []` array. No hard failure on partial data.

## Risks / Trade-offs

- [Persistent service memory growth] → Mitigation: each request creates a fresh `YoutubeDL()` instance (no global ydl reuse); consider a future TTL cache. For v1, monitor memory; restart policy `unless-stopped` covers leaks.
- [yt-dlp extractor breakage (sites change)] → Mitigation: pin a yt-dlp version in `requirements.txt` but document the upgrade path (`pip install -U "yt-dlp[default]"`). Best-effort error handling returns what we got.
- [FastAPI/uvicorn added dependency surface vs jobspy's stdout-parsing] → Mitigation: offset by auto `/docs` aiding debugging; Pydantic models double as request validation.
- [Auth API key in committed `.env` defaults] → Mitigation: default `YTDLP_API_KEY` is empty (auth disabled); document that users should override `.env` or use a non-committed `.env.local`. Never log the key.
- [snake_case output differs from jobspy's camelCase] → Mitigation: this is intentional and matches yt-dlp native; document in README. No `change-case-object` dependency needed.
- [Cold start of the Python service on first `compose up`] → Mitigation: healthcheck prevents Node from calling before ready; first request after startup is the only "warm-up" cost.
- [Some sites require cookies/JS impersonation and will fail] → Mitigation: best-effort errors; document known limitations. `curl-cffi` not included in v1 but can be added as an extra later.
