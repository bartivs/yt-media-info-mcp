import logger from '../logger.js';
import { transcriptParams } from '../schemas/transcriptSchema.js';

const SERVICE_URL = process.env.YT_MEDIA_INFO_SERVICE_URL || 'http://yt-media-info-service:8000';

/**
 * get_transcript MCP tool
 * Fetches subtitles/transcript text for a media URL.
 */
export const getTranscriptTool = (server, sseManager) =>
  server.tool(
    'get_transcript',
    'Fetch subtitles or transcript text for a media URL, optionally with timestamp segments',
    transcriptParams,
    async (params, extra) => {
      let progressInterval;
      try {
        logger.info('Received get_transcript request', { url: params.url, language: params.language });

        if (extra.sessionId && sseManager.hasConnection(extra.sessionId)) {
          let progress = 0;
          progressInterval = setInterval(() => {
            progress += 15;
            if (progress > 85) progress = 85;
            sseManager.notificationProgress(
              {
                type: 'progress',
                tool: 'get_transcript',
                progress,
                message: `Fetching transcript for ${params.url} (${progress}%)...`,
              },
              extra.sessionId
            );
          }, 2000);
        }

        const body = {
          url: params.url,
          language: params.language,
          timestamps: params.timestamps,
          username: params.username || process.env.YT_MEDIA_INFO_USERNAME || null,
          password: params.password || process.env.YT_MEDIA_INFO_PASSWORD || null,
        };

        const response = await fetch(`${SERVICE_URL}/transcript`, {
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
                tool: 'get_transcript',
                progress: 100,
                message: 'Transcript fetch completed',
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
        logger.error('Error in get_transcript handler', { error: error.message });
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
