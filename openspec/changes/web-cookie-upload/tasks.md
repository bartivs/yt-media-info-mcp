## 1. Volume mount & compose config

- [x] 1.1 Add `volumes: - cookies-data:/data` to the `yt-media-info-mcp` service in `compose.yaml`
- [x] 1.2 Verify the MCP container has write access to `/data/cookies.txt` on restart

## 2. Cookie file helpers

- [x] 2.1 Implement `validateCookieFile(buffer)` — check buffer starts with `# Netscape HTTP Cookie File`, reject files over 1MB
- [x] 2.2 Implement `parseCookieInfo(buffer)` — extract unique domains, count, minimum expiry date from cookie file buffer
- [x] 2.3 Implement `writeCookieFile(buffer)` — write to `/data/cookies.tmp`, then atomic `rename` to `/data/cookies.txt`
- [x] 2.4 Implement `deleteCookieFile()` — remove `/data/cookies.txt`, return boolean success
- [x] 2.5 Export helpers with `COOKIE_FILE_PATH = '/data/cookies.txt'` constant

## 3. Express routes

- [x] 3.1 Add `GET /` route — serve inline HTML form with file input, upload button, status area, and instructions
- [x] 3.2 Add `POST /upload-cookies` route — receive multipart file, validate, write, return JSON with cookie info (domains, count, expires)
- [x] 3.3 Add `POST /delete-cookies` route — remove file, return JSON `{deleted: true/false}`
- [x] 3.4 Ensure routes are protected by existing `apiKeyMiddleware` (same as `/api`)

## 4. HTML form

- [x] 4.1 Form should have: file input (accept `.txt`), upload button, inline instructions for exporting cookies with yt-dlp
- [x] 4.2 Form should display success state after upload: domains list, cookie count, earliest expiry date
- [x] 4.3 Form should display delete button when cookies exist
- [x] 4.4 Form should use `fetch()` for AJAX upload with progress/status feedback

## 5. Documentation

- [x] 5.1 Add "Cookie Management" section to `README.md` covering web upload flow and cookie-bot setup
- [x] 5.2 Reference the web upload form URL in the cookie-bot's own documentation (AGENTS.md) as the recommended seed path
