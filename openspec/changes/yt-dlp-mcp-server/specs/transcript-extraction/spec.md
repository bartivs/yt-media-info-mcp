## ADDED Requirements

### Requirement: Separate transcript tool
The `get_transcript` tool SHALL be a separate MCP tool from `extract_info`, so that transcript text (which can be large) is only fetched when explicitly requested and does not bloat metadata responses.

#### Scenario: Caller wants transcript
- **WHEN** the AI needs the spoken content of a video
- **THEN** it calls `get_transcript(url, ...)` rather than `extract_info`, keeping the two concerns separate

### Requirement: Language selection
The `get_transcript` tool SHALL accept an optional `language` parameter (default `"en"`) selecting the preferred subtitle language. The system SHALL attempt the requested language and fall back to the first available language if the requested one is unavailable.

#### Scenario: Requested language available
- **WHEN** `get_transcript` is called with `language: "en"` and English subtitles exist
- **THEN** the response `language` field is `"en"` and the subtitles/text are in English

#### Scenario: Requested language unavailable
- **WHEN** `get_transcript` is called with `language: "en"` but only Spanish subtitles exist
- **THEN** the system returns the Spanish transcript and sets `language` to `"es"` (the actually-used language)

### Requirement: Optional timestamps
The `get_transcript` tool SHALL accept a `timestamps` boolean parameter (default `true`). When `true`, the response includes a `subtitles` array of `{ start, end, text }` segments. When `false`, the `subtitles` array is omitted.

#### Scenario: Timestamps requested
- **WHEN** `get_transcript` is called with `timestamps: true` (or omitted)
- **THEN** the response includes `subtitles: [{ start, end, text }, ...]`

#### Scenario: Timestamps omitted
- **WHEN** `get_transcript` is called with `timestamps: false`
- **THEN** the response omits the `subtitles` array and returns only `full_text`

### Requirement: Full concatenated text
The `get_transcript` response SHALL always include a `full_text` string containing all subtitle segments concatenated in order, regardless of the `timestamps` setting.

#### Scenario: Full text always present
- **WHEN** `get_transcript` returns successfully
- **THEN** `full_text` is a non-empty string suitable for direct ingestion into an AI context window

### Requirement: Transcript metadata
The `get_transcript` response SHALL include the source `url`, the resolved `language`, and `duration_seconds` of the media.

#### Scenario: Response shape
- **WHEN** `get_transcript` succeeds
- **THEN** the response contains `url`, `language`, `duration_seconds`, `full_text`, and (unless `timestamps: false`) `subtitles`

### Requirement: No subtitles available
When no subtitles/captions exist for the URL in any language, the tool SHALL return an MCP error response with a clear message.

#### Scenario: No subtitles
- **WHEN** the media has no subtitles or automatic captions
- **THEN** the tool returns `{ "isError": true, "error": { "message": "...no subtitles available...", "code": ... } }`

### Requirement: Optional site authentication for transcript
The `get_transcript` tool SHALL accept the same optional `username`/`password` parameters as `extract_info`, with the same env-var fallback behavior, for accessing protected content.

#### Scenario: Authenticated transcript fetch
- **WHEN** `get_transcript` is called with `username`/`password` (or env defaults are set)
- **THEN** those credentials are passed to `YoutubeDL` for the underlying extraction
