import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

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

// ---------------------------------------------------------------------------
// Cookie file helpers
// ---------------------------------------------------------------------------
const COOKIE_FILE_PATH = '/data/cookies.txt';
const MAX_COOKIE_FILE_SIZE = 1 * 1024 * 1024; // 1 MB
const COOKIE_HEADER = '# Netscape HTTP Cookie File';

/**
 * Validate that a buffer looks like a Netscape-format cookie file.
 * Returns null if valid, or an error message string if invalid.
 */
function validateCookieFile(buffer) {
  if (!buffer || buffer.length === 0) {
    return 'File is empty';
  }

  if (buffer.length > MAX_COOKIE_FILE_SIZE) {
    return `File exceeds maximum size of ${MAX_COOKIE_FILE_SIZE / 1024 / 1024}MB`;
  }

  const header = buffer.toString('utf-8', 0, Math.min(buffer.length, COOKIE_HEADER.length));
  if (!header.startsWith(COOKIE_HEADER)) {
    return `File must be a Netscape-format cookie file starting with "${COOKIE_HEADER}"`;
  }

  return null;
}

/**
 * Parse a cookie file buffer and extract metadata.
 * Returns { domains, count, expires } where expires is earliest expiry as ISO string.
 */
function parseCookieInfo(buffer) {
  const text = buffer.toString('utf-8');
  const lines = text.split('\n');
  const domains = new Set();
  let minExpiry = null;
  let count = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines, comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Netscape cookie format: domain flag path secure expiry name value
    const parts = trimmed.split('\t');
    if (parts.length >= 7) {
      const domain = parts[0];
      const expiryStr = parts[4];

      domains.add(domain.startsWith('.') ? domain.slice(1) : domain);
      count++;

      const expiry = parseInt(expiryStr, 10);
      if (!isNaN(expiry) && expiry > 0) {
        if (minExpiry === null || expiry < minExpiry) {
          minExpiry = expiry;
        }
      }
    }
  }

  return {
    domains: [...domains].sort(),
    count,
    expires: minExpiry ? new Date(minExpiry * 1000).toISOString() : null,
  };
}

/**
 * Write buffer to the cookie file path atomically.
 * Writes to a .tmp file first, then renames to the final path.
 */
