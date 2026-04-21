"use client";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { FileTextIcon } from "lucide-react";

interface CitationProps {
  id: string;
  source?: string;
  snippet?: string;
  index: number;
}

export function Citation({ id, source, snippet, index }: CitationProps) {
  return (
    <HoverCard openDelay={100} closeDelay={100}>
      <HoverCardTrigger asChild>
        <sup
          className={cn(
            "mx-0.5 cursor-pointer rounded-sm bg-blue-100 px-1 text-[10px] font-bold text-blue-600 transition-all hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50",
            "select-none border border-blue-200/50 dark:border-blue-800/50"
          )}
        >
          {index}
        </sup>
      </HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="start"
        className="w-80 min-w-[320px] max-w-[400px] overflow-hidden rounded-xl border-blue-200/50 bg-white p-0 shadow-2xl dark:border-blue-900/30 dark:bg-slate-950"
      >
        <div className="flex flex-col">
          <div className="flex items-center gap-2 border-b border-blue-100/50 bg-blue-50/50 px-4 py-2 dark:border-blue-900/20 dark:bg-blue-950/30">
            <FileTextIcon size={14} className="text-blue-600 dark:text-blue-400" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-blue-700 dark:text-blue-300">
              {source || "Medical Document"}
            </span>
          </div>
          <div className="max-h-[300px] overflow-y-auto p-4">
            <p className="whitespace-pre-wrap text-[12px] leading-relaxed italic text-foreground/90">
              {snippet || "Verbatim content unavailable for this reference."}
            </p>
          </div>
          <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-1.5 dark:border-slate-800/50 dark:bg-slate-900/50">
            <p className="text-[10px] text-muted-foreground italic">
              Nguồn trích lục từ Cơ sở dữ liệu y tế
            </p>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
