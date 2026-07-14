## Why

The repo name `yt-dlc-mcp-docker` references the inactive `yt-dlc` fork, includes "docker" (an implementation detail), and doesn't describe what the tool does. We're adopting `yt-media-info-mcp` — a name that describes the value proposition (extracts media info) with a `yt` prefix that signals lineage from the `yt-dlp` ecosystem.

## What Changes

- Repo name: `yt-dlc-mcp-docker` → `yt-media-info-mcp`
- npm package name: `yt-dlp-mcp-server` → `yt-media-info-mcp`
- MCP server identity: "yt-dlp MCP Server" → "yt-media-info MCP"
- Env var prefix: `YTDLP_*` → `YT_MEDIA_INFO_*` (**BREAKING** for anyone with existing config)
- Docker images: `yt-dlp-mcp`, `yt-dlp-service` → `yt-media-info-mcp`, `yt-media-info-service`
- Docker service & container names: follow the new image names
- Logger service label: `yt-dlp-mcp-server` → `yt-media-info-mcp`
- Package description, repository URL, all documentation references updated

## Capabilities

No new capabilities — this is a naming-only change across all existing artifacts.

### New Capabilities

None — rename only.

### Modified Capabilities

All existing specs (media-metadata-extraction, transcript-extraction, media-search, mcp-server-runtime, python-service) — env var names, server identity, and Docker references change. No behavioral requirements change.

## Impact

- **All application files** with name/env references: `package.json`, `src/index.js`, `src/logger.js`, `src/tools/*.js`, `compose.yaml`, `env.example`, `README.md`, `AGENTS.md`
- **All OpenSpec artifacts** from the `yt-dlp-mcp-server` change: proposal, design, 5 specs, tasks
- **Breaking**: `YTDLP_*` env vars renamed to `YT_MEDIA_INFO_*` — anyone with an existing `.env` must update
- **No behavioral change** — this is purely a naming/identity change
