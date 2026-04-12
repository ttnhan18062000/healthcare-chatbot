import { streamText, createUIMessageStreamResponse, generateText } from "ai";
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
} from "@/lib/ai/assistant";
import { openai } from "@ai-sdk/openai";

export const maxDuration = 60;

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (error) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  let { id: chatId, message, messages, mode = "normal" } = requestBody;

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

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  // 1. Get or Create Vector Store
  const vectorStoreId = await getOrCreateVectorStore();

  // 2. Get or Create Chat
  let chat = await getChatById({ id: chatId });

  if (!chat) {
    await saveChat({
      id: chatId,
      userId: session.user.id,
      title: message.parts[0].type === "text" ? message.parts[0].text.slice(0, 50) : "New Chat",
      visibility: "private",
    });
  }

  // 3. Save User Message
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
              system: `Bạn là một trợ lý AI đồng cảm và hỗ trợ chuyên chăm sóc bệnh nhân sa sút trí tuệ.
Hãy sử dụng tone 'mình-bạn' thân thiện.
${
  mode === "rag"
    ? "Dựa trên kiến thức được cung cấp từ các tài liệu y tế đi kèm qua công cụ fileSearch."
    : ""
}
KHÔNG thay thế lời khuyên y tế chuyên nghiệp.`,
              prompt: line,
              tools: mode === "rag" ? {
                fileSearch: (openai as any).tools.fileSearch({
                  vectorStoreIds: [await getOrCreateVectorStore()],
                }),
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
  const result = streamText({
    model: openai("gpt-4o"),
    system: `Bạn là một trợ lý AI đồng cảm và hỗ trợ chuyên chăm sóc bệnh nhân sa sút trí tuệ.
Hãy sử dụng tone 'mình-bạn' thân thiện.
Dựa trên kiến thức được cung cấp từ các tài liệu y tế đi kèm qua công cụ fileSearch.
KHÔNG thay thế lời khuyên y tế chuyên nghiệp.`,
    messages: [
      {
        role: "user",
        content: message.parts
          .filter((p) => p.type === "text")
          .map((p) => (p as any).text)
          .join("\n"),
      },
    ],
    tools: mode === "rag" ? {
      fileSearch: (openai as any).tools.fileSearch({
        vectorStoreIds: [vectorStoreId],
      }),
    } : {},
    // maxSteps is not supported in this version of ai SDK
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

  const COMPATIBLE_TYPES = new Set([
    "text-start",
    "text-delta",
    "text-end",
    "tool-call",
    "tool-result",
    "tool-error",
    "tool-input-start",
    "tool-input-delta",
    "tool-input-available",
    "tool-input-error",
    "tool-approval-request",
    "tool-output-available",
    "tool-output-error",
    "tool-output-denied",
    "reasoning-start",
    "reasoning-delta",
    "reasoning-end",
    "source-url",
    "source-document",
    "file",
    "message-metadata",
    "error",
  ]);

  return createUIMessageStreamResponse({
    stream: result.fullStream.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          if (COMPATIBLE_TYPES.has(chunk.type)) {
            // Strict Compatibility remapping: Server (6.0) -> Client (Legacy)
            // We create fresh objects to avoid including unrecognized keys
            if (chunk.type === "text-delta" && "text" in (chunk as any)) {
              controller.enqueue({
                type: "text-delta",
                id: (chunk as any).id,
                delta: (chunk as any).text,
              });
            } else if (chunk.type === "tool-call" && "input" in (chunk as any)) {
              controller.enqueue({
                type: "tool-call",
                toolCallId: (chunk as any).toolCallId,
                toolName: (chunk as any).toolName,
                args: (chunk as any).input,
              });
            } else if (chunk.type === "tool-result" && "output" in (chunk as any)) {
              controller.enqueue({
                type: "tool-result",
                toolCallId: (chunk as any).toolCallId,
                toolName: (chunk as any).toolName,
                result: (chunk as any).output,
              });
            } else if (chunk.type === "reasoning-delta" && "delta" in (chunk as any)) {
              controller.enqueue({
                type: "reasoning-delta",
                id: (chunk as any).id,
                delta: (chunk as any).delta,
              });
            } else {
              controller.enqueue(chunk);
            }
          }
        },
      })
    ) as any,
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
