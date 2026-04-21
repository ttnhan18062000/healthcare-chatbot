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
        // Fetch run steps to extract verbatim text segments from file_search tool calls
        const steps = await openaiClient.beta.threads.runs.steps.list(run.id, {
          thread_id: thread.id,
        });
        const fileContentMap = new Map<string, string[]>(); // file_id -> combined verbatim segments

        for (const step of steps.data) {
          if (step.step_details.type === "tool_calls") {
            for (const toolCall of (step.step_details as any).tool_calls) {
              if (toolCall.type === "file_search" && toolCall.file_search?.results) {
                for (const res of toolCall.file_search.results) {
                  const verbatim = res.content
                    ?.map((c: any) => c.text?.value || c.text || "")
                    .filter(Boolean)
                    .join("\n\n---\n\n");
                  if (verbatim) {
                    const existing = fileContentMap.get(res.file_id) || [];
                    fileContentMap.set(res.file_id, [...existing, verbatim]);
                  }
                }
              }
            }
          }
        }
        const messages = await openaiClient.beta.threads.messages.list(thread.id);
        const lastMessage = messages.data[0];

        if (lastMessage?.content[0]?.type === "text") {
          const text = lastMessage.content[0].text;
          console.info(`[DOCUMENT_SEARCH] Raw response from search-assistant: "${text.value.substring(0, 300).replace(/\n/g, " ")}..."`);
          let formattedText = text.value;

          // 1. Collect all unique file IDs that need metadata retrieval
          const uniqueFileIds = [...new Set((text.annotations as any[])
            .map(ann => ann.file_citation?.file_id)
            .filter(Boolean))] as string[];

          // 2. Fetch all file metadata in parallel to reduce latency
          const fileMetadataMap = new Map<string, string>();
          if (uniqueFileIds.length > 0) {
            console.info(`[DOCUMENT_SEARCH] Fetching metadata for ${uniqueFileIds.length} files in parallel...`);
            await Promise.all(
              uniqueFileIds.map(async (fileId) => {
                try {
                  const file = await openaiClient.files.retrieve(fileId);
                  fileMetadataMap.set(fileId, file.filename);
                } catch (e) {
                  console.warn(`[DOCUMENT_SEARCH] Could not retrieve filename for ${fileId}`);
                }
              })
            );
          }

          // 3. Deduplicate citations by source filename
          const sourceMap = new Map<string, string>(); // filename -> citation id
          const uniqueCitations: Array<{
            id: string;
            snippet: string;
            source: string;
          }> = [];
          let nextId = 1;

          for (const ann of text.annotations as any[]) {
            const fileId = ann.file_citation?.file_id;
            const source = (fileId ? fileMetadataMap.get(fileId) : null) || "Knowledge Base";

            let citationId: string;
            if (sourceMap.has(source)) {
              citationId = sourceMap.get(source)!;
            } else {
              citationId = nextId.toString();
              sourceMap.set(source, citationId);
              const verbatimChunks = ann.file_citation?.file_id 
                ? fileContentMap.get(ann.file_citation.file_id)
                : null;
              
              uniqueCitations.push({
                id: citationId,
                snippet: verbatimChunks?.join("\n\n--- NEXT SEGMENT ---\n\n") || ann.text || "Medical reference",
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
