## Why

Uploading cookies to the server currently requires scp + SSH + Docker commands — a multi-step process across two machines that's error-prone (wrong volume names, missing file paths, read-only mount issues). Adding a web-based upload form lets users seed their cookies in seconds directly from the browser.

## What Changes

- **New**: `GET /` route on the MCP Express server serves an HTML upload form
- **New**: `POST /upload-cookies` receives a cookies.txt file, validates it, writes it to the shared volume
- **New**: `POST /delete-cookies` removes the cookie file from the shared volume
- **New**: `cookies-data` volume mounted on the `yt-media-info-mcp` container (currently only on `yt-media-info-service` and `cookie-bot`)
- **Update**: `README.md` with web upload and cookie-bot usage instructions
- **No changes** to the Python service, MCP protocol, tools, prompts, or cookie-bot

## Capabilities

### New Capabilities

- `cookie-upload-form`: Web-based file upload for cookies.txt, with validation, cookie info display, and delete functionality

### Modified Capabilities

<!-- No existing capability specs are changing — this adds new functionality alongside existing auth mechanisms -->

## Impact

- **src/index.js**: ~80 new lines (2 Express routes + HTML template + cookie file helpers)
- **compose.yaml**: 1 line added (volume mount on MCP server)
- **README.md**: New section on cookie management
- **Package.json**: No new dependencies (Express already included, file upload uses built-in multipart handling)
- **Docker image**: No size increase (no new dependencies)
