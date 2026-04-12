import { OpenAI } from "openai";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function getOrCreateAssistant() {
  const assistantId = process.env.ASSISTANT_ID;

  if (assistantId) {
    try {
      return await openai.beta.assistants.retrieve(assistantId);
    } catch (e) {
      console.warn("Assistant in ENV not found, creating new one...");
    }
  }

  const assistant = await openai.beta.assistants.create({
    name: "Healthcare Support AI",
    instructions: `Bạn là một trợ lý AI đồng cảm và hỗ trợ chuyên chăm sóc bệnh nhân sa sút trí tuệ.
Hãy sử dụng tone 'mình-bạn' thân thiện.
Dựa trên kiến thức được cung cấp từ các tài liệu y tế đi kèm.
KHÔNG thay thế lời khuyên y tế chuyên nghiệp.`,
    model: "gpt-4o",
    tools: [{ type: "file_search" }],
  });

  return assistant;
}

export async function getOrCreateVectorStore() {
  const assistant = await getOrCreateAssistant();
  if (assistant.tool_resources?.file_search?.vector_store_ids?.[0]) {
    return assistant.tool_resources.file_search.vector_store_ids[0];
  }

  const vectorStore = await (openai.beta as any).vectorStores.create({
    name: "Medical Knowledge Base",
  });

  await openai.beta.assistants.update(assistant.id, {
    tool_resources: {
      file_search: {
        vector_store_ids: [vectorStore.id],
      },
    },
  });

  return vectorStore.id;
}

export async function createThread() {
  return await openai.beta.threads.create();
}

export async function getThread(threadId: string) {
  return await openai.beta.threads.retrieve(threadId);
}

export function parseCitations(message: any) {
  const citations: string[] = [];
  const text = message.content[0].text.value;
  const annotations = message.content[0].text.annotations;

  let formattedText = text;

  annotations.forEach((annotation: any, index: number) => {
    const { file_citation } = annotation;
    if (file_citation) {
      const citationIndex = index + 1;
      formattedText = formattedText.replace(
        annotation.text,
        ` [${citationIndex}]`
      );
      citations.push(`[${citationIndex}] File ID: ${file_citation.file_id}`);
    }
  });

  return { text: formattedText, citations };
}
