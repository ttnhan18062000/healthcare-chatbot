import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { openai, getOrCreateVectorStore } from "@/lib/ai/assistant";
import { saveDocument } from "@/lib/db/queries";
import { generateUUID } from "@/lib/utils";

const FileSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine((file) => file.size <= 20 * 1024 * 1024, {
      message: "File size should be less than 20MB",
    })
    .refine((file) => ["application/pdf"].includes(file.type), {
      message: "Only PDF files are supported for medical knowledge",
    }),
});

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const validatedFile = FileSchema.safeParse({ file });
    if (!validatedFile.success) {
      return NextResponse.json({ error: validatedFile.error.errors[0].message }, { status: 400 });
    }

    const vectorStoreId = await getOrCreateVectorStore();

    // 1. Upload to OpenAI
    const buffer = Buffer.from(await file.arrayBuffer());
    const openaiFile = await openai.files.create({
      file: new File([buffer], file.name, { type: file.type }),
      purpose: "assistants",
    });

    // 2. Add to Vector Store
    await (openai as any).beta.vectorStores.files.create_and_poll(vectorStoreId, {
      file_id: openaiFile.id,
    });

    // 3. Save to Local DB
    await saveDocument({
      id: generateUUID(),
      title: file.name,
      kind: "text",
      content: "", // Content will be indexed by OpenAI
      userId: session.user.id,
      externalId: openaiFile.id,
    });

    return NextResponse.json({ id: openaiFile.id, name: file.name });
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: error.message || "Upload failed" }, { status: 500 });
  }
}