function writeCookieFile(buffer) {
  const dir = path.dirname(COOKIE_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tmpPath = COOKIE_FILE_PATH + '.tmp';
  fs.writeFileSync(tmpPath, buffer);
  fs.renameSync(tmpPath, COOKIE_FILE_PATH);
}

/**
 * Delete the cookie file. Returns true if file was deleted, false if not found.
 */
function deleteCookieFile() {
  if (fs.existsSync(COOKIE_FILE_PATH)) {
    fs.unlinkSync(COOKIE_FILE_PATH);
    return true;
  }
  return false;
}

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

  // Multer for cookie file upload (single file, field name 'cookies')
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_COOKIE_FILE_SIZE,
    },
  });

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

  // ---------------------------------------------------------------------------
  // Cookie upload form
  // ---------------------------------------------------------------------------

  // Serve the HTML upload form
  app.get('/', (req, res) => {
    const cookiesExist = fs.existsSync(COOKIE_FILE_PATH);
    let cookieInfo = null;

    if (cookiesExist) {
      try {
        const buffer = fs.readFileSync(COOKIE_FILE_PATH);
        if (buffer.length <= MAX_COOKIE_FILE_SIZE) {
          cookieInfo = parseCookieInfo(buffer);
        }
      } catch {
        // File might be partially written; ignore
      }
    }

    const cookieInfoJson = JSON.stringify(cookieInfo);

    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cookie Management — yt-media-info MCP</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; line-height: 1.6; padding: 2rem; }
    .container { max-width: 640px; margin: 0 auto; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { margin-bottom: 1rem; color: #666; }
    .card { background: #fff; border-radius: 8px; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 1rem; }
    label { display: block; font-weight: 600; margin-bottom: 0.5rem; }
    input[type="file"] { display: block; width: 100%; padding: 0.5rem; border: 2px dashed #ccc; border-radius: 4px; margin-bottom: 1rem; }
    button { background: #007bff; color: #fff; border: none; padding: 0.6rem 1.2rem; border-radius: 4px; cursor: pointer; font-size: 0.9rem; }
    button:hover { background: #0056b3; }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    button.danger { background: #dc3545; }
    button.danger:hover { background: #a71d2a; }
    .status { margin-top: 1rem; padding: 0.8rem; border-radius: 4px; display: none; }
    .status.success { display: block; background: #d4edda; border: 1px solid #c3e6cb; color: #155724; }
    .status.error { display: block; background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; }
    .status.info { display: block; background: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460; }
    .status.loading { display: block; background: #fff3cd; border: 1px solid #ffeeba; color: #856404; }
    .progress-bar { width: 100%; height: 8px; background: #e9ecef; border-radius: 4px; margin-top: 0.5rem; overflow: hidden; display: none; }
    .progress-bar .fill { height: 100%; background: #007bff; width: 0%; transition: width 0.3s; }
    .domain-list { margin-top: 0.5rem; }
    .domain-list span { display: inline-block; background: #e9ecef; padding: 0.2rem 0.5rem; border-radius: 3px; margin: 0.2rem; font-size: 0.8rem; }
    .instructions { background: #fff; border-radius: 8px; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 1rem; }
    .instructions h2 { font-size: 1.1rem; margin-bottom: 0.5rem; }
    .instructions code { background: #e9ecef; padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.85rem; }
    .instructions pre { background: #f8f9fa; padding: 0.8rem; border-radius: 4px; overflow-x: auto; font-size: 0.8rem; margin: 0.5rem 0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Cookie Management</h1>
    <p>Upload a Netscape-format <code>cookies.txt</code> file to authenticate requests to supported sites.</p>

    <div class="card">
      <label for="cookieFile">Select cookies.txt file</label>
      <input type="file" id="cookieFile" accept=".txt">
      <button id="uploadBtn">Upload Cookies</button>

      <div class="progress-bar" id="progressBar">
        <div class="fill" id="progressFill"></div>
      </div>

      <div class="status" id="status"></div>
    </div>

    <div class="card" id="currentCookiesCard" style="${cookiesExist ? '' : 'display:none'}">
      <h2>Current Cookies</h2>
      <div id="currentCookieInfo">
        ${cookieInfo ? `
          <p><strong>${cookieInfo.count}</strong> cookie entries for <strong>${cookieInfo.domains.length}</strong> domain(s)</p>
          <div class="domain-list">${cookieInfo.domains.map(d => `<span>${d}</span>`).join('')}</div>
          ${cookieInfo.expires ? `<p style="margin-top:0.5rem;font-size:0.85rem;color:#666">Earliest expiry: ${new Date(cookieInfo.expires).toLocaleDateString()}</p>` : ''}
        ` : '<p style="color:#666">Could not parse existing cookie file.</p>'}
      </div>
      <button class="danger" id="deleteBtn" style="margin-top:1rem">Delete Cookies</button>
    </div>

    <div class="instructions">
      <h2>How to export cookies</h2>
      <p>Use yt-dlp to extract cookies from your browser:</p>
      <pre>yt-dlp --cookies-from-browser chrome --cookies cookies.txt</pre>
      <p>Or use a browser extension like <a href="https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc" target="_blank" rel="noopener">Get cookies.txt LOCALLY</a>.</p>
      <p style="margin-top:0.5rem">The file must start with <code># Netscape HTTP Cookie File</code> and be under 1 MB.</p>
    </div>

    <div class="instructions" id="deleteSection" style="${cookiesExist ? '' : 'display:none'}">
      <h2>Cookie file location</h2>
      <p>The uploaded file is stored at <code>/data/cookies.txt</code> on the shared Docker volume. The Python service reads this file on every extraction request.</p>
      <p style="margin-top:0.5rem;font-size:0.85rem;color:#666">If the cookie-bot sidecar is running, it will periodically refresh cookies. Your uploaded file will be overwritten on the next refresh cycle.</p>
    </div>
  </div>

  <script>
    const fileInput = document.getElementById('cookieFile');
    const uploadBtn = document.getElementById('uploadBtn');
    const deleteBtn = document.getElementById('deleteBtn');
    const statusDiv = document.getElementById('status');
    const progressBar = document.getElementById('progressBar');
    const progressFill = document.getElementById('progressFill');
    const currentCookiesCard = document.getElementById('currentCookiesCard');
    const currentCookieInfo = document.getElementById('currentCookieInfo');
    const deleteSection = document.getElementById('deleteSection');

    function showStatus(message, type) {
      statusDiv.className = 'status ' + type;
      statusDiv.textContent = message;
      statusDiv.style.display = 'block';
    }

    function showProgress(pct) {
      progressBar.style.display = 'block';
      progressFill.style.width = pct + '%';
    }

    function hideProgress() {
      progressBar.style.display = 'none';
      progressFill.style.width = '0%';
    }

    uploadBtn.addEventListener('click', async () => {
      const file = fileInput.files[0];
      if (!file) {
        showStatus('Please select a file first.', 'error');
        return;
      }

      showStatus('Uploading...', 'loading');
      showProgress(0);
      uploadBtn.disabled = true;

      const formData = new FormData();
      formData.append('cookies', file);

      // Use XMLHttpRequest for upload progress tracking
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          showProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      xhr.addEventListener('load', () => {
        hideProgress();
        uploadBtn.disabled = false;

        if (xhr.status === 200) {
          const data = JSON.parse(xhr.responseText);
          const domains = data.domains || [];
          const count = data.count || 0;
          const expires = data.expires ? new Date(data.expires).toLocaleDateString() : null;

          let html = 'Cookies uploaded successfully!';
          html += '<p><strong>' + count + '</strong> cookie entries for <strong>' + domains.length + '</strong> domain(s)</p>';
          if (domains.length > 0) {
            html += '<div class="domain-list">' + domains.map(d => '<span>' + d + '</span>').join('') + '</div>';
          }
          if (expires) {
            html += '<p style="margin-top:0.5rem;font-size:0.85rem;color:#666">Earliest expiry: ' + expires + '</p>';
          }

          showStatus(html, 'success');

          // Update the current cookies section
          currentCookiesCard.style.display = 'block';
          currentCookieInfo.innerHTML = '<p><strong>' + count + '</strong> cookie entries for <strong>' + domains.length + '</strong> domain(s)</p>' +
            (domains.length > 0 ? '<div class="domain-list">' + domains.map(d => '<span>' + d + '</span>').join('') + '</div>' : '') +
            (expires ? '<p style="margin-top:0.5rem;font-size:0.85rem;color:#666">Earliest expiry: ' + expires + '</p>' : '');
          deleteSection.style.display = 'block';
          deleteBtn.style.display = '';

          // Clear file input
          fileInput.value = '';
        } else {
          let msg = 'Upload failed';
          try {
            const err = JSON.parse(xhr.responseText);
            msg = err.error || msg;
          } catch {}
          showStatus(msg, 'error');
        }
      });

      xhr.addEventListener('error', () => {
        hideProgress();
        uploadBtn.disabled = false;
        showStatus('Network error. Please try again.', 'error');
      });

      xhr.open('POST', '/upload-cookies', true);
      xhr.send(formData);
    });

    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to delete the cookie file?')) {
          return;
        }

        showStatus('Deleting...', 'loading');
        deleteBtn.disabled = true;

        try {
          const response = await fetch('/delete-cookies', { method: 'POST' });
          const data = await response.json();

          if (data.deleted) {
            showStatus('Cookies deleted successfully.', 'success');
            currentCookiesCard.style.display = 'none';
            deleteSection.style.display = 'none';
          } else {
            showStatus(data.message || 'No cookie file to delete.', 'info');
          }
        } catch (err) {
          showStatus('Error deleting cookies: ' + err.message, 'error');
        } finally {
          deleteBtn.disabled = false;
        }
      });
    }
  </script>
</body>
</html>`);
  });

  // Upload cookies
  app.post('/upload-cookies', upload.single('cookies'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'No file provided. Use multipart/form-data with field name "cookies".',
          code: 'BAD_REQUEST',
        });
      }

      const buffer = req.file.buffer;

      // Validate
      const validationError = validateCookieFile(buffer);
      if (validationError) {
        return res.status(400).json({
          error: validationError,
          code: 'BAD_REQUEST',
        });
      }

      // Parse info before writing
      const info = parseCookieInfo(buffer);

      // Write atomically
      writeCookieFile(buffer);

      logger.info('Cookie file uploaded', {
        count: info.count,
        domains: info.domains.length,
        expires: info.expires,
      });

      res.json({
        domains: info.domains,
        count: info.count,
        expires: info.expires,
      });
    } catch (error) {
      logger.error('Error uploading cookie file', { error: error.message });
      res.status(500).json({
        error: 'Failed to upload cookie file: ' + error.message,
        code: 'INTERNAL_SERVER_ERROR',
      });
    }
  });

  // Delete cookies
  app.post('/delete-cookies', (req, res) => {
    try {
      const deleted = deleteCookieFile();

      if (deleted) {
        logger.info('Cookie file deleted');
        res.json({ deleted: true });
      } else {
        res.json({ deleted: false, message: 'No cookie file to delete' });
      }
    } catch (error) {
      logger.error('Error deleting cookie file', { error: error.message });
      res.status(500).json({
        error: 'Failed to delete cookie file: ' + error.message,
        code: 'INTERNAL_SERVER_ERROR',
      });
    }
  });

  // Multer error handler (file too large, etc.)
  app.use((err, req, res, next) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: `File exceeds maximum size of ${MAX_COOKIE_FILE_SIZE / 1024 / 1024}MB`,
        code: 'FILE_TOO_LARGE',
      });
    }
    next(err);
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
    logger.info(`Cookie upload form: http://${HOST}:${PORT}/`);
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
