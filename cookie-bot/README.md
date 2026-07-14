# cookie-bot

Playwright+Chromium sidecar that periodically logs into configured media
providers and exports fresh session cookies in Netscape format for yt-dlp.

## Quick Start

```bash
# 1. Configure provider credentials in .env
#    (see .env.example for all options)

# 2. Start the stack with the cookie-bot profile
docker compose --profile cookies up -d

# 3. Run interactive setup (one-time) to complete CAPTCHA/2FA
docker compose --profile cookies run --service-ports cookie-bot --setup
#    → Connect via chrome://inspect, log in, press Enter

# 4. The bot runs automatically and refreshes cookies every 4 hours
```

## How It Works

cookie-bot runs an infinite loop:

1. **Launch** a headless Chromium instance via Playwright
2. **Restore** saved browser session (cookies + localStorage from previous run)
3. **Refresh** cookies for all configured providers (Google/YouTube, Vimeo, Twitch)
4. **Save** the updated session state for next cycle
5. **Write** all cookies to a Netscape-format file atomically on a shared Docker volume
6. **Sleep** for `BOT_REFRESH_INTERVAL` (default 4 hours), then repeat

The Python service (`yt-media-info-service`) reads the cookie file from the
shared volume on every yt-dlp call — no API changes needed.

## Setup Mode

The `--setup` flag launches Chromium with remote debugging enabled so you can
complete interactive login (CAPTCHA, 2FA) in your own browser:

```
docker compose --profile cookies run --service-ports cookie-bot --setup
```

1. Open Chrome/Chromium on your host
2. Navigate to `chrome://inspect`
3. Click "Configure…" and add `localhost:9222`
4. Click "Inspect" under the remote target
5. Log into each configured provider
6. Return to the terminal and press Enter

The bot saves the browser session state and extracts cookies, then exits.

## Provider Configuration

### Google / YouTube

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_EMAIL` | Yes | Gmail / Google Account email |
| `GOOGLE_PASSWORD` | Yes | Account password |
| `GOOGLE_TOTP_SECRET` | No | TOTP seed for 2FA (e.g., from Google Authenticator) |

The login flow navigates to YouTube, triggers sign-in, fills email + password,
handles optional TOTP, and extracts cookies for `.youtube.com` and `.google.com`.

### Vimeo

| Variable | Required | Description |
|----------|----------|-------------|
| `VIMEO_EMAIL` | Yes | Vimeo account email |
| `VIMEO_PASSWORD` | Yes | Account password |

Simple email + password login. No 2FA support (Vimeo does not commonly use it).

### Twitch

| Variable | Required | Description |
|----------|----------|-------------|
| `TWITCH_EMAIL` | Yes | Twitch account email |
| `TWITCH_PASSWORD` | Yes | Account password |
| `TWITCH_TOTP_SECRET` | No | TOTP seed for 2FA |

Login form with optional TOTP code entry.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BOT_REFRESH_INTERVAL` | `14400` | Seconds between refresh cycles (default 4h) |
| `COOKIE_BOT_DATA_DIR` | `/data` | Directory for session state and cookie file |
| `COOKIE_BOT_COOKIE_FILE` | `/data/cookies.txt` | Output path for Netscape cookie file |

## Adding a New Provider

1. Create a new file in `cookie_bot/providers/` (e.g. `my_site.py`)
2. Subclass `CookieProvider` from `cookie_bot.providers.base`
3. Implement:
   - `name` — human-readable name
   - `required_env_vars` — env vars needed for configuration
   - `cookie_domains` — domain substrings for cookie filtering
   - `login(page, context)` — Playwright-based login flow
4. Import it in `cookie_bot/providers/__init__.py` and add to `ALL_PROVIDERS`

## Troubleshooting

### CAPTCHA blocked automated login

Run `--setup` mode and complete the CAPTCHA interactively. The saved session
will be reused for future automated cycles (CAPTCHA is rarely prompted again
once a session is established).

### Session expired

The bot attempts automated re-login when the saved session is expired.
If automated login fails (CAPTCHA, changed login flow), re-run `--setup`.

### Cookie parse error

The `cookies.txt` file should be in Netscape HTTP Cookie File format.
If it's malformed, delete it and re-run setup. The bot will create a new one.

### Playwright image size

The `mcr.microsoft.com/playwright/python` image is ~1.2 GB. The cookie-bot
service is gated behind `--profile cookies` to avoid pulling it unnecessarily.
