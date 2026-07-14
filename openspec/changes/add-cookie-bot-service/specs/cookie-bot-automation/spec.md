## ADDED Requirements

### Requirement: Cookie refresh loop
The cookie-bot SHALL run an infinite loop that refreshes cookies from all configured providers at a configurable interval.

#### Scenario: Loop executes on container start
- **WHEN** the cookie-bot container starts in normal mode (no `--setup` flag)
- **THEN** it SHALL immediately run a cookie refresh cycle
- **THEN** it SHALL sleep for `BOT_REFRESH_INTERVAL` seconds (default 14400 = 4 hours)
- **THEN** it SHALL repeat the cycle indefinitely

#### Scenario: All configured providers are processed
- **WHEN** a refresh cycle runs
- **THEN** the bot SHALL iterate over all providers that have `is_configured() == True`
- **THEN** each provider SHALL have its login flow executed in sequence

### Requirement: Session persistence
The cookie-bot SHALL save Playwright browser context state after a successful login and restore it on subsequent cycles to minimize re-login attempts.

#### Scenario: Session saved after successful login
- **WHEN** a provider's login flow completes successfully
- **THEN** the bot SHALL call `context.storage_state()` to save cookies and localStorage
- **THEN** the state data SHALL be written to `STATE_FILE` path

#### Scenario: Session restored at cycle start
- **WHEN** a refresh cycle begins and `STATE_FILE` exists
- **THEN** the bot SHALL create a new Playwright context with `storage_state=STATE_FILE`
- **THEN** the bot SHALL navigate to the provider's homepage to verify the session is still valid

#### Scenario: Session restored when state file is missing
- **WHEN** a refresh cycle begins and `STATE_FILE` does not exist
- **THEN** the bot SHALL attempt an automated login using env var credentials (if configured)
- **THEN** if automated login succeeds, it SHALL save the new state

### Requirement: Atomic cookie file writes
The cookie-bot SHALL write the Netspace cookie file atomically to prevent yt-dlp from reading partial content.

#### Scenario: File written via temp + rename
- **WHEN** cookies are ready to be written to disk
- **THEN** the bot SHALL write to a `.tmp` file first
- **THEN** the bot SHALL use `os.rename()` to atomically replace the target file
- **THEN** both paths MUST be on the same filesystem

### Requirement: Cookie file format
The cookie-bot SHALL write cookies in Netscape HTTP Cookie File format compatible with yt-dlp's `cookiefile` option.

#### Scenario: Netscape format exported
- **WHEN** cookies are extracted from Playwright `context.cookies()` (JSON format)
- **THEN** they SHALL be converted to Netscape format with the following tab-separated fields per line: domain, domain_specified (TRUE/FALSE), path, secure (TRUE/FALSE), expires (timestamp), name, value
- **THEN** `#HttpOnly_` prefix SHALL be prepended to the domain for HttpOnly cookies
- **THEN** the file SHALL start with the standard `# Netscape HTTP Cookie File` header

### Requirement: Graceful degradation on failure
The cookie-bot SHALL NOT crash if a provider login fails — it SHALL log the error and continue to the next provider.

#### Scenario: One provider fails, others continue
- **WHEN** a provider's login flow raises an exception or returns False
- **THEN** the bot SHALL log a warning with the provider name and error details
- **THEN** the bot SHALL continue to the next provider in the iteration

#### Scenario: All providers fail
- **WHEN** all configured providers fail during a refresh cycle
- **THEN** the bot SHALL log an error with details for each failure
- **THEN** the bot SHALL NOT modify the existing cookie file (stale cookies remain usable until next cycle)

### Requirement: CDP setup mode
The cookie-bot SHALL support a `--setup` flag that launches Chromium with remote debugging enabled for interactive login.

#### Scenario: Setup mode launches with CDP
- **WHEN** the bot is started with `--setup` flag
- **THEN** it SHALL launch Chromium with `--remote-debugging-port=9222`
- **THEN** it SHALL NOT attempt automated login
- **THEN** it SHALL print instructions for connecting via `chrome://inspect`
- **THEN** it SHALL wait for the user to press Enter

#### Scenario: Setup mode saves session
- **WHEN** the user presses Enter in setup mode
- **THEN** the bot SHALL extract cookies from all browser contexts
- **THEN** the bot SHALL save `context.storage_state()` to `STATE_FILE`
- **THEN** the bot SHALL write the Netscape cookie file to `COOKIE_FILE`
- **THEN** the bot SHALL exit
