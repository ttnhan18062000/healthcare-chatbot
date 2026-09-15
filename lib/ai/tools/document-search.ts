import { tool } from "ai";
import { z } from "zod";
import {
  getKnowledgeVectorStoreId,
  openai as openaiClient,
} from "../assistant";

export const documentSearch = () =>
  tool({
    description:
      "Search healthcare documents for an in-scope, sufficiently specified dementia-care question that needs factual evidence. Do not use for out-of-scope requests, greetings, emotional acknowledgement, or when essential context is missing. Returns verbatim excerpts and source metadata that must exclusively ground the answer.",
    inputSchema: z.object({
      query: z.string().describe("The search query for medical information."),
    }),
    execute: async ({ query }) => {
      console.info(`[DOCUMENT_SEARCH] Searching for: "${query}"`);
      const vectorStoreId = await getKnowledgeVectorStoreId();
      const searchResults = await openaiClient.vectorStores.search(
        vectorStoreId,
        {
          query,
          max_num_results: 8,
          rewrite_query: true,
        }
      );

      const sourceChunks = new Map<string, string[]>();
      for (const result of searchResults.data) {
        const chunks = result.content
          .map((content) => content.text)
          .filter(Boolean);
        if (chunks.length === 0) {
          continue;
        }
        sourceChunks.set(result.filename, [
          ...(sourceChunks.get(result.filename) ?? []),
          ...chunks,
        ]);
      }

      const citations = [...sourceChunks.entries()].map(
        ([source, chunks], index) => ({
          id: String(index + 1),
          source,
          snippet: chunks.join("\n\n--- NEXT SEGMENT ---\n\n"),
        })
      );
      const text = citations
        .map(
          (citation) =>
            `[${citation.id}] Nguồn: ${citation.source}\n${citation.snippet}`
        )
        .join("\n\n--- NEXT SOURCE ---\n\n");

      console.info(
        `[DOCUMENT_SEARCH] Retrieved ${searchResults.data.length} chunks from ${citations.length} sources.`
      );

      return {
        text: text || "Cơ sở tài liệu không có kết quả phù hợp.",
        citations,
      };
    },
  });
