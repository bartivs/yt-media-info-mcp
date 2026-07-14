## ADDED Requirements

### Requirement: Dual transport modes
The Node MCP server SHALL support two transport modes controlled by the `ENABLE_SSE` environment variable: stdio (`ENABLE_SSE=0`, default) for Claude Desktop integration, and SSE (`ENABLE_SSE=1`) exposing an Express HTTP server with `GET /sse` and `POST /messages` endpoints.

#### Scenario: stdio mode (default)
- **WHEN** the server starts with `ENABLE_SSE` unset or `0`
- **THEN** it connects a `StdioServerTransport` and does not open an HTTP port

#### Scenario: SSE mode
- **WHEN** the server starts with `ENABLE_SSE=1`
- **THEN** it starts an Express server on `YT_MEDIA_INFO_HOST:YT_MEDIA_INFO_PORT` exposing `/sse`, `/messages`, `/api`, and `/health`

### Requirement: Direct API shortcut
In SSE mode the server SHALL expose a `POST /api` endpoint that accepts a JSON body describing a tool call and returns the tool's result directly, bypassing the MCP JSON-RPC protocol.

#### Scenario: Direct API call
- **WHEN** a client POSTs JSON to `/api` describing an `extract_info` call
- **THEN** the server returns the tool result as JSON without requiring MCP protocol framing

### Requirement: Health endpoint
In SSE mode the server SHALL expose a `GET /health` endpoint returning `{ "status": "ok" }` with HTTP 200, suitable for Docker healthchecks and load balancer probes.

#### Scenario: Health check
- **WHEN** a client GETs `/health`
- **THEN** the server responds with HTTP 200 and a JSON body indicating healthy status

### Requirement: Environment configuration
The server SHALL read configuration from environment variables (documented in `env.example`): `ENABLE_SSE`, `YT_MEDIA_INFO_PORT` (default 9423), `YT_MEDIA_INFO_HOST` (default 0.0.0.0), `YT_MEDIA_INFO_SERVICE_URL` (default `http://yt-media-info-service:8000`), `YT_MEDIA_INFO_API_KEY`, `YT_MEDIA_INFO_USERNAME`, `YT_MEDIA_INFO_PASSWORD`, `LOG_LEVEL` (default info).

#### Scenario: Defaults apply
- **WHEN** no environment variables are set
- **THEN** the server uses the documented defaults and starts in stdio mode

### Requirement: Optional bearer API key auth
When `YT_MEDIA_INFO_API_KEY` is set to a non-empty value, the HTTP endpoints (`/api`, `/sse`, `/messages`) SHALL require an `Authorization: Bearer <key>` header matching that value. When `YT_MEDIA_INFO_API_KEY` is unset or empty, no auth is required. stdio mode SHALL never be subject to API key auth.

#### Scenario: API key enforced
- **WHEN** `YT_MEDIA_INFO_API_KEY` is set and a client calls `/api` without a matching bearer token
- **THEN** the server responds with HTTP 401

#### Scenario: API key disabled
- **WHEN** `YT_MEDIA_INFO_API_KEY` is unset or empty
- **THEN** all HTTP endpoints accept requests without an Authorization header

#### Scenario: stdio unaffected
- **WHEN** the server runs in stdio mode regardless of `YT_MEDIA_INFO_API_KEY`
- **THEN** stdio JSON-RPC traffic is not subject to API key checks

### Requirement: SSE progress notifications
In SSE mode the server SHALL emit MCP progress notifications to connected clients during long-running tool calls. Progress notifications SHALL NOT be emitted in stdio mode.

#### Scenario: Progress during long call
- **WHEN** a long-running tool call is in progress on an SSE connection
- **THEN** the server emits `notifications/progress` messages with increasing progress values up to 100 on completion

### Requirement: Structured logging
The server SHALL use Winston logging with a configurable `LOG_LEVEL` and JSON-formatted, colorized console output.

#### Scenario: Log level respected
- **WHEN** `LOG_LEVEL=debug`
- **THEN** debug-level log messages are emitted to the console

### Requirement: Graceful shutdown
The server SHALL handle `SIGINT` and `SIGTERM` by disconnecting transports and closing the HTTP server before exiting with code 0.

#### Scenario: SIGTERM received
- **WHEN** the server receives SIGTERM
- **THEN** it disconnects the MCP server, closes any HTTP listener, and exits 0

### Requirement: MCP prompts
The server SHALL register two MCP prompts: `analyze_video` (guides analysis of a video from its metadata) and `summarize_transcript` (guides summarization of a fetched transcript).

#### Scenario: Prompt registered
- **WHEN** the server starts
- **THEN** an MCP client can list and invoke the `analyze_video` and `summarize_transcript` prompts
