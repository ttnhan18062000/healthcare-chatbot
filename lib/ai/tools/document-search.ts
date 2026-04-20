import { z } from "zod";
import { tool } from "ai";
import { getOrCreateAssistant, getOrCreateVectorStore, openai as openaiClient } from "../assistant";

export const documentSearch = () =>
  tool({
    description:
      "Search for raw medical data in healthcare documents. Returns raw excerpts and source metadata. You MUST always synthesize the results into your own written response after calling this tool.",
    inputSchema: z.object({
      query: z.string().describe("The search query for medical information."),
    }),
    execute: async ({ query }) => {
      console.info(`[DOCUMENT_SEARCH] Searching for: "${query}"`);
      const vectorStoreId = await getOrCreateVectorStore();
      const assistant = await getOrCreateAssistant();
      const thread = await openaiClient.beta.threads.create();
      await openaiClient.beta.threads.messages.create(thread.id, {
        role: "user",
        content: query,
      });
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
          const uniqueCitations: Array<{
            id: string;
            snippet: string;
            source: string;
          }> = [];
          let nextId = 1;

          for (const ann of text.annotations as any[]) {
            let source = "Knowledge Base";
            if (ann.file_citation?.file_id) {
              try {
                const file = await openaiClient.files.retrieve(
                  ann.file_citation.file_id
                );
                source = file.filename;
              } catch {
                /* fallback to Knowledge Base */
              }
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

          console.info(
            `[DOCUMENT_SEARCH] Result found: "${formattedText
              .substring(0, 100)
              .replace(/\n/g, " ")}..."`
          );
          console.info(
            `[DOCUMENT_SEARCH] Total unique citations: ${uniqueCitations.length} (from ${text.annotations.length} annotations)`
          );

          return {
            text: formattedText,
            citations: uniqueCitations,
          };
        }
      }
      return { text: "No results", citations: [] };
    },
  });
