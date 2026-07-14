## Context

The MCP server runs in SSE mode with an Express HTTP server. It already services `GET /health`, `POST /messages`, `GET /sse`, and `POST /api` on a configurable port (default 9423). The Python service reads cookies from `/data/cookies.txt` on the `cookies-data` shared volume. Currently only the `yt-media-info-service` and `cookie-bot` containers have this volume mounted — the MCP server does not.

Uploading a cookie file requires: (1) export from browser, (2) scp to server, (3) SSH in, (4) docker run + cp into the volume, (5) restart the service. This is the pain point.

## Goals / Non-Goals

**Goals:**
- Serve an HTML upload form at `GET /` on the MCP Express server
- Accept `POST /upload-cookies` with a multipart file upload, validate it, write to `/data/cookies.txt`
- Accept `POST /delete-cookies` to remove the file
- Apply existing API key auth to the new endpoints
- Mount `cookies-data` volume on the MCP server so it can write the file
- Show parsed cookie info (domains, count, earliest expiry) after upload
- Update README.md with instructions for both web upload and cookie-bot usage

**Non-Goals:**
- No changes to the Python service, MCP tools, or MCP protocol
- No changes to the cookie-bot service
- No new npm dependencies (uses built-in Express + Node.js file APIs)
- No database — state is just the file on disk
- No user management or multi-tenancy

## Decisions

### Decision 1: Inline HTML vs separate template file

**Chosen: Inline HTML string in the route handler.**

The form is a single self-contained page (~50 lines). A separate template file or template engine adds complexity without benefit. The HTML is small enough to inline in `src/index.js`.

### Decision 2: File validation

**Chosen: Check the file starts with `# Netscape HTTP Cookie File` and is under 1MB.**

This catches most non-cookie-file uploads (PDFs, images, random text) with a simple string check. The 1MB limit prevents abuse. Full cookie format validation (parsing each line) is unnecessary — yt-dlp will reject malformed files gracefully.

### Decision 3: Cookie info display

**Chosen: Parse and display domains, count, and earliest expiry from the uploaded file.**

After a successful upload, the response includes parsed metadata so the form can show:
- Number of cookie entries
- List of unique domains
- Earliest expiry date (the one that matters)

This gives the user immediate feedback that their file was processed correctly.

### Decision 4: API key auth

**Chosen: Reuse the existing `apiKeyMiddleware` — the upload/delete endpoints are protected the same as `/api`.**

The existing middleware already applies to all routes except `/health`. The new routes automatically inherit this protection. If no API key is configured, the endpoints are open.

### Decision 5: Volume mount on MCP server

**Chosen: Mount `cookies-data:/data` on `yt-media-info-mcp` container.**

One-line addition to compose.yaml. The MCP server writes the file, the Python service reads it. Both use the same path `/data/cookies.txt`. No symlinks or path translation needed.

### Decision 6: Cookie file updates are immediately effective

The Python service calls `os.path.exists(cookie_file)` on every `_build_ydl_opts()` call (per-request). So a newly uploaded file is picked up on the next extraction request without any restart.

## Risks / Trade-offs

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| **Uploaded file is not a valid cookie file** | Low | Format header check rejects non-cookie uploads; yt-dlp gracefully handles malformed files |
| **Upload interrupted mid-write** | Low | Write to `.tmp` file first, then atomic `rename` to `cookies.txt` |
| **Large file upload consumes memory** | Low | 1MB size limit in Express body parser |
| **User uploads cookies that don't work** | Medium | File validation only checks format, not validity. yt-dlp still fails gracefully — user re-uploads |
| **API key not configured** | Low | Endpoints are open but only accessible on the LAN port; documented as expected behavior |
