import { expect, test } from "@playwright/test";

test.describe("RAG Mode Verification", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("Normal mode provides conversational response without citations", async ({ page }) => {
    // Select Normal mode (default)
    await page.getByRole("button", { name: "Normal" }).click();

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
    await page.getByRole("button", { name: "Document" }).click();

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
});

