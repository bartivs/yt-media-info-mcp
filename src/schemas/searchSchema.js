import { z } from 'zod';

export const searchParams = {
  query: z.string().describe('Search query for media discovery'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .describe('Maximum number of results (max 50)')
    .default(10),
  platform: z
    .enum(['youtube', 'google_videos'])
    .describe('Platform to search. youtube → ytsearch:, google_videos → gvsearch:')
    .default('youtube'),
};
