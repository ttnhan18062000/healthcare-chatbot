import {
  streamText,
  createUIMessageStreamResponse,
  generateText,
  stepCountIs,
} from "ai";
import { auth } from "@/app/(auth)/auth";
import {
  deleteChatById,
  getChatById,
  getMessageById,
  saveChat,
  saveMessages,
  updateChatMode,
  updateMessage,
} from "@/lib/db/queries";

import { ChatbotError } from "@/lib/errors";
import { postRequestBodySchema, type PostRequestBody } from "./schema";
import {
  getOrCreateVectorStore,
  getOrCreateAssistant,
  openai as openaiClient,
} from "@/lib/ai/assistant";
import { documentSearch } from "@/lib/ai/tools/document-search";
import { ragScopeCheck } from "@/lib/ai/tools/rag-scope-check";
import { openai } from "@ai-sdk/openai";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";

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
•	Mở đầu: Luôn bắt đầu bằng một câu xác nhận cảm xúc (validation) sâu sắc và đồng cảm (ví dụ: "Mình rất hiểu cảm giác của bạn...", "Nghe bạn kể mình thấy bạn đã rất vất vả...").
•	Câu chữ: **đầy đủ, chi tiết và có chiều sâu**. Tránh trả lời quá ngắn gọn. Hãy giải thích rõ ràng các bước thực hiện.
•	Cấu trúc: Tổ chức câu trả lời một cách logic: Thấu hiểu -> Giải pháp chi tiết -> Lời khuyên/Hành động cụ thể.

SCOPING GATE CHO CHẾ ĐỘ TÀI LIỆU (BẮT BUỘC THỰC HIỆN TRƯỚC KHI DÙNG CÔNG CỤ)
Phân loại yêu cầu vào đúng một trường hợp:
1. NGOÀI PHẠM VI: Không liên quan đến sa sút trí tuệ, người chăm sóc, an toàn chăm sóc hoặc sức khỏe tinh thần của người chăm sóc. KHÔNG gọi documentSearch. Nói ngắn gọn phạm vi bạn có thể hỗ trợ và mời người dùng đặt câu hỏi phù hợp.
2. CHƯA ĐỦ THÔNG TIN: Thiếu bối cảnh thiết yếu để tìm đúng tài liệu hoặc đưa hướng dẫn an toàn. KHÔNG gọi documentSearch. Hỏi một câu làm rõ ngắn gọn, cụ thể trước.
3. KHÔNG CẦN TRA CỨU: Chào hỏi, xác nhận cảm xúc hoặc trao đổi điều hướng không chứa khẳng định y khoa/thực hành chăm sóc. KHÔNG gọi documentSearch. Trả lời ngắn gọn trong đúng phạm vi vai trò.
4. CẦN BẰNG CHỨNG TÀI LIỆU: Yêu cầu trong phạm vi, đủ rõ và cần kiến thức/hướng dẫn thực tế. Gọi documentSearch với truy vấn tập trung, sau đó tổng hợp câu trả lời CHỈ từ kết quả công cụ.

QUY TRÌNH NHIỀU BƯỚC
Bước 1 — Đọc toàn bộ lịch sử hội thoại để hiểu câu hỏi tiếp nối, sau đó thực hiện SCOPING GATE.
Bước 2 — Nếu thuộc trường hợp 1, 2 hoặc 3, trả lời phù hợp rồi DỪNG; không gọi công cụ trong lượt này.
Bước 3 — Nếu thuộc trường hợp 4, gọi documentSearch một lần với truy vấn cụ thể, có thể diễn đạt độc lập dựa trên ngữ cảnh hội thoại.
Bước 4 — Đánh giá kết quả tra cứu:
• Nếu đủ bằng chứng: tổng hợp câu trả lời và trích dẫn nguồn.
• Nếu kết quả chưa phù hợp nhưng có thể cải thiện truy vấn từ thông tin người dùng đã cung cấp: được phép tinh chỉnh và gọi documentSearch thêm ĐÚNG MỘT lần.
• Nếu thiếu thông tin chỉ người dùng mới cung cấp được: hỏi một câu làm rõ rồi dừng, không tự suy đoán và không tra cứu lặp lại.
• Nếu tài liệu không có bằng chứng phù hợp: nói rõ giới hạn của cơ sở tài liệu rồi dừng.
Bước 5 — Không gọi documentSearch quá hai lần trong một lượt và không tiếp tục gọi công cụ sau khi đã có đủ bằng chứng.

CỔNG PHẠM VI CÓ CẤU TRÚC
• Ở bước đầu tiên, luôn gọi ragScopeCheck. Đây là kiểm tra cục bộ, KHÔNG tra cứu hay gửi dữ liệu tới kho tài liệu.
• Sau khi ragScopeCheck trả về, tuân thủ đúng decision. Chỉ gọi documentSearch khi decision là search.
• Các câu hỏi tổng quát nhưng rõ và cần kiến thức, ví dụ “Sa sút trí tuệ là gì?”, thuộc search chứ không phải clarify.

