## ADDED Requirements

### Requirement: Supplementary media search
The `search_media` tool SHALL provide a supplementary discovery capability that uses yt-dlp's search syntax (e.g. `ytsearch:`) to find media on supported platforms. It is intended to complement — not replace — general-purpose web search MCP tools.

#### Scenario: Basic search
- **WHEN** `search_media` is called with a `query` string
- **THEN** the tool returns a list of candidate media results matching the query on the selected platform

### Requirement: Result limit
The `search_media` tool SHALL accept an optional `limit` integer parameter (default 10, max 50) capping the number of results returned.

#### Scenario: Default limit
- **WHEN** `search_media` is called without `limit`
- **THEN** at most 10 results are returned

#### Scenario: Caller exceeds max
- **WHEN** `search_media` is called with `limit` greater than 50
- **THEN** the system caps `limit` to 50 and returns at most 50 results

### Requirement: Platform selection
The `search_media` tool SHALL accept an optional `platform` string parameter (default `"youtube"`) that maps to a yt-dlp search prefix (e.g. `youtube` → `ytsearch`, `google_videos` → `gvsearch`).

#### Scenario: Default platform
- **WHEN** `search_media` is called without `platform`
- **THEN** the search uses YouTube (`ytsearch:`) syntax

#### Scenario: Alternative platform
- **WHEN** `search_media` is called with `platform: "google_videos"`
- **THEN** the search uses the corresponding yt-dlp search prefix

### Requirement: Minimal result metadata
Each result in the `search_media` response SHALL carry minimal identifying metadata sufficient for the AI to decide whether to call `extract_info`: `url`, `title`, `duration_seconds`, `uploader`, `upload_date` (ISO 8601), `thumbnail`, and `view_count`. Missing fields SHALL be `null`.

#### Scenario: Result entry shape
- **WHEN** `search_media` returns results
- **THEN** each result contains the fields url, title, duration_seconds, uploader, upload_date, thumbnail, view_count (null where unavailable)

### Requirement: Response envelope
The `search_media` response SHALL include the original `query`, the resolved `platform`, the `count` of results, and the `results` array.

#### Scenario: Empty results
- **WHEN** the search returns no matches
- **THEN** the response has `count: 0` and `results: []` and is not an error

### Requirement: Best-effort errors for search
The `search_media` tool SHALL use best-effort error handling consistent with `extract_info`: a complete search failure returns an MCP error response; individual results that cannot be parsed are skipped rather than failing the whole call.

#### Scenario: Platform unsupported
- **WHEN** `search_media` is called with a `platform` value that does not map to a known yt-dlp search prefix
- **THEN** the tool returns `{ "isError": true, "error": { "message": "...unsupported platform...", "code": ... } }`
