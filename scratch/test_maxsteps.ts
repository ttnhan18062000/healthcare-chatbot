import 'dotenv/config';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

async function test() {
  console.log('API Key found:', !!process.env.OPENAI_API_KEY);

  const result = streamText({
    model: openai('gpt-4o'),
    system: 'You are a helpful assistant. After calling a tool you MUST write a text summary. NEVER stop after a tool call.',
    messages: [{ role: 'user', content: 'What is the weather in Paris?' }],
    maxSteps: 5,
    tools: {
      getWeather: {
        description: 'Get raw weather data. You must write a text summary after.',
        inputSchema: z.object({
          city: z.string(),
        }),
        execute: async ({ city }) => {
          return { temperature: 22, condition: 'sunny', city };
        },
      },
    },
  });

  let stepCount = 0;
  let hasTextDelta = false;
  for await (const chunk of result.fullStream) {
    if (chunk.type === 'start-step') {
      stepCount++;
      console.log(`\n--- STEP ${stepCount} ---`);
    }
    if (chunk.type === 'text-delta') {
      hasTextDelta = true;
      const text = (chunk as any).textDelta || (chunk as any).text || '';
      process.stdout.write(text);
    }
    if (chunk.type === 'tool-output-available' || chunk.type === 'tool-result') {
      console.log(`\n[TOOL-RESULT] received`);
    }
    if (chunk.type === 'finish-step') {
      console.log(`\n[FINISH-STEP]`);
    }
    if (chunk.type === 'finish') {
      console.log(`[FINISH] reason: ${(chunk as any).finishReason}`);
    }
  }
  console.log(`\nTotal steps: ${stepCount}`);
  console.log(`Has text after tool: ${hasTextDelta}`);
}

test().catch(console.error);
