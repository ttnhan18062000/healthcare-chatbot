-- Drop Foreign Key Constraints
ALTER TABLE "Chat" DROP CONSTRAINT IF EXISTS "Chat_userId_User_id_fk";
ALTER TABLE "Document" DROP CONSTRAINT IF EXISTS "Document_userId_User_id_fk";
ALTER TABLE "Message_v2" DROP CONSTRAINT IF EXISTS "Message_v2_chatId_Chat_id_fk";
ALTER TABLE "Stream" DROP CONSTRAINT IF EXISTS "Stream_chatId_Chat_id_fk";
ALTER TABLE "Suggestion" DROP CONSTRAINT IF EXISTS "Suggestion_userId_User_id_fk";
ALTER TABLE "Suggestion" DROP CONSTRAINT IF EXISTS "Suggestion_documentId_documentCreatedAt_Document_id_createdAt_fk";
ALTER TABLE "Vote_v2" DROP CONSTRAINT IF EXISTS "Vote_v2_chatId_Chat_id_fk";
ALTER TABLE "Vote_v2" DROP CONSTRAINT IF EXISTS "Vote_v2_messageId_Message_v2_id_fk";

-- Drop Primary Key Constraints (needed for type change on PK columns)
ALTER TABLE "Chat" DROP CONSTRAINT IF EXISTS "Chat_pkey";
ALTER TABLE "Message_v2" DROP CONSTRAINT IF EXISTS "Message_v2_pkey";
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_pkey";
ALTER TABLE "Document" DROP CONSTRAINT IF EXISTS "Document_id_createdAt_pk";
ALTER TABLE "Suggestion" DROP CONSTRAINT IF EXISTS "Suggestion_id_pk";
ALTER TABLE "Stream" DROP CONSTRAINT IF EXISTS "Stream_id_pk";
ALTER TABLE "Vote_v2" DROP CONSTRAINT IF EXISTS "Vote_v2_chatId_messageId_pk";

-- Alter Column Types
ALTER TABLE "User" ALTER COLUMN "id" TYPE text USING "id"::text;
ALTER TABLE "Chat" ALTER COLUMN "id" TYPE text USING "id"::text;
ALTER TABLE "Chat" ALTER COLUMN "userId" TYPE text USING "userId"::text;
ALTER TABLE "Message_v2" ALTER COLUMN "id" TYPE text USING "id"::text;
ALTER TABLE "Message_v2" ALTER COLUMN "chatId" TYPE text USING "chatId"::text;
ALTER TABLE "Document" ALTER COLUMN "id" TYPE text USING "id"::text;
ALTER TABLE "Document" ALTER COLUMN "userId" TYPE text USING "userId"::text;
ALTER TABLE "Suggestion" ALTER COLUMN "id" TYPE text USING "id"::text;
ALTER TABLE "Suggestion" ALTER COLUMN "documentId" TYPE text USING "documentId"::text;
ALTER TABLE "Suggestion" ALTER COLUMN "userId" TYPE text USING "userId"::text;
ALTER TABLE "Stream" ALTER COLUMN "id" TYPE text USING "id"::text;
ALTER TABLE "Stream" ALTER COLUMN "chatId" TYPE text USING "chatId"::text;
ALTER TABLE "Vote_v2" ALTER COLUMN "chatId" TYPE text USING "chatId"::text;
ALTER TABLE "Vote_v2" ALTER COLUMN "messageId" TYPE text USING "messageId"::text;

-- Remove Defaults (since gen_random_uuid() only works for uuid type)
ALTER TABLE "User" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "Chat" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "Message_v2" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "Document" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "Suggestion" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "Stream" ALTER COLUMN "id" DROP DEFAULT;

-- Recreate Primary Key Constraints
ALTER TABLE "User" ADD PRIMARY KEY ("id");
ALTER TABLE "Chat" ADD PRIMARY KEY ("id");
ALTER TABLE "Message_v2" ADD PRIMARY KEY ("id");
ALTER TABLE "Document" ADD CONSTRAINT "Document_id_createdAt_pk" PRIMARY KEY ("id", "createdAt");
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_id_pk" PRIMARY KEY ("id");
ALTER TABLE "Stream" ADD CONSTRAINT "Stream_id_pk" PRIMARY KEY ("id");
ALTER TABLE "Vote_v2" ADD CONSTRAINT "Vote_v2_chatId_messageId_pk" PRIMARY KEY ("chatId", "messageId");

-- Recreate Foreign Key Constraints
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Message_v2" ADD CONSTRAINT "Message_v2_chatId_Chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "Chat" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Stream" ADD CONSTRAINT "Stream_chatId_Chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "Chat" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_documentId_documentCreatedAt_Document_id_createdAt_fk" FOREIGN KEY ("documentId", "documentCreatedAt") REFERENCES "Document" ("id", "createdAt") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Vote_v2" ADD CONSTRAINT "Vote_v2_chatId_Chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "Chat" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Vote_v2" ADD CONSTRAINT "Vote_v2_messageId_Message_v2_id_fk" FOREIGN KEY ("messageId") REFERENCES "Message_v2" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
