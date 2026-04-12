import { NextResponse } from "next/server";
import { generatorApp } from "@/lib/ai/graph";
import { auth } from "@/app/(auth)/auth";
import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { n = 3 } = await request.json();

    // 1. Load context chunks from PDFs in the tmp/docs folder for now
    // In a real app, these would come from the Vector Store or DB
    const docsDir = path.join(process.cwd(), "tmp", "simple-healthcare-chatbot", "docs");
    const chunks: any[] = [];

    const files = fs.readdirSync(docsDir).filter(f => f.endsWith(".pdf"));
    
    for (const file of files) {
      const filePath = path.join(docsDir, file);
      const dataBuffer = fs.readFileSync(filePath);
      const pdfInstance = new PDFParse({ data: dataBuffer });
      const data = await pdfInstance.getText();
      
      // Simple chunking: first 500 characters of each "page" roughly
      // (pdf-parse doesn't strictly give pages in a clean array easily without more work)
      const text = data.text;
      const partSize = 1000;
      for (let i = 0; i < text.length; i += partSize) {
        chunks.push({
          content: text.slice(i, i + partSize),
          source: file,
          page: Math.floor(i / partSize) + 1
        });
      }
    }

    if (chunks.length === 0) {
      return NextResponse.json({ error: "No documents found for generation" }, { status: 400 });
    }

    // 2. Initialize Quota
    const perType = Math.floor(n / 3);
    const extra = n % 3;
    const quota = {
      full: perType + (extra > 0 ? 1 : 0),
      missing: perType + (extra > 1 ? 1 : 0),
      noise: perType,
    };

    // 3. Run Generator
    const initialState = {
      chunks,
      quota,
      current_task: null,
      current_persona: null,
      current_pair: null,
      retries: 0,
      final_dataset: [],
    };

    const result = await generatorApp.invoke(initialState);

    return NextResponse.json(result.final_dataset);
  } catch (error: any) {
    console.error("Generation error:", error);
    return NextResponse.json({ error: error.message || "Generation failed" }, { status: 500 });
  }
}
