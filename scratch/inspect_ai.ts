import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

async function test() {
  const result = streamText({
    model: openai('gpt-4o'),
    messages: [{ role: 'user', content: 'hello' }],
  });
  console.log('Keys in result:', Object.keys(result));
  console.log('Prototype keys:', Object.keys(Object.getPrototypeOf(result)));
}

test().catch(console.error);
 Pip联系
