## ADDED Requirements

### Requirement: Extract curated metadata for a media URL
The `extract_info` tool SHALL accept a media URL and return a curated subset of metadata fields (url, extractor, title, description, duration_seconds, upload_date as ISO 8601, uploader, channel, channel_url, categories, tags, statistics, thumbnail, thumbnails, chapters, subtitles_available, formats_summary, playlist) extracted by yt-dlp across its supported extractors.

#### Scenario: Successful extraction of a single video
- **WHEN** `extract_info` is called with a valid public video URL
- **THEN** the tool returns a JSON object with the curated fields populated from yt-dlp's info dict, with dates formatted as ISO 8601 and field names in snake_case

#### Scenario: Missing optional fields
- **WHEN** yt-dlp returns an info dict that lacks some curated fields (e.g. no chapters)
- **THEN** the tool returns those fields as `null` and the request still succeeds

#### Scenario: Playlist URL
- **WHEN** `extract_info` is called with a playlist or channel URL
- **THEN** the response includes a `playlist` object with `count` and `entries` (each entry carrying at least url, title, duration_seconds)

### Requirement: Include raw info dict
The `extract_info` tool SHALL optionally include the full yt-dlp sanitized info dict under a `raw` field, controlled by an `include_raw` parameter that defaults to `true`. When `include_raw` is `false`, the `raw` field SHALL be omitted to reduce response size.

#### Scenario: Caller requests raw info
- **WHEN** `extract_info` is called with `include_raw` set to `true` (or omitted)
- **THEN** the response includes a `raw` field containing the full `YoutubeDL.sanitize_info` output

#### Scenario: Caller omits raw info
- **WHEN** `extract_info` is called with `include_raw` set to `false`
- **THEN** the response omits the `raw` field entirely

### Requirement: Formats summary
The `formats_summary` field SHALL present a human/AI-readable summary of available formats (best_video, best_audio, available_resolutions) derived from yt-dlp's `formats` array, while the raw formats remain available inside `raw`.

#### Scenario: Multiple resolutions available
- **WHEN** yt-dlp reports formats at 360p, 720p, and 1080p
- **THEN** `formats_summary.available_resolutions` lists `["360p","720p","1080p"]` and `best_video` identifies the best video format

### Requirement: Thumbnails as URLs
The tool SHALL return thumbnails as URLs only (no base64-encoded image data). A convenience `thumbnail` field SHALL hold the best-quality thumbnail URL; `thumbnails` SHALL list all available thumbnails.

#### Scenario: Thumbnails available
- **WHEN** the info dict contains a `thumbnails` array
- **THEN** `thumbnail` is set to the highest-resolution URL and `thumbnails` lists all entries verbatim from yt-dlp

### Requirement: Best-effort error handling
The tool SHALL use best-effort error handling: a complete extraction failure returns an MCP error response; missing fields are returned as `null`; partial playlist failures return successful entries plus a `failures` array describing failed entries.

#### Scenario: Complete extraction failure
- **WHEN** yt-dlp cannot extract any info for the URL (e.g. unsupported site, network error)
- **THEN** the tool returns `{ "isError": true, "error": { "message": ..., "code": ... } }`

#### Scenario: Partial playlist failure
- **WHEN** a playlist URL has some entries that fail extraction
- **THEN** the response returns the successful entries in `playlist.entries` and lists failed entries in `playlist.failures`

### Requirement: Optional site authentication
The `extract_info` tool SHALL accept optional `username` and `password` parameters that are passed through to yt-dlp's `YoutubeDL` opts for accessing protected content. When not provided per call, the system SHALL fall back to `YT_MEDIA_INFO_USERNAME`/`YT_MEDIA_INFO_PASSWORD` environment variables if set.

#### Scenario: Per-call credentials
- **WHEN** `extract_info` is called with `username` and `password`
- **THEN** those values are passed to `YoutubeDL` and used for site authentication

#### Scenario: Env-default credentials
- **WHEN** `extract_info` is called without `username`/`password` but `YT_MEDIA_INFO_USERNAME`/`YT_MEDIA_INFO_PASSWORD` are set
- **THEN** the env values are used for authentication
