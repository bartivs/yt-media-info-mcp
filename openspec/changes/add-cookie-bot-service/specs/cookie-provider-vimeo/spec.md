## ADDED Requirements

### Requirement: Vimeo login flow
The cookie-bot SHALL support logging into Vimeo to obtain session cookies.

#### Scenario: Automated login with email and password
- **WHEN** `VIMEO_EMAIL` and `VIMEO_PASSWORD` env vars are set
- **THEN** the provider SHALL be considered configured (`is_configured() == True`)
- **WHEN** the login flow starts
- **THEN** the bot SHALL navigate to `https://vimeo.com/log_in`
- **THEN** the bot SHALL fill the email and password fields
- **THEN** the bot SHALL submit the login form
- **THEN** the bot SHALL wait for the redirect to the homepage

#### Scenario: Post-login cookie extraction
- **WHEN** login completes successfully
- **THEN** the bot SHALL navigate to `https://vimeo.com/`
- **THEN** the bot SHALL call `context.cookies()` to extract all cookies
- **THEN** the bot SHALL filter for cookies with domains matching `.vimeo.com`
- **THEN** all matching cookies SHALL be included in the Netscape output

### Requirement: Environment variable contract
All Vimeo provider env vars SHALL be prefixed with `VIMEO_`.

#### Scenario: Env var names
- **WHEN** the provider checks configuration
- **THEN** it SHALL read from `VIMEO_EMAIL`, `VIMEO_PASSWORD`
- **THEN** both env vars are required for the provider to be configured
