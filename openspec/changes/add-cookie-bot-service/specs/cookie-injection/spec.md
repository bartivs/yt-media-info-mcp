## ADDED Requirements

### Requirement: Cookie file path from environment
The Python service SHALL read the cookie file path from an environment variable and pass it to yt-dlp as the `cookiefile` option.

#### Scenario: Cookie file env var is set and file exists
- **WHEN** `YT_MEDIA_INFO_COOKIES_FILE` env var is set
- **THEN** the service SHALL check if the file exists via `os.path.exists()`
- **WHEN** the file exists
- **THEN** `_build_ydl_opts()` SHALL include `cookiefile` set to the file path

#### Scenario: Cookie file env var is set but file is missing
- **WHEN** `YT_MEDIA_INFO_COOKIES_FILE` env var is set
- **THEN** the service SHALL check if the file exists
- **WHEN** the file does not exist
- **THEN** the service SHALL log a warning: "Cookie file {path} not found — proceeding without cookies"
- **THEN** the service SHALL NOT include `cookiefile` in the opts dict

#### Scenario: Cookie file env var is not set
- **WHEN** `YT_MEDIA_INFO_COOKIES_FILE` env var is not set or empty
- **THEN** the service SHALL NOT include `cookiefile` in the opts dict
- **THEN** yt-dlp SHALL operate without cookies (current behavior)

### Requirement: Cookie injection applies to all tools
The `cookiefile` option SHALL be set for every yt-dlp call, regardless of which endpoint triggered it.

#### Scenario: Info endpoint uses cookies
- **WHEN** `POST /info` is called
- **THEN** the resulting `YoutubeDL` instance SHALL have `cookiefile` set (if configured)
- **THEN** the extraction SHALL use session cookies for the target URL

#### Scenario: Transcript endpoint uses cookies
- **WHEN** `POST /transcript` is called
- **THEN** the resulting `YoutubeDL` instance SHALL have `cookiefile` set (if configured)
- **THEN** the extraction SHALL use session cookies for the target URL

#### Scenario: Search endpoint uses cookies
- **WHEN** `POST /search` is called
- **THEN** the resulting `YoutubeDL` instance SHALL have `cookiefile` set (if configured)
- **THEN** the search query SHALL use session cookies

### Requirement: No API surface change
The cookie injection SHALL be transparent to the Node.js MCP layer and to MCP clients.

#### Scenario: No new tool parameters
- **WHEN** MCP clients call any tool
- **THEN** there SHALL be no new `cookies` or `cookies_file` parameter in the tool schemas
- **THEN** the cookie file configuration SHALL be entirely server-side via environment variable

#### Scenario: No new environment vars in MCP container
- **WHEN** the MCP container starts
- **THEN** it SHALL NOT require any cookie-related environment variables
- **THEN** the cookie file path env var SHALL only be consumed by the Python service container
