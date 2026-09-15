import { tool } from "ai";
import { z } from "zod";

export const ragScopeCheck = tool({
  description: `Classify the current turn after reading the complete conversation.
- out_of_scope: unrelated to dementia, at-home caregiving or caregiver wellbeing.
- clarify: in scope, but essential user-only context is missing for a relevant or safe search.
- no_search: greeting, thanks, emotional acknowledgement or navigation with no factual claim.
- search: in scope, sufficiently clear, and needs document-backed knowledge or practical guidance. A clear general question such as “Sa sút trí tuệ là gì?” is search.
This tool is a local structured gate and does not access the document database.`,
  inputSchema: z.object({
    decision: z.enum(["out_of_scope", "clarify", "no_search", "search"]),
    reason: z.string().describe("A brief reason for the classification."),
    searchQuery: z
      .string()
      .describe(
        "For search, a concise standalone Vietnamese query using relevant conversation context; otherwise an empty string."
      ),
  }),
  execute: async (scope) => scope,
});
