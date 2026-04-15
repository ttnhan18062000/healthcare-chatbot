import * as ai from 'ai';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

async function test() {
  console.log('AI Exports:', Object.keys(ai));
  
  const result = streamText({
    model: openai('gpt-4o'),
    messages: [{ role: 'user', content: 'hello' }],
  });
  
  let proto = Object.getPrototypeOf(result);
  console.log('Prototype keys:', Object.keys(proto));
  while (proto) {
    console.log('--- Level ---');
    console.log(Object.getOwnPropertyNames(proto));
    proto = Object.getPrototypeOf(proto);
  }
}

test().catch(console.error);
 Pip联系
