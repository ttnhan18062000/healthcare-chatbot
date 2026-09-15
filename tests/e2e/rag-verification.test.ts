import { expect, test } from "@playwright/test";

test.describe("RAG Mode Verification", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("Normal mode provides conversational response without citations", async ({ page }) => {
    // Select Normal mode (default)
    await page.getByRole("button", { name: "Thông thường" }).click();

    // Ask a medical question
    await page.getByTestId("multimodal-input").fill("Sa sút trí tuệ là gì?");
    await page.getByTestId("send-button").click();

    // Wait for the response to finish (checking for the stop button to disappear or the response to stabilize)
    const response = page.locator(".prose").last();
    await expect(response).toBeVisible({ timeout: 15000 });
    
    // In Normal mode, there should be NO bracketed citations like [1]
    const content = await response.innerText();
    expect(content).not.toMatch(/\[\d+\]/);
    expect(content).not.toContain("Nguồn:");
  });

  test("Document mode utilizes Knowledge Base and provides citations", async ({ page }) => {
    // Select Document mode
    await page.getByRole("button", { name: "Tài liệu" }).click();

    // Ask a specific iSupport question
    await page.getByTestId("multimodal-input").fill("Mẹ mình kiệt sức, iSupport khuyên mình nên làm gì?");
    await page.getByTestId("send-button").click();

    // Wait for the response to finish
    const response = page.locator(".prose").last();
    await expect(response).toBeVisible({ timeout: 20000 });

    // In Document mode, there SHOULD be bracketed citations [1]
    await expect(response).toContainText(/\[\d+\]/);
    
    // It should explicitly mention the source or have the "Nguồn" section
    await expect(response).toContainText(/Nguồn|Source/i);
    
    // Check for interactive citation markers (tooltips)
    const citationMarker = page.locator("a[href^='#citation-']").first();
    await expect(citationMarker).toBeVisible();
  });

  test("Document mode does not leave a completed lookup in a loading state", async ({ page }) => {
    await page.route("**/api/chat", async (route) => {
      const stream = [
        { type: "start", messageId: "assistant-rag-error" },
        { type: "start-step" },
        {
          type: "tool-input-available",
          toolCallId: "document-search-1",
          toolName: "documentSearch",
          input: { query: "Cách chăm sóc người bệnh?" },
        },
        {
          type: "tool-output-error",
          toolCallId: "document-search-1",
          errorText: "Knowledge base is temporarily unavailable.",
        },
        { type: "finish-step" },
        { type: "start-step" },
        { type: "text-start", id: "answer-1" },
        {
          type: "text-delta",
          id: "answer-1",
          delta: "Đây là câu trả lời đã hoàn tất.",
        },
        { type: "text-end", id: "answer-1" },
        { type: "finish-step" },
        { type: "finish", finishReason: "stop" },
      ]
        .map((part) => `data: ${JSON.stringify(part)}\n\n`)
        .join("");

      await route.fulfill({
        body: stream,
        contentType: "text/event-stream",
        headers: { "x-vercel-ai-ui-message-stream": "v1" },
      });
    });

    await page.getByRole("button", { name: "Tài liệu" }).click();
    await page.getByTestId("multimodal-input").fill("Cách chăm sóc người bệnh?");
    await page.getByTestId("send-button").click();

    await expect(page.getByText("Đây là câu trả lời đã hoàn tất.")).toBeVisible();
    await expect(page.getByText("Không thể tra cứu tài liệu lúc này.")).toBeVisible();
    await expect(page.getByTestId("stop-button")).not.toBeVisible();
    await expect(
      page.getByText("Đang tra cứu cơ sở dữ liệu y tế...")
    ).not.toBeVisible();
  });

  test("Document mode continues with stored user and assistant history", async ({ page }) => {
    const storedMessages = [
      {
        id: "stored-user-1",
        role: "user",
        parts: [{ type: "text", text: "Câu hỏi đã lưu" }],
        metadata: { createdAt: "2026-09-15T00:00:00.000Z" },
      },
      {
        id: "stored-assistant-1",
        role: "assistant",
        parts: [{ type: "text", text: "Phản hồi đã lưu" }],
        metadata: { createdAt: "2026-09-15T00:00:01.000Z" },
      },
    ];
    let continuationBody: any;

    await page.route("**/api/messages?chatId=stored-chat", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          messages: storedMessages,
          visibility: "private",
          userId: "test-user",
          isReadonly: false,
          chatMode: "rag",
        }),
      });
    });
    await page.route("**/api/chat", async (route) => {
      continuationBody = route.request().postDataJSON();
      const stream = [
        { type: "start", messageId: "assistant-continuation" },
        { type: "start-step" },
        { type: "text-start", id: "answer-2" },
        {
          type: "text-delta",
          id: "answer-2",
          delta: "Phản hồi tiếp theo",
        },
        { type: "text-end", id: "answer-2" },
        { type: "finish-step" },
        { type: "finish", finishReason: "stop" },
      ]
        .map((part) => `data: ${JSON.stringify(part)}\n\n`)
        .join("");

      await route.fulfill({
        body: stream,
        contentType: "text/event-stream",
        headers: { "x-vercel-ai-ui-message-stream": "v1" },
      });
    });

    await page.goto("/chat/stored-chat");
    await expect(page.getByText("Câu hỏi đã lưu")).toBeVisible();
    await expect(page.getByText("Phản hồi đã lưu")).toBeVisible();

    await page.getByTestId("multimodal-input").fill("Câu hỏi tiếp theo");
    await page.getByTestId("send-button").click();
    await expect(page.getByText("Phản hồi tiếp theo")).toBeVisible();

    expect(continuationBody.mode).toBe("rag");
    expect(
      continuationBody.messages.map((message: any) => ({
        role: message.role,
        text: message.parts
          .filter((part: any) => part.type === "text")
          .map((part: any) => part.text)
          .join(""),
      }))
    ).toEqual([
      { role: "user", text: "Câu hỏi đã lưu" },
      { role: "assistant", text: "Phản hồi đã lưu" },
      { role: "user", text: "Câu hỏi tiếp theo" },
    ]);
  });
});
