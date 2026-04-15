import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

async function test() {
  const result = (streamText as any)({
    model: openai('gpt-4o'),
    messages: [{ role: 'user', content: 'hello' }],
  });
  
  if (result.toUIMessageStreamResponse) {
    console.log('toUIMessageStreamResponse exists!');
    console.log('Function string:', result.toUIMessageStreamResponse.toString().slice(0, 500));
  } else {
    console.log('toUIMessageStreamResponse NOT FOUND on result');
  }
}

test().catch(console.error);
 Pip联系
