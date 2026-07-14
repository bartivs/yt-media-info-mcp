## 1. Volume mount & compose config

- [ ] 1.1 Add `volumes: - cookies-data:/data` to the `yt-media-info-mcp` service in `compose.yaml`
- [ ] 1.2 Verify the MCP container has write access to `/data/cookies.txt` on restart

## 2. Cookie file helpers

- [ ] 2.1 Implement `validateCookieFile(buffer)` — check buffer starts with `# Netscape HTTP Cookie File`, reject files over 1MB
- [ ] 2.2 Implement `parseCookieInfo(buffer)` — extract unique domains, count, minimum expiry date from cookie file buffer
- [ ] 2.3 Implement `writeCookieFile(buffer)` — write to `/data/cookies.tmp`, then atomic `rename` to `/data/cookies.txt`
- [ ] 2.4 Implement `deleteCookieFile()` — remove `/data/cookies.txt`, return boolean success
- [ ] 2.5 Export helpers with `COOKIE_FILE_PATH = '/data/cookies.txt'` constant

## 3. Express routes

- [ ] 3.1 Add `GET /` route — serve inline HTML form with file input, upload button, status area, and instructions
- [ ] 3.2 Add `POST /upload-cookies` route — receive multipart file, validate, write, return JSON with cookie info (domains, count, expires)
- [ ] 3.3 Add `POST /delete-cookies` route — remove file, return JSON `{deleted: true/false}`
- [ ] 3.4 Ensure routes are protected by existing `apiKeyMiddleware` (same as `/api`)

## 4. HTML form

- [ ] 4.1 Form should have: file input (accept `.txt`), upload button, inline instructions for exporting cookies with yt-dlp
- [ ] 4.2 Form should display success state after upload: domains list, cookie count, earliest expiry date
- [ ] 4.3 Form should display delete button when cookies exist
- [ ] 4.4 Form should use `fetch()` for AJAX upload with progress/status feedback

## 5. Documentation

- [ ] 5.1 Add "Cookie Management" section to `README.md` covering web upload flow and cookie-bot setup
- [ ] 5.2 Reference the web upload form URL in the cookie-bot's own documentation (AGENTS.md) as the recommended seed path
