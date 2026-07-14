## ADDED Requirements

### Requirement: Twitch login flow
The cookie-bot SHALL support logging into Twitch to obtain session cookies.

#### Scenario: Automated login with email and password
- **WHEN** `TWITCH_EMAIL` and `TWITCH_PASSWORD` env vars are set
- **THEN** the provider SHALL be considered configured (`is_configured() == True`)
- **WHEN** the login flow starts
- **THEN** the bot SHALL navigate to `https://www.twitch.tv/login`
- **THEN** the bot SHALL fill the username/email and password fields
- **THEN** the bot SHALL submit the login form
- **THEN** the bot SHALL wait for the redirect to the homepage

#### Scenario: TOTP-based 2FA
- **WHEN** `TWITCH_TOTP_SECRET` env var is set AND Twitch prompts for a 2FA code after login
- **THEN** the bot SHALL generate a TOTP code using `pyotp.TOTP(secret).now()`
- **THEN** the bot SHALL fill the code into the 2FA input field and submit
- **THEN** the bot SHALL wait for the redirect

#### Scenario: CAPTCHA during automated login
- **WHEN** the login page displays a CAPTCHA challenge
- **THEN** the bot SHALL return False (login failed)
- **THEN** the bot SHALL log a message: "Twitch login blocked by CAPTCHA — run --setup to complete interactively"

#### Scenario: Post-login cookie extraction
- **WHEN** login completes successfully
- **THEN** the bot SHALL navigate to `https://www.twitch.tv/`
- **THEN** the bot SHALL call `context.cookies()` to extract all cookies
- **THEN** the bot SHALL filter for cookies with domains matching `.twitch.tv`
- **THEN** all matching cookies SHALL be included in the Netscape output

### Requirement: Environment variable contract
All Twitch provider env vars SHALL be prefixed with `TWITCH_`.

#### Scenario: Env var names
- **WHEN** the provider checks configuration
- **THEN** it SHALL read from `TWITCH_EMAIL`, `TWITCH_PASSWORD`, `TWITCH_TOTP_SECRET`
- **THEN** `TWITCH_TOTP_SECRET` is optional
