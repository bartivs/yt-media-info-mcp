import { z } from 'zod';

export const analyzeVideoPrompt = (server) =>
  server.prompt(
    'analyze_video',
    'Analyze a video or media item from its available metadata to provide insights, context, and high-level understanding',
    {
      title: z.string().describe('Title of the video/media'),
      description: z.string().describe('Description of the video/media'),
      duration: z
        .number()
        .nullable()
        .describe('Duration in seconds'),
      uploader: z.string().nullable().describe('Uploader or channel name'),
      categories: z
        .string()
        .nullable()
        .describe('Comma-separated categories or tags'),
      transcript_summary: z
        .string()
        .nullable()
        .describe('Optional summary of the transcript content'),
    },
    (inputs) => ({
      messages: [
        {
          role: 'system',
          content: `
You are a media analyst specializing in extracting insights from video and audio content metadata.
Given the metadata about a media item, provide a comprehensive analysis covering:
1. What this content is about
2. Key themes and topics
3. Target audience
4. Quality indicators (production value, engagement metrics)
5. Notable elements (guests, unique angles, controversial topics)
6. Any missing context that would be useful to know

Keep the analysis factual and grounded in the provided metadata.
`,
        },
        {
          role: 'user',
          content: `
Please analyze this media item:

Title: ${inputs.title}
Description: ${inputs.description}
Duration: ${inputs.duration || 'Unknown'} seconds
Uploader/Channel: ${inputs.uploader || 'Unknown'}
Categories/Tags: ${inputs.categories || 'None'}
Transcript Summary: ${inputs.transcript_summary || 'Not available'}
          `,
        },
      ],
    })
  );
