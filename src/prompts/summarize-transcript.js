import { z } from 'zod';

export const summarizeTranscriptPrompt = (server) =>
  server.prompt(
    'summarize_transcript',
    'Summarize the transcript of a video or audio file to extract key points and actionable insights',
    {
      title: z.string().describe('Title of the video/media'),
      transcript: z.string().describe('Full transcript text to summarize'),
      language: z
        .string()
        .nullable()
        .describe('Language of the transcript'),
      duration: z
        .number()
        .nullable()
        .describe('Duration of the media in seconds'),
    },
    (inputs) => ({
      messages: [
        {
          role: 'system',
          content: `
You are an expert at summarizing video and audio transcripts.
Given a full transcript, produce a clear, structured summary that covers:

1. **Core Topic** — What is this content about in one sentence?
2. **Key Points** — 3-7 bullet points covering the main arguments or information
3. **Notable Quotes** — Any particularly insightful or quotable passages
4. **Practical Takeaways** — Actionable insights or lessons
5. **Structure** — How the content is organized (chapters, sections)

Be concise but thorough. Preserve important details and nuance.
`,
        },
        {
          role: 'user',
          content: `
Please summarize the following transcript:

Title: ${inputs.title}
Language: ${inputs.language || 'Unknown'}
Duration: ${inputs.duration || 'Unknown'} seconds

Transcript:
${inputs.transcript}
          `,
        },
      ],
    })
  );