GROUNDING SAU KHI TRA CỨU
•	Không bổ sung kiến thức chung hoặc suy đoán ngoài kết quả documentSearch.
•	Nếu kết quả không có thông tin phù hợp, nói rõ rằng cơ sở tài liệu hiện không đủ để trả lời; không tự điền phần thiếu.
•	**TRÍCH DẪN (QUAN TRỌNG)**: Bạn phải giữ nguyên các dấu ngoặc vuông [1], [2], ... từ kết quả tìm kiếm và đặt chúng ngay sau mỗi khẳng định hoặc đoạn văn tương ứng. KHÔNG được bỏ sót bất kỳ dấu trích dẫn nào.
•	**NGUỒN**: Mọi ý chính phải kèm Nguồn theo format: Nguồn: <tên file> – <mục/heading> ở cuối câu hoặc đoạn.

CHECKLIST TRƯỚC KHI TRẢ LỜI:
1. Mình đã có câu đồng cảm mở đầu chưa?
2. Mình đã phân loại đúng phạm vi và độ đầy đủ của yêu cầu chưa?
3. Nếu cần bằng chứng tài liệu, mình đã gọi documentSearch chưa?
4. Nếu đã tra cứu, mỗi ý đã có dấu trích dẫn [N] và Nguồn chưa?
5. Nếu tài liệu không đủ, mình đã nói rõ giới hạn thay vì suy đoán chưa?

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
  
  // Persistence: Update chat mode in DB if it changed (e.g. switched mid-session)
  if (chat && chat.mode !== mode && !isTestBypass) {
    await updateChatMode({ id: chatId, mode });
  }

  console.info(`[CHAT_API] Mode Decision - Request: ${requestMode}, DB: ${chat?.mode || 'none'}, Final: ${mode}`);


  // 3. Persist the current user turn in the same UI-message shape that is
  // restored by /api/messages. The client sends the full conversation on each
  // turn, so use the message ID to make retries and regenerations idempotent.
  if (!isTestBypass) {
    const [storedUserMessage] = await getMessageById({ id: message.id });

    if (storedUserMessage) {
      if (storedUserMessage.chatId !== chatId) {
        return new ChatbotError("bad_request:api").toResponse();
      }

      await updateMessage({ id: message.id, parts: message.parts });
    } else {
      await saveMessages({
        messages: [
          {
            id: message.id,
            chatId,
            role: "user",
            parts: message.parts,
            attachments: [],
            createdAt: new Date(),
          },
        ],
      });
    }
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
                documentSearch: documentSearch(),
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
    messages: (messages || []).map((m: any) => {
      const textContent = m.parts
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join("\n");
      
      const toolCalls = m.parts
        .filter((p: any) => p.type === "tool-call")
        .map((p: any) => ({
          type: "tool-call",
          toolCallId: p.toolCallId,
          toolName: p.toolName,
          args: p.args,
        }));

      const toolResults = m.parts
        .filter((p: any) => p.type === "tool-result")
        .map((p: any) => ({
          type: "tool-result",
          toolCallId: p.toolCallId,
          toolName: p.toolName,
          result: p.result,
        }));

      if (toolCalls.length > 0 || toolResults.length > 0) {
        return {
          role: m.role as any,
          content: [
            ...(textContent ? [{ type: "text", text: textContent }] : []),
            ...toolCalls,
            ...toolResults,
          ],
        };
      }

      return {
        role: m.role as any,
        content: textContent,
      };
    }),

    stopWhen: mode === "rag" ? stepCountIs(4) : stepCountIs(1),
    tools: mode === "rag" ? {
      ragScopeCheck,
      documentSearch: documentSearch(),
    } : {},
    prepareStep:
      mode === "rag"
        ? ({ stepNumber, steps }) => {
            if (stepNumber === 0) {
              return {
                activeTools: ["ragScopeCheck"],
                toolChoice: {
                  type: "tool" as const,
                  toolName: "ragScopeCheck" as const,
                },
              };
            }

            const scopeResult = steps
              .flatMap((step) => step.toolResults)
              .find((result) => result.toolName === "ragScopeCheck")
              ?.output as
              | { decision?: string; reason?: string; searchQuery?: string }
              | undefined;

            if (scopeResult?.decision !== "search") {
              return {
                activeTools: [],
                toolChoice: "none" as const,
              };
            }

            const hasSearched = steps.some((step) =>
              step.toolResults.some(
                (result) => result.toolName === "documentSearch"
              )
            );

            if (!hasSearched) {
              return {
                activeTools: ["documentSearch"],
                toolChoice: {
                  type: "tool" as const,
                  toolName: "documentSearch" as const,
                },
              };
            }

            return {
              activeTools: ["documentSearch"],
              toolChoice: "auto" as const,
            };
          }
        : undefined,
  });
  return result.toUIMessageStreamResponse({
    generateMessageId: generateUUID,
    headers: {
      'x-chatbot-mode': mode,
    },
    originalMessages: (messages || []) as ChatMessage[],
    onFinish: async ({ isAborted, responseMessage }) => {
      if (isTestBypass || isAborted) {
        return;
      }

      await saveMessages({
        messages: [
          {
            id: responseMessage.id,
            chatId,
            role: responseMessage.role,
            parts: responseMessage.parts,
            attachments: [],
            createdAt: new Date(),
          },
        ],
      });
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
