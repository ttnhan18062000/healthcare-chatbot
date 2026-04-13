"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface CitationProps {
  id: string;
  source?: string;
  snippet?: string;
  index: number;
}

export function Citation({ id, source, snippet, index }: CitationProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <sup
            className={cn(
              "mx-0.5 cursor-help rounded-sm bg-primary/10 px-1 text-[10px] font-bold text-primary transition-colors hover:bg-primary/20",
              "select-none"
            )}
          >
            {index}
          </sup>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="start"
          className="max-w-[300px] break-words rounded-xl border border-border/50 bg-popover p-3 shadow-xl"
        >
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Source: {source || "Medical Document"}
            </span>
            <p className="text-[11px] leading-relaxed text-foreground">
              {snippet || "No additional snippet available for this reference."}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
