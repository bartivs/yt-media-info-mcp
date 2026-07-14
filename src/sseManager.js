import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

import logger from './logger.js';

/**
 * Manages SSE server transports for multiple client connections.
 * Mirrors the jobspy-mcp-server SseManager pattern.
 */
class SseManager {
  /** @type {Object.<string, SSEServerTransport>} */
  transports = {};

  /** @type {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} */
  mcpServer;

  /** @type {Object.<string, *>} */
  progressTokens = {};

  constructor(server) {
    this.mcpServer = server;
  }

  /**
   * Adds a new SSE transport for a client
   * @param {string} sendPath - Path for client to send messages to
   * @param {Response} res - Express response object
   * @returns {SSEServerTransport} The created transport
   */
  createTransport(sendPath, res) {
    const transport = new SSEServerTransport(sendPath, res);
    this.transports[transport.sessionId] = transport;
    return transport;
  }

  /**
   * Gets a transport by sessionId from the request
   * @param {import('express').Request} req
   * @returns {SSEServerTransport|undefined}
   */
  getTransport(req) {
    const sessionId = req.query.sessionId;
    this.progressTokens[sessionId] = req.body?.params?._meta?.progressToken;
    return this.transports[sessionId];
  }

  /**
   * Removes a transport when client disconnects
   * @param {string} sessionId
   * @returns {boolean}
   */
  removeTransport(sessionId) {
    if (this.transports[sessionId]) {
      delete this.transports[sessionId];
      delete this.progressTokens[sessionId];
      logger.info(`Removed transport for session: ${sessionId}`);
      return true;
    }
    return false;
  }

  /**
   * Sends a progress notification to a specific session
   * @param {object} message - Progress message
   * @param {string} sessionId - Target session
   */
  async notificationProgress(message, sessionId) {
    const clients = Object.values(this.transports);
    if (clients.length === 0) return;
    await this.mcpServer.server.notification({
      method: 'notifications/progress',
      params: {
        ...message,
        progressToken: this.progressTokens[sessionId],
      },
    });
  }

  /**
   * Checks if a session has an active connection
   * @param {string} sessionId
   * @returns {boolean}
   */
  hasConnection(sessionId) {
    return !!this.transports[sessionId];
  }
}

export default SseManager;
