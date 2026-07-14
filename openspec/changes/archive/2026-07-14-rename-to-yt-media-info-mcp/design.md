## Context

This is a pure naming change. The system's architecture, behavior, and interfaces remain identical. All changes are cosmetic/identity-level across code, config, and documentation.

## Decisions

### D1: Env var name length
`YT_MEDIA_INFO_*` is verbose (5-6 vars at ~15 chars each) but internally consistent with the repo name. Shorter alternatives (`YMI_*`, `YT_*`, `MI_*`) were considered but `YT_MEDIA_INFO_*` provides the clearest discoverability in `env.example` and Docker Compose `environment` blocks.

### D2: Docker names follow repo name
Docker images, services, and containers use `yt-media-info-mcp` (Node) and `yt-media-info-service` (Python). No `mcp` on the service suffix — the Python service is an implementation detail not directly exposed to MCP clients.

### D3: OpenSpec artifacts updated in place
The existing `yt-dlp-mcp-server` change is already committed and archived. A new change captures this rename. Previous artifacts are updated to reflect the new naming convention for consistency.

## Risks / Trade-offs

- [Breaking env var rename] → Minimal blast radius: `.env` is gitignored, only affects developers with local config. The `env.example` file is authoritative.
- [Merge conflicts if other changes in flight] → No other active changes in the repo; rename is safe.
