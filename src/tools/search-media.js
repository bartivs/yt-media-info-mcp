import logger from '../logger.js';
import { searchParams } from '../schemas/searchSchema.js';

const SERVICE_URL = process.env.YT_MEDIA_INFO_SERVICE_URL || 'http://yt-media-info-service:8000';

/**
 * search_media MCP tool
 * Supplementary discovery tool using yt-dlp's search prefixes.
 */
export const searchMediaTool = (server, sseManager) =>
  server.tool(
    'search_media',
    'Search for media across supported platforms (YouTube, etc.) using yt-dlp search. This is a supplementary discovery tool meant to complement web search.',
    searchParams,
    async (params, extra) => {
      let progressInterval;
      try {
        logger.info('Received search_media request', { query: params.query, platform: params.platform });

        if (extra.sessionId && sseManager.hasConnection(extra.sessionId)) {
          let progress = 0;
          progressInterval = setInterval(() => {
            progress += 20;
            if (progress > 80) progress = 80;
            sseManager.notificationProgress(
              {
                type: 'progress',
                tool: 'search_media',
                progress,
                message: `Searching for "${params.query}" (${progress}%)...`,
              },
              extra.sessionId
            );
          }, 2000);
        }

        const body = {
          query: params.query,
          limit: params.limit,
          platform: params.platform,
        };

        const response = await fetch(`${SERVICE_URL}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (progressInterval) {
          clearInterval(progressInterval);
          if (extra.sessionId && sseManager.hasConnection(extra.sessionId)) {
            sseManager.notificationProgress(
              {
                type: 'progress',
                tool: 'search_media',
                progress: 100,
                message: 'Search completed',
              },
              extra.sessionId
            );
          }
        }

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          const detail = errorBody?.detail || {};
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    error: detail.message || `HTTP ${response.status}`,
                    code: detail.code || 'SERVICE_ERROR',
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        const data = await response.json();
        return {
          isError: false,
          content: [
            {
              type: 'text',
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (error) {
        if (progressInterval) clearInterval(progressInterval);
        logger.error('Error in search_media handler', { error: error.message });
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { error: error.message, code: 'INTERNAL_SERVER_ERROR' },
                null,
                2
              ),
            },
          ],
        };
      }
    }
  );
