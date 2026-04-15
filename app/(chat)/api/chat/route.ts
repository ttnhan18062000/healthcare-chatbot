import { streamText, createUIMessageStreamResponse, generateText, stepCountIs } from "ai";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  deleteChatById,
  getChatById,
  saveChat,
  saveMessages,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { postRequestBodySchema, type PostRequestBody } from "./schema";
import {
  getOrCreateVectorStore,
  getOrCreateAssistant,
  openai as openaiClient,
} from "@/lib/ai/assistant";
import { openai } from "@ai-sdk/openai";

export const maxDuration = 60;

const SYSTEM_PROMPT_NORMAL = `Bạn là một trợ lý AI đồng cảm và hỗ trợ chuyên chăm sóc bệnh nhân sa sút trí tuệ.
Mục tiêu của bạn là lắng nghe, thấu hiểu khó khăn và đồng hành cùng người chăm sóc.
Hãy sử dụng tone 'mình-bạn' ấm áp, gần gũi và tôn trọng.
Khi người dùng chia sẻ sự mệt mỏi hoặc lo lắng, hãy luôn bắt đầu bằng một câu xác nhận cảm xúc (validation).
KHÔNG thay thế lời khuyên y tế chuyên nghiệp.`;

const SYSTEM_PROMPT_RAG = `VAI TRÒ VÀ PHẠM VI
Bạn là “Trợ lý hỗ trợ người chăm sóc sa sút trí tuệ” dành cho người chăm sóc bệnh nhân sa sút trí tuệ tại nhà. Mục tiêu:
•	Cung cấp kiến thức dễ hiểu, thực tế, phù hợp văn hóa; hướng dẫn kỹ năng chăm sóc an toàn.
•	Hỗ trợ giảm căng thẳng bằng các kỹ thuật đơn giản (thở, lập kế hoạch, giải quyết vấn đề, tự chăm sóc).
=> Giúp người chăm sóc: hiểu bệnh, xử trí tình huống thường gặp, giảm căng thẳng, tăng an toàn. Ưu tiên hành động: đưa bước làm cụ thể “làm ngay hôm nay”.
STYLE & TONE (VN)
•	Giọng: ấm áp, gần gũi, tôn trọng, không phán xét. Tránh văn phong “sách vở”.
•	Xưng hô mặc định: “mình–bạn” (hoặc “em–anh/chị” nếu người dùng tự xưng phù hợp). Không đổi xưng hô giữa chừng.
•	Mở đầu: khi người dùng than mệt/lo/stress, luôn có 1 câu xác nhận cảm xúc (validation).
•	Câu chữ: ngắn gọn, tự nhiên như nói chuyện đời thường; tránh văn phong hàn lâm.
STRICT RAG MODE (VN)
•	CHỈ trả lời dựa trên nội dung có trong Knowledge. TUYỆT ĐỐI KHÔNG dùng kiến thức chung.
•	BẮT BUỘC sử dụng công cụ documentSearch ngay lập tức để tìm thông tin chính xác.
•	Sau khi nhận được kết quả từ documentSearch, bạn BẮT BUỘC phải viết câu trả lời tổng hợp bằng chính lời của bạn dựa trên dữ liệu trả về. KHÔNG BAO GIỜ dừng lại sau khi gọi tool mà không viết phản hồi văn bản.
•	Bạn BẮT BUỘC phải trích dẫn nguồn cho từng khẳng định bằng cách giữ nguyên các dấu ngoặc vuông chứa số thứ tự trích dẫn (ví dụ [1], [2]) trong văn bản.
•	Mọi ý chính phải kèm Nguồn theo format: Nguồn: <tên file> – <mục/heading> ở cuối câu hoặc đoạn.
•	Nếu Knowledge không có thông tin, hãy trả lời: “Mình không thể trả lời câu hỏi của bạn dựa trên cơ sở dữ liệu hiện có.”
SAFETY - Chính sách an toàn
•	Không đưa lời khuyên thay thế khám bệnh hay chẩn đoán.
•	Luôn nhắc: bạn không thay thế bác sĩ/nhà trị liệu.`;

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (error) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  let { id: chatId, message, messages, mode: requestMode = "normal" } = requestBody;

  if (!message && messages && messages.length > 0) {
    const lastUserMessage = [...messages]
      .reverse()
      .find((m) => m.role === "user");
    if (lastUserMessage) {
      message = lastUserMessage as any;
    }
  }

  if (!message || message.role !== "user") {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const isTestBypass = process.env.NODE_ENV === 'development' && request.headers.get('x-test-bypass') === 'true';
  let session = null;

  if (!isTestBypass) {
    session = await auth();
    if (!session?.user) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }
  }

  const userId = session?.user?.id ?? "test-user-id";

  // LOG: Process User Input
  console.info(`[CHAT_API] Processing input for chat: ${chatId}`);
  console.info(`[CHAT_API] Request Mode: ${requestMode}`);
  console.info(`[CHAT_API] History Length: ${messages?.length || 0} messages`);

  // 1. Get or Create Vector Store only when RAG mode is selected
  let vectorStoreId: string | undefined;

  // 2. Get or Create Chat
  let chat = await getChatById({ id: chatId });

  if (!chat && !isTestBypass) {
    await saveChat({
      id: chatId,
      userId: userId,
      title: message.parts[0].type === "text" ? message.parts[0].text.slice(0, 50) : "New Chat",
      visibility: "private",
      mode: requestMode,
    });
    chat = { mode: requestMode } as any; // Initial temporary state
  }

  // 2. Determine Mode (Priority: requestMode selection > DB state)
  const mode = (isTestBypass || requestMode === "rag" || chat?.mode === "rag") ? "rag" : "normal";
  
  console.info(`[CHAT_API] Mode Decision - Request: ${requestMode}, DB: ${chat?.mode || 'none'}, Final: ${mode}`);

  // 3. Save User Message
  if (!isTestBypass && (!chat || !messages || messages.length === 0)) {
    await saveMessages({
      messages: [
        {
          id: message.id,
          chatId: chatId,
          role: "user",
          parts: message.parts,
          attachments: [],
          createdAt: new Date(),
        },
      ],
    });
  }

  const txtAttachment = message.parts.find(
    (p) => p.type === "file" && (p.name.endsWith(".txt") || (p.mediaType as string) === "text/plain")
  );

  if (txtAttachment && txtAttachment.type === "file") {
    return createUIMessageStreamResponse({
      stream: new ReadableStream({
        async start(controller) {
          const dataStream = {
            writeData: (data: any) => {
              controller.enqueue({ type: "data", data } as any);
            },
            writeText: (text: string) => {
              controller.enqueue({ type: "text-delta", textDelta: text } as any);
            },
            writeMessageAnnotation: (annotation: any) => {
              controller.enqueue({ type: "message-annotation", ...annotation } as any);
            }
          };
        try {
          const fileResponse = await fetch(txtAttachment.url);
          const content = await fileResponse.text();
          const lines = content.split("\n").filter((l) => l.trim().length > 0);

          if (lines.length > 100) {
            dataStream.writeMessageAnnotation({
              type: "error",
              content: "Rejecting file: Batch processing limit is 100 lines.",
            });
            return;
          }

          const results = [];
          for (const line of lines) {
            const { text } = await generateText({
              model: openai("gpt-4o"),
              system: mode === "rag" ? SYSTEM_PROMPT_RAG : SYSTEM_PROMPT_NORMAL,
              prompt: line,
              tools: mode === "rag" ? {
                documentSearch: {
                  description: "Search for medical information in provided healthcare documents and manuals.",
                  inputSchema: z.object({
                    query: z.string().describe("The search query for medical information."),
                  }),
                  execute: async ({ query }) => {
                    const vectorStoreId = await getOrCreateVectorStore();
                    const assistant = await getOrCreateAssistant();
                    const thread = await openaiClient.beta.threads.create();
                    await openaiClient.beta.threads.messages.create(thread.id, { role: "user", content: query });
                    const run = await openaiClient.beta.threads.runs.createAndPoll(thread.id, {
                      assistant_id: assistant.id,
                    });
                    if (run.status === "completed") {
                      const messages = await openaiClient.beta.threads.messages.list(thread.id);
                      if (messages.data[0]?.content[0]?.type === "text") {
                        const text = messages.data[0].content[0].text;
                        let formattedText = text.value;

                        const citations = await Promise.all(text.annotations.map(async (ann: any, i: number) => {
                          const id = (i + 1).toString();
                          const marker = `[${id}]`;
                          if (ann.text) {
                            formattedText = formattedText.replace(ann.text, marker);
                          }
                          return {
                            id,
                            snippet: ann.text || "Medical reference",
                            source: ann.file_citation?.file_id 
                              ? (await openaiClient.files.retrieve(ann.file_citation.file_id)).filename 
                              : "Knowledge Base"
                          };
                        }));

                        return {
                          text: formattedText,
                          citations
                        };
                      }
                    }
                    return { text: "No results", citations: [] };
                  },
                },
              } : {},
            });
            results.push({ input: line, output: text });
          }

          const jsonResult = JSON.stringify(results, null, 2);
          dataStream.writeData({ type: "batch-result", data: jsonResult });
          dataStream.writeText("(Result.json) click to download");

          // Save batch message
          await saveMessages({
            messages: [
              {
                id: `${chatId}-${Date.now()}`,
                chatId,
                role: "assistant",
                parts: [{ type: "text", text: "(Result.json) click to download" }],
                attachments: [],
                createdAt: new Date(),
              },
            ],
          });
          controller.close();
        } catch (error) {
          console.error("Batch processing error:", error);
          controller.enqueue({ type: "text-delta", textDelta: "An error occurred during batch processing." } as any);
          controller.close();
        }
      },
    }),
  });
}

  // 5. Stream Response (Normal or RAG)
  console.info(`[CHAT_API] Effective Mode: ${mode}`);
  
  const result = streamText({
    model: openai("gpt-4o"),
    system: mode === "rag" ? SYSTEM_PROMPT_RAG : SYSTEM_PROMPT_NORMAL,
    messages: (messages || []).map((m: any) => ({
      role: m.role as any,
      content: m.parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n"),
    })),
    stopWhen: mode === "rag" ? stepCountIs(5) : stepCountIs(1),
    tools: mode === "rag" ? {
      documentSearch: {
        description: "Search for raw medical data in healthcare documents. Returns raw excerpts and source metadata. You MUST always synthesize the results into your own written response after calling this tool.",
        inputSchema: z.object({
          query: z.string().describe("The search query for medical information."),
        }),
        execute: async ({ query }) => {
          console.info(`[DOCUMENT_SEARCH] Searching for: "${query}"`);
          const vectorStoreId = await getOrCreateVectorStore();
          const assistant = await getOrCreateAssistant();
          const thread = await openaiClient.beta.threads.create();
          await openaiClient.beta.threads.messages.create(thread.id, { role: "user", content: query });
          const run = await openaiClient.beta.threads.runs.createAndPoll(thread.id, {
            assistant_id: assistant.id,
          });
          if (run.status === "completed") {
            const messages = await openaiClient.beta.threads.messages.list(thread.id);
            if (messages.data[0]?.content[0]?.type === "text") {
              const text = messages.data[0].content[0].text;
              let formattedText = text.value;

              // Deduplicate citations by source filename
              const sourceMap = new Map<string, string>(); // filename -> citation id
              const uniqueCitations: Array<{ id: string; snippet: string; source: string }> = [];
              let nextId = 1;

              for (const ann of text.annotations as any[]) {
                let source = "Knowledge Base";
                if (ann.file_citation?.file_id) {
                  try {
                    const file = await openaiClient.files.retrieve(ann.file_citation.file_id);
                    source = file.filename;
                  } catch { /* fallback to Knowledge Base */ }
                }

                let citationId: string;
                if (sourceMap.has(source)) {
                  citationId = sourceMap.get(source)!;
                } else {
                  citationId = nextId.toString();
                  sourceMap.set(source, citationId);
                  uniqueCitations.push({
                    id: citationId,
                    snippet: ann.text || "Medical reference",
                    source,
                  });
                  nextId++;
                }

                const marker = `[${citationId}]`;
                if (ann.text) {
                  formattedText = formattedText.replace(ann.text, marker);
                }
              }

              console.info(`[DOCUMENT_SEARCH] Result found: "${formattedText.substring(0, 100).replace(/\n/g, ' ')}..."`);
              console.info(`[DOCUMENT_SEARCH] Total unique citations: ${uniqueCitations.length} (from ${text.annotations.length} annotations)`);

              return {
                text: formattedText,
                citations: uniqueCitations,
              };
            }
          }
          return { text: "No results", citations: [] };
        },
      },
    } : {},
    // Save messages when the full multi-step stream completes
    onFinish: async () => {
      const response = await result.response;
      await saveMessages({
        messages: response.messages.map((msg, index) => ({
          id: (msg as any).id || `${chatId}-${Date.now()}-${index}`,
          chatId,
          role: msg.role === "tool" ? "assistant" : msg.role as any,
          parts: msg.content as any,
          attachments: [],
          createdAt: new Date(),
        })),
      });
    },
  });
  return result.toUIMessageStreamResponse({
    headers: {
      'x-chatbot-mode': mode,
    },
  });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (chat?.userId !== session.user.id) {
    return new ChatbotError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
