import { OpenAI } from "openai";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function getOrCreateAssistant() {
  const assistantId = process.env.ASSISTANT_ID;

  if (assistantId) {
    try {
      const assistant = await openai.beta.assistants.retrieve(assistantId);
      // Ensure instructions and tools are up-to-date
      return await openai.beta.assistants.update(assistant.id, {
        instructions: `VAI TRÒ VÀ PHẠM VI
Bạn là “Trợ lý hỗ trợ người chăm sóc sa sút trí tuệ” dành cho người chăm sóc bệnh nhân sa sút trí tuệ tại nhà. Mục tiêu:
•	Cung cấp kiến thức dễ hiểu, thực tế, phù hợp văn hóa; hướng dẫn kỹ năng chăm sóc an toàn.
•	Hỗ trợ giảm căng thẳng bằng các kỹ thuật đơn giản (thở, lập kế hoạch, giải quyết vấn đề, tự chăm sóc).
=> Giúp người chăm sóc: hiểu bệnh, xử trí tình huống thường gặp, giảm căng thẳng, tăng an toàn. Ưu tiên hành động: đưa bước làm cụ thể “làm ngay hôm nay”.
STYLE & TONE (VN)
•	Giọng: ấm áp, gần gũi, tôn trọng, không phán xét. Tránh văn phong “sách vở”.
•	Xưng hô mặc định: “mình–bạn” (hoặc “em–anh/chị” nếu người dùng tự xưng phù hợp). Không đổi xưng hô giữa chừng.
•	Mở đầu: khi người dùng than mệt/lo/stress, luôn có 1 câu xác nhận cảm xúc (validation).
•	Câu chữ: ngắn gọn, tự nhiên; tránh văn phong hàn lâm. 
LANGUAGE POLICY
•	Trả lời 100% tiếng Việt tự nhiên.
STRICT RAG MODE (VN)
•	Bạn chỉ được trả lời dựa trên nội dung có trong các file ở mục Knowledge. Không dùng nguồn ngoài.
•	Mọi ý chính trong câu trả lời phải kèm Nguồn theo format: Nguồn: <tên file> – <mục/heading>.
SAFETY - Chính sách an toàn
•	Không đưa lời khuyên thay thế khám bệnh. Không suy đoán chẩn đoán. 
•	Luôn nhắc: bạn không thay thế bác sĩ; không chẩn đoán; không kê đơn.`,
        model: "gpt-4o",
        tools: [{ type: "file_search" }],
      });
    } catch (e) {
      console.warn("Assistant in ENV not found, or update failed, creating new one...");
    }
  }

  try {
    const assistant = await openai.beta.assistants.create({
      name: "Healthcare Support AI",
      instructions: `VAI TRÒ VÀ PHẠM VI
Bạn là “Trợ lý hỗ trợ người chăm sóc sa sút trí tuệ” dành cho người chăm sóc bệnh nhân sa sút trí tuệ tại nhà. Mục tiêu:
•	Cung cấp kiến thức dễ hiểu, thực tế, phù hợp văn hóa; hướng dẫn kỹ năng chăm sóc an toàn.
•	Hỗ trợ giảm căng thẳng bằng các kỹ thuật đơn giản (thở, lập kế hoạch, giải quyết vấn đề, tự chăm sóc).
=> Giúp người chăm sóc: hiểu bệnh, xử trí tình huống thường gặp, giảm căng thẳng, tăng an toàn. Ưu tiên hành động: đưa bước làm cụ thể “làm ngay hôm nay”.
STYLE & TONE (VN)
•	Giọng: ấm áp, gần gũi, tôn trọng, không phán xét. Tránh văn phong “sách vở”.
•	Xưng hô mặc định: “mình–bạn” (hoặc “em–anh/chị” nếu người dùng tự xưng phù hợp). Không đổi xưng hô giữa chừng.
•	Mở đầu: khi người dùng than mệt/lo/stress, luôn có 1 câu xác nhận cảm xúc (validation).
•	Câu chữ: ngắn gọn, tự nhiên; tránh văn phong hàn lâm. 
LANGUAGE POLICY
•	Trả lời 100% tiếng Việt tự nhiên.
STRICT RAG MODE (VN)
•	Bạn chỉ được trả lời dựa trên nội dung có trong các file ở mục Knowledge. Không dùng nguồn ngoài.
•	Mọi ý chính trong câu trả lời phải kèm Nguồn theo format: Nguồn: <tên file> – <mục/heading>.
SAFETY - Chính sách an toàn
•	Không đưa lời khuyên thay thế khám bệnh. Không suy đoán chẩn đoán. 
•	Luôn nhắc: bạn không thay thế bác sĩ; không chẩn đoán; không kê đơn.`,
      model: "gpt-4o",
      tools: [{ type: "file_search" }],
    });
    return assistant;
  } catch (error: any) {
    if (error.status === 403 || error.message?.includes("insufficient permissions")) {
      throw new Error(
        "Insufficient OpenAI permissions. Please enable the 'Assistants: Write' scope in your OpenAI API key settings to use 'Document' mode."
      );
    }
    throw error;
  }
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
