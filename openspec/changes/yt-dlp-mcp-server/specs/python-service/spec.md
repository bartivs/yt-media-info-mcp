## ADDED Requirements

### Requirement: Persistent HTTP service
The Python service SHALL run as a persistent FastAPI/uvicorn process that imports yt-dlp once at startup and stays warm, exposing HTTP endpoints to the Node MCP server over the Docker bridge network. It SHALL NOT be invoked via `docker run --rm` per request.

#### Scenario: Service stays warm
- **WHEN** the compose stack is up
- **THEN** the Python service process is long-lived and yt-dlp remains imported across multiple requests without re-importing

### Requirement: Endpoints
The service SHALL expose the following HTTP endpoints: `POST /info` (extract_info), `POST /transcript` (get_transcript), `POST /search` (search_media), and `GET /health`.

#### Scenario: Info endpoint
- **WHEN** the Node server POSTs a JSON body `{ "url": ..., "include_raw": ..., "username": ..., "password": ... }` to `/info`
- **THEN** the service returns the curated + raw metadata JSON for that URL

#### Scenario: Transcript endpoint
- **WHEN** the Node server POSTs a JSON body `{ "url": ..., "language": ..., "timestamps": ..., "username": ..., "password": ... }` to `/transcript`
- **THEN** the service returns the transcript JSON (subtitles + full_text)

#### Scenario: Search endpoint
- **WHEN** the Node server POSTs a JSON body `{ "query": ..., "limit": ..., "platform": ... }` to `/search`
- **THEN** the service returns the search results JSON envelope

#### Scenario: Health endpoint
- **WHEN** a client GETs `/health`
- **THEN** the service responds with HTTP 200 and a JSON body indicating healthy status

### Requirement: Per-request YoutubeDL instance
For each request the service SHALL construct a fresh `YoutubeDL(opts)` instance rather than reusing a global one, to avoid cross-request state leakage. Extractor classes remain loaded/cached across requests.

#### Scenario: No state leakage
- **WHEN** two consecutive `/info` calls are made for different URLs
- **THEN** each call uses its own `YoutubeDL` instance but shares the cached extractor registry

### Requirement: Sanitized raw info dict
The `raw` field returned by `/info` SHALL be produced by passing yt-dlp's info dict through `YoutubeDL.sanitize_info` to ensure JSON serializability.

#### Scenario: Raw is serializable
- **WHEN** `/info` returns a `raw` field
- **THEN** `raw` is a JSON-serializable dict produced via `sanitize_info`

### Requirement: Snake_case output with ISO 8601 dates
All service responses SHALL use snake_case field names (matching yt-dlp native) and SHALL format date fields (e.g. `upload_date`) as ISO 8601 strings.

#### Scenario: Date normalization
- **WHEN** yt-dlp returns `upload_date` as `YYYYMMDD`
- **THEN** the service returns `upload_date` as an ISO 8601 string

### Requirement: Base image and dependencies
The service SHALL be built from `python:3.12-slim` and install `yt-dlp[default]`, `fastapi`, and `uvicorn[standard]` via `requirements.txt`. ffmpeg SHALL NOT be required (no media downloading in v1).

#### Scenario: Image build
- **WHEN** the service Docker image is built
- **THEN** it is based on `python:3.12-slim` and contains yt-dlp (with default extras), FastAPI, and uvicorn, and does not require ffmpeg

### Requirement: Credentials pass-through
The `/info` and `/transcript` endpoints SHALL accept optional `username` and `password` fields in the request body and pass them into the `YoutubeDL` opts for site authentication.

#### Scenario: Credentials forwarded
- **WHEN** `/info` is called with `username` and `password`
- **THEN** the underlying `YoutubeDL` instance is constructed with those credentials in its opts

### Requirement: Best-effort error responses
Endpoints SHALL return best-effort results: complete failures return an HTTP error status with a JSON error body; partial playlist failures return successful entries plus a `failures` array; missing fields are `null`.

#### Scenario: Complete failure
- **WHEN** extraction fails entirely for a URL
- **THEN** the endpoint returns an HTTP error status with a JSON `{ "error": { "message": ..., "code": ... } }` body

#### Scenario: Partial playlist failure
- **WHEN** a playlist URL has some failing entries
- **THEN** the endpoint returns HTTP 200 with successful entries and a `failures` array describing failed entries
