import { OpenAI } from "openai";

const KNOWLEDGE_BASE_NAME = "Medical Knowledge Base";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function getKnowledgeVectorStoreId() {
  const configuredId = process.env.VECTOR_STORE_ID;
  if (configuredId) {
    const configuredStore = await openai.vectorStores.retrieve(configuredId);
    if (configuredStore.status !== "completed") {
      throw new Error("The configured document vector store is not ready.");
    }
    return configuredStore.id;
  }

  const stores = await openai.vectorStores.list({ limit: 100 });
  const existingStore = stores.data.find(
    (store) =>
      store.name === KNOWLEDGE_BASE_NAME &&
      store.status === "completed" &&
      store.file_counts.completed > 0
  );

  if (!existingStore) {
    throw new Error(
      `No populated OpenAI vector store named "${KNOWLEDGE_BASE_NAME}" was found.`
    );
  }

  return existingStore.id;
}

export async function getOrCreateVectorStore() {
  try {
    return await getKnowledgeVectorStoreId();
  } catch (error) {
    console.warn(
      "[OPENAI_VECTOR_STORE] No populated knowledge base found; creating one for upload.",
      error
    );
  }

  const vectorStore = await openai.vectorStores.create({
    name: KNOWLEDGE_BASE_NAME,
  });
  return vectorStore.id;
}
