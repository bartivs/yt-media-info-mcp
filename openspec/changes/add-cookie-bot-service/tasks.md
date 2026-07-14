## 1. Python Service: Cookie file injection

- [x] 1.1 Add `YT_MEDIA_INFO_COOKIES_FILE` env var handling to `_build_ydl_opts()` — check `os.environ.get()`, validate file exists, pass as `cookiefile` to yt-dlp, log warning if file is set but missing
- [x] 1.2 Add cookie staleness info to `/health` endpoint — report cookie file path, age in seconds, and whether it exists

## 2. Cookie-bot: Project scaffold

- [x] 2.1 Create `cookie-bot/` directory with `Dockerfile`, `requirements.txt`, and empty `__init__.py` files for Python package structure
- [x] 2.2 Write `cookie-bot/Dockerfile` — base on `mcr.microsoft.com/playwright/python:v1.53.0`, install Python deps, copy source, default CMD to run bot
- [x] 2.3 Write `cookie-bot/requirements.txt` — `playwright`, `pyotp`
- [x] 2.4 Write `cookie-bot/bot.py` — main loop: parse args, detect `--setup` mode, discover providers, run refresh cycle loop

## 3. Cookie-bot: Provider framework

- [x] 3.1 Write `cookie-bot/providers/__init__.py` — auto-discover configured providers (static imports for v1)
- [x] 3.2 Write `cookie-bot/providers/base.py` — abstract `CookieProvider` class with `name`, `required_env_vars`, `cookie_domains`, `login()`, `is_configured()` methods
- [x] 3.3 Write `cookie-bot/providers/google.py` — `GoogleProvider` with login flow, TOTP support, session verification, YouTube cookie extraction
- [x] 3.4 Write `cookie-bot/providers/vimeo.py` — `VimeoProvider` with login flow and cookie extraction
- [x] 3.5 Write `cookie-bot/providers/twitch.py` — `TwitchProvider` with login flow, TOTP support, cookie extraction

## 4. Cookie-bot: Session management and cookie writing

- [x] 4.1 Write `cookie-bot/session.py` — `save_session(context, path)` and `restore_session(browser, path)` using Playwright's `storage_state()`
- [x] 4.2 Write `cookie-bot/cookie_writer.py` — `cookies_to_netscape(playwright_cookies, output_path)` that converts Playwright JSON cookies to Netscape format, writes atomically via `.tmp` + `os.rename()`

## 5. Cookie-bot: CLI and setup mode

- [x] 5.1 Write `cookie-bot/cli.py` — argument parsing (`--setup`, `--once`), mode routing: setup mode launches CDP-enabled Chromium, waits for interactive login, saves session; normal mode enters the refresh loop
- [x] 5.2 Implement setup mode flow: launch Chromium with `--remote-debugging-port=9222`, print connection instructions, wait for Enter, save `storage_state()` + cookies, exit
- [x] 5.3 Implement one-shot mode (`--once`): run single refresh cycle then exit (useful for testing)

## 6. Docker Compose and environment

- [x] 6.1 Update `compose.yaml` — add `cookies-data` named volume, add `cookie-bot` service under `--profile cookies` with shared volume mount and credential env vars, add read-only volume mount to `yt-media-info-service`
- [x] 6.2 Update `.env.example` — add `YT_MEDIA_INFO_COOKIES_FILE`, `GOOGLE_EMAIL`, `GOOGLE_PASSWORD`, `GOOGLE_TOTP_SECRET`, `VIMEO_EMAIL`, `VIMEO_PASSWORD`, `TWITCH_EMAIL`, `TWITCH_PASSWORD`, `TWITCH_TOTP_SECRET`, `BOT_REFRESH_INTERVAL` — all commented out with clear docs

## 7. Documentation

- [x] 7.1 Write `cookie-bot/README.md` — quick start, setup mode walkthrough, provider configuration guide, adding a new provider, troubleshooting (CAPTCHA, session expired, cookie parse error)
- [x] 7.2 Update project root `AGENTS.md` with cookie-bot section — architecture, env vars, setup steps, gotchas (CAPTCHA limitation, Playwright image size, CDP setup requirement)

## 8. Testing and validation

- [ ] 8.1 Run full setup flow manually: build images, start stack, run `--setup` mode, verify cookies.txt is created and contains valid Netscape cookies
- [ ] 8.2 Verify all three MCP tools work with cookies: `extract_info`, `get_transcript`, `search_media` on a video known to require cookies (e.g., `oVlVUCdTLlg`)
- [ ] 8.3 Verify graceful degradation: remove cookie file, restart stack without `--profile cookies`, confirm system returns to cookieless behavior
