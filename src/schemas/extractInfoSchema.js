import { z } from 'zod';

export const extractInfoParams = {
  url: z.string().describe('Media URL to extract information from'),
  include_raw: z
    .any()
    .describe('Include the full yt-dlp info_dict under a "raw" field')
    .transform((val) => {
      if (typeof val === 'string') {
        return ['true', 'yes', '1', 'on', 'y'].includes(val.toLowerCase());
      }
      return val !== false && val !== null && val !== undefined;
    })
    .default(true),
  username: z
    .string()
    .nullable()
    .describe('Username for site authentication')
    .default(null),
  password: z
    .string()
    .nullable()
    .describe('Password for site authentication')
    .default(null),
};
