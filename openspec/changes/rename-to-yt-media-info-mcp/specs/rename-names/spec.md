## ADDED Requirements

### Requirement: All names and identifiers updated
All code, configuration, and documentation identifiers SHALL be updated from the old naming scheme to the new `yt-media-info-mcp` naming scheme. No behavioral requirements change.

#### Scenario: Names updated across codebase
- **WHEN** searching the codebase for old identifiers (``YTDLP_*``, ``yt-dlp-mcp-server``, ``yt-dlp-service``)
- **THEN** they SHALL only appear in the rename change's own artifacts documenting the old→new mapping
