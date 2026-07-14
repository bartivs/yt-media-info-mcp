import logger from '../logger.js';
import { extractInfoParams } from '../schemas/extractInfoSchema.js';

const SERVICE_URL = process.env.YT_MEDIA_INFO_SERVICE_URL || 'http://yt-media-info-service:8000';

/**
 * extract_info MCP tool
 * Extracts rich metadata from a media URL using yt-dlp.
 */
export const extractInfoTool = (server, sseManager) =>
  server.tool(
    'extract_info',
    'Extract rich metadata from a media URL (title, description, duration, formats, chapters, subtitles, statistics, and more)',
    extractInfoParams,
    async (params, extra) => {
      let progressInterval;
      try {
        logger.info('Received extract_info request', { url: params.url });

        if (extra.sessionId && sseManager.hasConnection(extra.sessionId)) {
          let progress = 0;
          progressInterval = setInterval(() => {
            progress += 10;
            if (progress > 80) progress = 80;
            sseManager.notificationProgress(
              {
                type: 'progress',
                tool: 'extract_info',
                progress,
                message: `Extracting metadata from ${params.url} (${progress}%)...`,
              },
              extra.sessionId
            );
          }, 2000);
        }

        const body = {
          url: params.url,
          include_raw: params.include_raw,
          username: params.username || process.env.YT_MEDIA_INFO_USERNAME || null,
          password: params.password || process.env.YT_MEDIA_INFO_PASSWORD || null,
        };

        const response = await fetch(`${SERVICE_URL}/info`, {
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
                tool: 'extract_info',
                progress: 100,
                message: 'Metadata extraction completed',
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
        logger.error('Error in extract_info handler', { error: error.message });
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
