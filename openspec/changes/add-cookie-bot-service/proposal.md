## Why

YouTube (and increasingly other platforms like Vimeo, Twitch) serve sign-in walls and bot challenges during metadata extraction. yt-dlp requires valid session cookies to bypass this detection, but the current service has no mechanism to inject cookies. A headless cookie-bot sidecar using Playwright+Chromium can automatically maintain fresh cookies for configured providers, keeping all three MCP tools working reliably.

## What Changes

- **New `cookie-bot/` directory** — Playwright+Chromium sidecar that periodically logs into configured providers and exports session cookies in Netscape format to a shared Docker volume
- **Provider-based credential model** — each service (Google/YouTube, Vimeo, Twitch) gets a standardized login flow, controlled by optional env vars
- **Session persistence** — bot saves Playwright browser context state after first login and restores it on subsequent cycles, minimizing interactive login attempts
- **`--setup` mode** — interactive CDP workflow so users can complete CAPTCHA/2FA manually in their own browser on first run
- **Shared cookie volume** — cookies written atomically to a named volume readable by the existing Python service
- **Python service change** — `_build_ydl_opts()` reads `YT_MEDIA_INFO_COOKIES_FILE` from env and passes it as `cookiefile` to yt-dlp
- **Docker Compose profile** — cookie-bot is opt-in via `--profile cookies`
- **New env vars** — `YT_MEDIA_INFO_COOKIES_FILE`, `GOOGLE_EMAIL/PASSWORD/TOTP_SECRET`, `VIMEO_EMAIL/PASSWORD`, `TWITCH_EMAIL/PASSWORD/TOTP_SECRET` (all optional)
- **No changes to the Node.js MCP layer** — cookies are handled entirely between the Python service and the cookie-bot

## Capabilities

### New Capabilities
- `cookie-bot-automation`: Automated cookie lifecycle management — periodic login to configured providers, session persistence, atomic writes, and error recovery
- `cookie-provider-google`: Google/YouTube login flow — email, password, TOTP-based 2FA, CDP setup mode for CAPTCHA handling
- `cookie-provider-vimeo`: Vimeo login flow — email + password
- `cookie-provider-twitch`: Twitch login flow — email, password, TOTP-based 2FA
- `cookie-injection`: yt-dlp cookie injection — read cookies from shared file, pass as `cookiefile` to all extraction calls (info, transcript, search)

### Modified Capabilities
*(No existing specs to modify — first capability-driven change)*

## Impact

- **New container**: `cookie-bot` service in Docker Compose (Playwright+Chromium, ~1.2GB image)
- **New volume**: `cookies-data` named volume shared between `yt-media-info-service` and `cookie-bot`
- **Python service**: `_build_ydl_opts()` gains `cookiefile` parameter from env var — no API surface change
- **Dependencies**: `cookie-bot/requirements.txt` (playwright, pyotp), none added to existing service
- **Environment**: 9 new optional vars in `.env.example` (1 for cookie file path, 8 for provider credentials)
- **Operational**: first deploy requires one-time interactive `--setup` run; subsequent runs fully automated
- **No impact**: Node.js MCP server, tool schemas, MCP protocol, SSE/stdio transports
