## 1. Application Source Files

- [x] 1.1 Update `package.json` — name, description, repository.url
- [x] 1.2 Update `src/index.js` — McpServer name, all env var reads (YTDLP_* → YT_MEDIA_INFO_*), comment text
- [x] 1.3 Update `src/logger.js` — defaultMeta.service
- [x] 1.4 Update `src/tools/extract-info.js`, `get-transcript.js`, `search-media.js` — env var reads (YTDLP_SERVICE_URL → YT_MEDIA_INFO_SERVICE_URL, YTDLP_USERNAME → YT_MEDIA_INFO_USERNAME, YTDLP_PASSWORD → YT_MEDIA_INFO_PASSWORD)
- [x] 1.5 Update `compose.yaml` — service names, image tags, container names, env vars
- [x] 1.6 Update `env.example` — all var names, header comment
- [x] 1.7 Update `Dockerfile` — no name refs to change, verify
- [x] 1.8 Update `Taskfile.yaml` — updated image tag, no other name refs

## 2. Documentation

- [x] 2.1 Update `README.md` — all references to server name, repo name, env vars, Docker names
- [x] 2.2 Update `AGENTS.md` — all references
- [x] 2.3 Update `openspec/changes/yt-dlp-mcp-server/` artifacts — proposal, design, specs (mcp-server-runtime, media-metadata-extraction, media-search, python-service, transcript-extraction), tasks — all name/env/Docker references

## 3. Verify

- [x] 3.1 `npm install` still clean (package.json changed)
- [x] 3.2 `node --check src/index.js` (new env var names)
- [x] 3.3 `eslint src/` passes
- [x] 3.4 `openspec validate --changes rename-to-yt-media-info-mcp` passes
- [x] 3.5 Smoke test: `ENABLE_SSE=1 YT_MEDIA_INFO_PORT=19425 node src/index.js` starts, `/health` returns 200
