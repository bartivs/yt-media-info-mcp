import { z } from 'zod';

export const transcriptParams = {
  url: z.string().describe('Media URL to fetch transcript from'),
  language: z
    .string()
    .describe('Preferred subtitle language code (e.g. "en", "es")')
    .default('en'),
  timestamps: z
    .any()
    .describe('Include timestamp segments in the response')
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
