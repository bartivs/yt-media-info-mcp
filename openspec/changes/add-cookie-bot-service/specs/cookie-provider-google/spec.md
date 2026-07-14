## ADDED Requirements

### Requirement: Google/YouTube login flow
The cookie-bot SHALL support logging into a Google account to obtain YouTube session cookies.

#### Scenario: Automated login with email and password
- **WHEN** `GOOGLE_EMAIL` and `GOOGLE_PASSWORD` env vars are set
- **THEN** the provider SHALL be considered configured (`is_configured() == True`)
- **WHEN** the login flow starts
- **THEN** the bot SHALL navigate to `https://accounts.google.com/signin`
- **THEN** the bot SHALL fill the email field, click Next, wait for the password page
- **THEN** the bot SHALL fill the password field, click Next
- **THEN** the bot SHALL wait for the redirect to complete

#### Scenario: TOTP-based 2FA
- **WHEN** `GOOGLE_TOTP_SECRET` env var is set AND the password page redirects to a 2FA prompt
- **THEN** the bot SHALL generate a TOTP code using `pyotp.TOTP(secret).now()`
- **THEN** the bot SHALL fill the code into the 2FA input field and click Next
- **THEN** the bot SHALL wait for the redirect to complete

#### Scenario: CAPTCHA during automated login
- **WHEN** the login page displays a CAPTCHA challenge ("unusual activity" or reCAPTCHA element)
- **THEN** the bot SHALL return False (login failed)
- **THEN** the bot SHALL log a message: "Google login blocked by CAPTCHA — run --setup to complete interactively"

#### Scenario: Post-login cookie extraction
- **WHEN** login completes successfully
- **THEN** the bot SHALL navigate to `https://www.youtube.com/`
- **THEN** the bot SHALL call `context.cookies()` to extract all cookies
- **THEN** the bot SHALL filter for cookies with domains matching `.youtube.com` and `.google.com`
- **THEN** all matching cookies SHALL be included in the Netscape output

#### Scenario: Session verification
- **WHEN** a saved session is restored
- **THEN** the bot SHALL navigate to `https://www.youtube.com/`
- **WHEN** the page does NOT show a "Sign in" button or redirects to sign-in
- **THEN** the session is considered valid
- **WHEN** the page shows "Sign in" or redirects to accounts.google.com
- **THEN** the session is considered expired and re-login is triggered

### Requirement: Environment variable contract
All Google provider env vars SHALL be prefixed with `GOOGLE_`.

#### Scenario: Env var names
- **WHEN** the provider checks configuration
- **THEN** it SHALL read from `GOOGLE_EMAIL`, `GOOGLE_PASSWORD`, `GOOGLE_TOTP_SECRET`
- **THEN** only `GOOGLE_TOTP_SECRET` is optional for a valid configuration
