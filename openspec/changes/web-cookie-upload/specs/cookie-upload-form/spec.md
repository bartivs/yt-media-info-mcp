## ADDED Requirements

### Requirement: Web upload form

The system SHALL serve an HTML form at `GET /` that allows users to upload a cookies.txt file.

#### Scenario: Form renders successfully
- **WHEN** user navigates to `GET /` in a browser
- **THEN** the server returns an HTML page with a file input, upload button, and instructions

#### Scenario: Form is unprotected when no API key configured
- **WHEN** `YT_MEDIA_INFO_API_KEY` is not set and user navigates to `GET /`
- **THEN** the form is accessible without authentication

#### Scenario: Form requires API key when configured
- **WHEN** `YT_MEDIA_INFO_API_KEY` is set and user navigates to `GET /` without a valid `Authorization: Bearer <key>` header
- **THEN** the server returns HTTP 401

### Requirement: Cookie file upload

The system SHALL accept a cookies.txt file upload at `POST /upload-cookies` and write it to `/data/cookies.txt`.

#### Scenario: Successful upload
- **WHEN** user submits a valid Netscape-format cookie file via `POST /upload-cookies`
- **THEN** the server writes the file to `/data/cookies.txt` and returns HTTP 200 with JSON containing `domains`, `count`, and `expires` fields

#### Scenario: Missing file
- **WHEN** user submits `POST /upload-cookies` without a file
- **THEN** the server returns HTTP 400 with an error message

#### Scenario: Invalid file format
- **WHEN** user submits a file that does not start with `# Netscape HTTP Cookie File` via `POST /upload-cookies`
- **THEN** the server returns HTTP 400 with an error message describing the expected format

#### Scenario: File too large
- **WHEN** user submits a file larger than 1MB via `POST /upload-cookies`
- **THEN** the server returns HTTP 413 with an error message

#### Scenario: Upload requires API key when configured
- **WHEN** `YT_MEDIA_INFO_API_KEY` is set and user submits `POST /upload-cookies` without a valid `Authorization: Bearer <key>` header
- **THEN** the server returns HTTP 401

#### Scenario: Atomic write
- **WHEN** the server writes the uploaded file to `/data/cookies.txt`
- **THEN** it SHALL first write to a `.tmp` file, then atomically rename to `cookies.txt`

### Requirement: Cookie file deletion

The system SHALL accept `POST /delete-cookies` to remove the cookie file from the shared volume.

#### Scenario: Successful deletion
- **WHEN** user submits `POST /delete-cookies` and `/data/cookies.txt` exists
- **THEN** the server removes the file and returns HTTP 200 with `{"deleted": true}`

#### Scenario: Deletion when no file exists
- **WHEN** user submits `POST /delete-cookies` and `/data/cookies.txt` does not exist
- **THEN** the server returns HTTP 200 with `{"deleted": false, "message": "No cookie file to delete"}`

#### Scenario: Delete requires API key when configured
- **WHEN** `YT_MEDIA_INFO_API_KEY` is set and user submits `POST /delete-cookies` without a valid `Authorization: Bearer <key>` header
- **THEN** the server returns HTTP 401

### Requirement: Cookie info display

The system SHALL parse the uploaded cookie file and return metadata about its contents.

#### Scenario: Upload response includes cookie metadata
- **WHEN** a valid cookie file is uploaded
- **THEN** the response JSON SHALL include:
  - `domains`: array of unique domain strings
  - `count`: total number of cookie entries
  - `expires`: ISO 8601 date of the earliest expiry among all entries

#### Scenario: Cookie info shown on the form after upload
- **WHEN** a valid cookie file is uploaded
- **THEN** the HTML form SHALL display the parsed cookie info (domains, count, expiry) as a success message

### Requirement: Shared volume mount

The MCP server SHALL have the `cookies-data` Docker volume mounted at `/data` so it can write and delete the cookie file.

#### Scenario: Volume mounted at startup
- **WHEN** the `yt-media-info-mcp` container starts
- **THEN** it SHALL have the `cookies-data` volume mounted at `/data`

#### Scenario: File is immediately available to Python service
- **WHEN** a file is written to `/data/cookies.txt` by the MCP server
- **THEN** the Python service SHALL be able to read it on the next extraction request without any restart

### Requirement: Cookie-bot compatibility

The web upload SHALL NOT interfere with the cookie-bot's automated refresh cycle.

#### Scenario: Cookie-bot writes override uploaded file
- **WHEN** the cookie-bot writes a new cookies.txt during a refresh cycle
- **THEN** the uploaded file is replaced, and subsequent extraction requests use the new cookies

#### Scenario: Upload replaces cookie-bot's file
- **WHEN** user uploads a new cookies.txt while the cookie-bot is running
- **THEN** the uploaded file replaces the existing one, and the cookie-bot's next cycle will continue from the saved browser session state
