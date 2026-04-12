"use client";

import { DownloadIcon } from "lucide-react";
import { Button } from "../ui/button";

interface BatchDownloadButtonProps {
  data: string; // JSON string
  filename?: string;
}

export function BatchDownloadButton({ 
  data, 
  filename = "Result.json" 
}: BatchDownloadButtonProps) {
  const handleDownload = () => {
    try {
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  return (
    <div className="mt-4 flex items-center gap-3 rounded-xl border border-border/50 bg-muted/20 p-4 transition-all hover:bg-muted/30">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <DownloadIcon size={20} />
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-medium text-foreground">Batch Processing Complete</span>
        <button
          onClick={handleDownload}
          className="text-xs text-primary hover:underline underline-offset-4 font-medium text-left"
        >
          ({filename}) click to download
        </button>
      </div>
    </div>
  );
}
