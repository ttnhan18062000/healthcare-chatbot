ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "assistantId" text;
ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "threadId" text;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "externalId" text;
