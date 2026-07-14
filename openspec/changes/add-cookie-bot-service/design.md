## Context

The yt-media-info MCP server wraps yt-dlp for metadata extraction, transcripts, and media search. YouTube's bot detection has escalated — many videos now require a valid session cookie to extract metadata. The current system has no cookie injection mechanism. Credentials (username/password) are passed through for site auth, but this is insufficient for YouTube's session-based bot challenges.

The solution is a **cookie-bot sidecar** — a Playwright+Chromium container that periodically logs into configured providers, extracts session cookies, and writes them to a shared volume. The existing Python service reads the cookie file from disk on every yt-dlp call.

Key architectural constraints:
- Headless server (no local browser to export from)
- Multiple providers (Google/YouTube, Vimeo, Twitch) with different login flows
- Some providers use 2FA (TOTP)
- CAPTCHA is a realistic risk during automated login
- The Node.js MCP layer should be unaffected
- All credential env vars must be scoped to the cookie-bot container only

## Goals / Non-Goals

**Goals:**
- Provide valid session cookies to yt-dlp for all extraction calls (info, transcript, search)
- Automatic cookie refresh on a configurable interval without user intervention
- Support multiple providers with different authentication flows
- Session persistence so re-login only happens when sessions actually expire
- Interactive `--setup` mode for one-time CAPTCHA/2FA handling via Chrome DevTools Protocol
- Atomic cookie file writes to prevent partial reads by yt-dlp
- Clear documentation for configuring each provider
- All new env vars are optional — the system works without them (current behavior)

**Non-Goals:**
- Not a CAPTCHA-solving service — `--setup` mode defers to a human
- No changes to the Node.js MCP server, tool schemas, or MCP protocol
- No per-request cookie override — single cookie file for all requests (environment-wide)
- No ffmpeg or media downloading — same as existing scope
- No changes to the search tool's auth support (username/password — that's a separate concern)
- No in-memory caching of cookies — reads from file on every extraction call

## Decisions

### Decision 1: Playwright over Lightpanda

**Chosen: Playwright + Chromium**

| Factor | Playwright+Chromium | Lightpanda |
|--------|-------------------|------------|
| YouTube login support | ✅ Well-documented | ❓ Unknown — new engine, may trigger more bot detection |
| Browser fingerprint | Standard Chrome | Novel — not whitelisted by Google |
| Memory | ~150-200MB | ~1-2MB |
| Docker image maturity | `mcr.microsoft.com/playwright` official | Nightly builds, glibc-dependent |
| CAPTCHA/CDP support | Full DevTools Protocol | CDP support but unproven for this flow |

The risk of Lightpanda triggering additional bot detection outweighs its memory advantage. Playwright+Chromium is the proven path — the existing `yt-dlp-Cookie-Sync` project uses this exact stack.

### Decision 2: Shared volume + file-based cookie injection

**Chosen: Named volume, Python service reads cookie file from disk**

Alternatives considered:
- **HTTP endpoint**: Bot serves cookies via API — adds network dependency, restart logic
- **Environment variable**: Raw cookie content in env — unwieldy for large files, can't refresh without restart
- **Per-request param**: Cookie string in tool call body — leaks to logs, breaks MCP tool interface

The file-based approach is simplest: yt-dlp's `cookiefile` option accepts a file path directly. The Python service reads it on every `YoutubeDL` instantiation, so file updates take effect immediately. No API surface changes needed.

### Decision 3: Session persistence (browser-state.json)

**Chosen: Playwright `context.storage_state()` save/restore**

On first successful login (via `--setup`), the bot saves the full browser context state (cookies + localStorage). On subsequent automated runs, it restores this state first and only re-logs in if the saved session is expired.

This means:
- Automated login attempts are rare (only when session expires — days to weeks)
- CAPTCHA risk is dramatically reduced
- The expensive login flow (email + password + 2FA) is avoided on most cycles

### Decision 4: Provider abstraction

**Chosen: Abstract base class with one concrete class per service**

```python
class CookieProvider(ABC):
    @property
    def name(self) -> str: ...
    @property
    def required_env_vars(self) -> list[str]: ...
    @property
    def cookie_domains(self) -> list[str]: ...
    async def login(self, page: Page) -> bool: ...
    def is_configured(self) -> bool: ...
```

Each provider (Google, Vimeo, Twitch) implements login flow independently. This accounts for vastly different login UX patterns — Google's multi-page flow, Twitch's simple form, Vimeo's OAuth-like flow.

