import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import express from 'express';
import cors from 'cors';

import logger from './logger.js';
import SseManager from './sseManager.js';
import {
  analyzeVideoPrompt,
  summarizeTranscriptPrompt,
} from './prompts/index.js';
import {
  extractInfoTool,
  getTranscriptTool,
  searchMediaTool,
} from './tools/index.js';

// Environment
const PORT = process.env.YT_MEDIA_INFO_PORT || 9423;
const HOST = process.env.YT_MEDIA_INFO_HOST || '0.0.0.0';
const ENABLE_SSE = !!(process.env.ENABLE_SSE | 0);
const API_KEY = process.env.YT_MEDIA_INFO_API_KEY || '';

// Create the MCP server
const server = new McpServer({
  name: 'yt-media-info MCP',
  version: '1.0.0',
  description:
    'A Model Context Protocol server that extracts rich metadata from media URLs using yt-dlp',
});

const sseManager = new SseManager(server);

// Register prompts
analyzeVideoPrompt(server);
summarizeTranscriptPrompt(server);

// Register tools (pass sseManager for progress notifications)
extractInfoTool(server, sseManager);
getTranscriptTool(server, sseManager);
searchMediaTool(server, sseManager);

// Transport references
let httpServer = null;

// ---------------------------------------------------------------------------
// API key middleware (SSE mode only)
// ---------------------------------------------------------------------------
function apiKeyMiddleware(req, res, next) {
  if (!API_KEY) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Missing or invalid Authorization header. Expected: Bearer <key>',
      code: 'UNAUTHORIZED',
    });
  }

  const token = authHeader.slice('Bearer '.length);
  if (token !== API_KEY) {
    return res.status(401).json({
      error: 'Invalid API key',
      code: 'UNAUTHORIZED',
    });
  }

  next();
}

// ---------------------------------------------------------------------------
// SSE transport setup
// ---------------------------------------------------------------------------
function setupSSETransport() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Apply API key middleware to all endpoints except health check
  app.use((req, res, next) => {
    // Health check is always open (needed by Docker healthcheck)
    if (req.path === '/health') {
      return next();
    }
    return apiKeyMiddleware(req, res, next);
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'yt-media-info-mcp' });
  });

  // SSE connection endpoint
  app.get('/sse', async (req, res) => {
    const transport = sseManager.createTransport('/messages', res);

    res.on('close', () => {
      sseManager.removeTransport(transport.sessionId);
      logger.info(`Client disconnected: ${transport.sessionId}`);
    });

    await server.connect(transport);
    logger.info(`New SSE client connected: ${transport.sessionId}`);
  });

  // MCP message handling endpoint
  app.post('/messages', async (req, res) => {
    const transport = sseManager.getTransport(req);

    if (transport) {
      await transport.handlePostMessage(req, res, req.body);
    } else {
      res.status(400).send('No transport found for sessionId');
    }
  });

  // Direct API shortcut (bypasses MCP protocol)
  app.post('/api', async (req, res) => {
    const { tool, args } = req.body;

    if (!tool) {
      return res.status(400).json({
        error: 'Missing "tool" field in request body',
        code: 'BAD_REQUEST',
      });
    }

    try {
      let result;

      switch (tool) {
        case 'extract_info': {
          const serviceUrl =
            process.env.YT_MEDIA_INFO_SERVICE_URL || 'http://yt-media-info-service:8000';
          const response = await fetch(`${serviceUrl}/info`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: args?.url,
              include_raw: args?.include_raw ?? true,
              username:
                args?.username || process.env.YT_MEDIA_INFO_USERNAME || null,
              password:
                args?.password || process.env.YT_MEDIA_INFO_PASSWORD || null,
            }),
          });
          if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            return res.status(response.status).json(err);
          }
          result = await response.json();
          break;
        }
        case 'get_transcript': {
          const serviceUrl =
            process.env.YT_MEDIA_INFO_SERVICE_URL || 'http://yt-media-info-service:8000';
          const response = await fetch(`${serviceUrl}/transcript`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: args?.url,
              language: args?.language || 'en',
              timestamps: args?.timestamps ?? true,
              username:
                args?.username || process.env.YT_MEDIA_INFO_USERNAME || null,
              password:
                args?.password || process.env.YT_MEDIA_INFO_PASSWORD || null,
            }),
          });
          if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            return res.status(response.status).json(err);
          }
          result = await response.json();
          break;
        }
        case 'search_media': {
          const serviceUrl =
            process.env.YT_MEDIA_INFO_SERVICE_URL || 'http://yt-media-info-service:8000';
          const response = await fetch(`${serviceUrl}/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: args?.query,
              limit: args?.limit || 10,
              platform: args?.platform || 'youtube',
            }),
          });
          if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            return res.status(response.status).json(err);
          }
          result = await response.json();
          break;
        }
        default:
          return res.status(400).json({
            error: `Unknown tool: "${tool}". Supported: extract_info, get_transcript, search_media`,
            code: 'UNKNOWN_TOOL',
          });
      }

      res.json(result);
    } catch (error) {
      logger.error('Error in /api handler', { error: error.message });
      res.status(500).json({
        error: error.message,
        code: 'INTERNAL_SERVER_ERROR',
      });
    }
  });

  // Start Express
  httpServer = app.listen(PORT, HOST, () => {
    logger.info(`SSE server listening at http://${HOST}:${PORT}`);
    logger.info(`SSE endpoint: http://${HOST}:${PORT}/sse`);
    logger.info(`Messages endpoint: http://${HOST}:${PORT}/messages`);
    logger.info(`Direct API: http://${HOST}:${PORT}/api`);
    logger.info(`Health: http://${HOST}:${PORT}/health`);
    if (API_KEY) {
      logger.info('API key authentication is ENABLED');
    } else {
      logger.info('API key authentication is DISABLED');
    }
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function runServer() {
  logger.info('Starting yt-media-info MCP...');

  try {
    const connectedTransports = [];

    if (ENABLE_SSE) {
      setupSSETransport();
      connectedTransports.push('SSE');
    } else {
      // stdio mode (default for Claude Desktop)
      const stdioTransport = new StdioServerTransport();
      await server.connect(stdioTransport);
      connectedTransports.push('stdio');
      logger.info('Stdio transport connected');
    }

    if (connectedTransports.length === 0) {
      throw new Error('No transports connected. Check configuration.');
    }

    logger.info(
      `Server started with transports: ${connectedTransports.join(', ')}`
    );
  } catch (error) {
    logger.error('Server startup error', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
async function shutdown() {
  logger.info('Shutting down yt-media-info MCP...');

  try {
    await server.disconnect();

    if (httpServer) {
      httpServer.close(() => {
        logger.info('HTTP server closed');
      });
    }

    logger.info('Server shutdown complete');
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
  } finally {
    setTimeout(() => process.exit(0), 100);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Run
runServer().catch((error) => {
  logger.error('Unhandled error', { error: error.message });
  process.exit(1);
});
