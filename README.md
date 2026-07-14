# yt-dlp MCP Server

A Model Context Protocol (MCP) server that enables AI assistants to extract rich metadata from media URLs across thousands of sites using [yt-dlp](https://github.com/yt-dlp/yt-dlp).

Designed to sit alongside web-search tools as a **media enrichment step** in an information-gathering pipeline. Given a URL (video, playlist, channel, podcast, etc.), it returns structured metadata — title, description, duration, chapters, subtitles, formats, statistics — that AI models can reason over.

Built in the style of [bartivs/jobspy-mcp-server](https://github.com/bartivs/jobspy-mcp-server).

## Features

- **Extract rich metadata** from any yt-dlp-supported URL (YouTube, Vimeo, Twitch, and ~1800 more sites)
- **Fetch transcripts** with timestamps or as full text
- **Search for media** across supported platforms (supplementary discovery)
- **Curated + raw output**: focused summary at the top level, full yt-dlp info dict nested under `raw`
- **Snake_case fields, ISO 8601 dates** — matches yt-dlp's native format
- **Optional two-layer auth**: yt-dlp site credentials + bearer API key for your own endpoints
- **Multiple transport options**: stdio for Claude Desktop, SSE for web clients
- **Direct API endpoint** (`POST /api`) for quick testing without MCP protocol
- **Persistent Python backend**: no cold-start per call (imports yt-dlp once at startup)

## Prerequisites

- Node.js 18+
- Python 3.12+ (for standalone development)
- Docker + Docker Compose (for recommended deployment)

## Installation

```bash
# Clone the repository
cd yt-dlp-mcp-server

# Install Node dependencies
npm install

# Build the Python service Docker image
docker compose build yt-dlp-service
```

### Standalone Python service (without Docker)

If you want to run the Python service directly:

```bash
cd service
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

Then in another terminal:
```bash
YTDLP_SERVICE_URL=http://localhost:8000 npm start
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ENABLE_SSE` | Use SSE transport (vs stdio) | `0` |
| `YTDLP_PORT` | HTTP server port (SSE mode) | `9423` |
| `YTDLP_HOST` | HTTP server host (SSE mode) | `0.0.0.0` |
| `YTDLP_SERVICE_URL` | URL of the Python yt-dlp service | `http://yt-dlp-service:8000` |
| `YTDLP_API_KEY` | Optional bearer API key for HTTP endpoints | (empty = no auth) |
| `YTDLP_USERNAME` | Default username for yt-dlp site auth | (empty) |
| `YTDLP_PASSWORD` | Default password for yt-dlp site auth | (empty) |
| `LOG_LEVEL` | Winston log level (error, warn, info, debug) | `info` |

Defaults are in `.env` (committed). Override locally via `.env.local`.

## Usage

### Claude Desktop (stdio)

```json
{
  "mcpServers": {
    "yt-dlp": {
      "command": "node",
      "args": ["/path/to/yt-dlp-mcp-server/src/index.js"],
      "env": {
        "ENABLE_SSE": "0"
      }
    }
  }
}
```

### Claude Code (SSE)

```json
{
  "mcpServers": {
    "yt-dlp": {
      "type": "sse",
      "url": "http://localhost:9423/sse"
    }
  }
}
```

### LiteLLM

```yaml
# config.yaml
model_list:
  - model_name: yt-dlp
    litellm_params:
      model: mcp
      mcp_servers:
        yt-dlp:
          transport: sse
          url: http://host.docker.internal:9423/sse
```

### Direct API

The `POST /api` endpoint bypasses the MCP protocol and returns results directly:

```bash
# Extract info
curl -X POST http://localhost:9423/api \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "extract_info",
    "args": {
      "url": "https://www.youtube.com/watch?v=YE7VzlLtp-4"
    }
  }'

# Get transcript
curl -X POST http://localhost:9423/api \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "get_transcript",
    "args": {
      "url": "https://www.youtube.com/watch?v=YE7VzlLtp-4",
      "language": "en"
    }
  }'

# Search media
curl -X POST http://localhost:9423/api \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "search_media",
    "args": {
      "query": "python tutorial",
      "limit": 5
    }
  }'
```

### Web clients (MCP SSE)

The server exposes standard MCP SSE endpoints:

| Endpoint | Purpose |
|----------|---------|
| `GET /sse` | SSE connection stream (MCP transport) |
| `POST /messages` | Send MCP JSON-RPC messages to the server |
| `POST /api` | Direct JSON API (bypasses MCP) |
| `GET /health` | Health check |

```javascript
// Connect via MCP SDK
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const transport = new SSEClientTransport(new URL('http://localhost:9423/sse'));
const client = new Client({ name: 'web-app', version: '1.0' });
await client.connect(transport);

const result = await client.request(
  { method: 'tools/call', params: { name: 'extract_info', arguments: { url: 'https://www.youtube.com/watch?v=YE7VzlLtp-4' } } },
  resultSchema
);
```

## Docker Compose

```bash
docker compose up -d           # start both services
docker compose logs -f         # tail logs
docker compose down            # stop
docker compose build           # rebuild after changes
```

The `yt-dlp-service` container is persistent and stays warm. The `yt-dlp-mcp-server` container waits for the health check on the Python service before accepting connections.

## Available Tools

### extract_info

Extracts rich metadata from a media URL.

**Parameters:**

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `url` | string | Media URL to extract information from | (required) |
| `include_raw` | boolean | Include the full yt-dlp sanitized info_dict under `raw` | `true` |
| `username` | string? | Username for site authentication | `null` |
| `password` | string? | Password for site authentication | `null` |

**Output:** Curated metadata (title, description, duration, uploader, statistics, chapters, thumbnails, formats summary, subtitles available, playlist info) + optional raw info dict.

### get_transcript

Fetches subtitles or transcript text for a media URL.

**Parameters:**

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `url` | string | Media URL to fetch transcript from | (required) |
| `language` | string | Preferred subtitle language code | `"en"` |
| `timestamps` | boolean | Include timestamp segments in response | `true` |
| `username` | string? | Username for site authentication | `null` |
| `password` | string? | Password for site authentication | `null` |

**Output:** Language, duration, subtitle segments (with timestamps if requested), and concatenated full_text.

### search_media

Supplementary discovery tool. Searches for media using yt-dlp's search prefixes (e.g. `ytsearch:`). This is a companion to general-purpose web search — it finds candidate URLs for further enrichment.

**Parameters:**

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `query` | string | Search query | (required) |
| `limit` | integer | Maximum number of results (max 50) | `10` |
| `platform` | string | Platform to search. Supported: `youtube`, `google_videos` | `"youtube"` |

**Output:** Results array with url, title, duration_seconds, uploader, upload_date, thumbnail, view_count.

## Available Prompts

- **analyze_video**: Analyze a video/media item from its available metadata (title, description, duration, uploader, categories, optional transcript summary).
- **summarize_transcript**: Summarize a video transcript to extract key points, notable quotes, and practical takeaways.

## Output Conventions

- **snake_case** field names (matches yt-dlp's native format)
- **ISO 8601** date strings (e.g. `"2024-01-15"` for upload_date, `"2024-01-15T14:30:00Z"` for timestamps)
- **Best-effort error handling**: complete failures return an error response; missing fields are `null`; playlist entries that fail are collected in a `failures` array

## Scope

**This server does NOT download media files.** It is a metadata enrichment and transcript extraction tool designed to work alongside other search and retrieval tools. No ffmpeg is required.

## Development

```bash
npm run dev      # nodemon auto-restart
npm run lint     # ESLint
npm run lint:fix # ESLint auto-fix
```

## License

MIT