**Static imports for v1** — auto-discovery (entry_points, filesystem scan) adds complexity without current benefit. New providers get added to an import list.

### Decision 5: Atomic writes via temp file + rename

```python
tmp = "/data/cookies.tmp"
with open(tmp, "w") as f:
    f.write(netscape_content)
os.rename(tmp, "/data/cookies.txt")   # atomic on same filesystem
```

This prevents yt-dlp from reading a partially-written cookie file. The `os.rename()` call is atomic when source and destination are on the same filesystem (always true within a Docker volume).

### Decision 6: Cookie-bot as Docker Compose profile (opt-in)

The cookie-bot adds a ~1.2GB image (Playwright + Chromium + system deps). Making it a Compose profile means:
- Default `docker compose up` works exactly as before
- Users opt in with `docker compose --profile cookies up -d`
- The shared volume and Python service env var are always defined but the bot only runs when opted in

### Decision 7: Manual seed as bootstrap path

The automated `--setup` mode is the primary install path, but a manual seed path (Phase A in exploration) is documented as a fallback:
```bash
# Host generates cookies:
yt-dlp --cookies-from-browser chrome --cookies cookies.txt
# Copy to server, mount into container
```
This gives users a working cookie file before they ever run the bot.

## Risks / Trade-offs

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| **CAPTCHA blocks automated login** | Medium | `--setup` mode lets user complete CAPTCHA interactively; bot reuses saved session for weeks after |
| **YouTube changes login flow** | Low-Medium | Provider classes are isolated; only one provider breaks at a time; manual seed path always works |
| **2FA/TOTP secret exposure via .env** | Low | Documented as threat; users advised to use Docker secrets or `--setup` mode instead |
| **Python service reads stale cookies** | Low-Medium | Cookie file has expiry dates; you can add /health checkage detection; yt-dlp gracefully handles expired cookies (same error as no cookies) |
| **Playwright Docker image size** | Medium | ~1.2GB; gated behind Compose profile; optional for users who don't need cookies |
| **CDP port exposure in production** | Low | Port 9222 not exposed by default in compose.yaml; only available during `docker compose run --service-ports` |
| **Shared volume permission mismatch** | Low | Named volume handles ownership; both containers run as root or the same UID |

## Migration Plan

1. **Phase A — Code changes** (no behavior change until configured):
   - Create `cookie-bot/` directory with Dockerfile, bot.py, providers, CLI
   - Add `cookiefile` support to `_build_ydl_opts()` in Python service
   - Update `compose.yaml` with cookie-bot service, volume, and profile
   - Update `.env.example` with new env vars
   - Write `cookie-bot/README.md`

2. **Phase B — First deployment**:
   - User pulls updated code
   - Copies `.env.example` to `.env` if not already present
   - Configures one or more providers (e.g., `GOOGLE_EMAIL`, `GOOGLE_PASSWORD`)
   - Starts stack: `docker compose --profile cookies up -d`
   - Runs setup: `docker compose --profile cookies run --service-ports cookie-bot --setup`
   - Completes interactive login via chrome://inspect
   - Bot saves session, writes cookies.txt, exits setup mode
   - Python service picks up cookie file on next yt-dlp call

3. **Phase C — Automated operation**:
   - Cookie-bot starts in loop mode on container boot
   - Restores saved session, verifies YouTube, refreshes cookies
   - Sleeps for `BOT_REFRESH_INTERVAL` (default 4h)
   - If session expired: attempts automated login (email + password + TOTP)
   - If automated login fails: logs warning, skips, waits for next cycle
   - User re-runs `--setup` if automated login repeatedly fails

**Rollback:**
- Remove `YT_MEDIA_INFO_COOKIES_FILE` from env or delete the cookie file
- Start stack without `--profile cookies`
- System returns to current behavior (cookieless extraction)

## Open Questions

1. **Should cookie-bot expose a `/health` endpoint for Compose healthcheck?** The bot is a loop, not an HTTP service, so healthchecks would need a different mechanism (file timestamp, or a tiny sidecar).

2. **Error notification when cookies go stale?** Currently the bot logs warnings and carries on. Should it write a status file that the Python service's `/health` endpoint can read?

3. **Multiple Playwright contexts per provider?** If two providers have conflicting cookie domains, separate browser contexts might be cleaner. Not a v1 concern.

4. **Should `bot.py` support one-shot mode?** `docker compose run cookie-bot --once` could be useful for testing: run one cycle then exit.

5. **How to handle providers that need different Chromium launch args?** (e.g., some sites need `--disable-web-security`). The provider could override a `launch_args` property.
