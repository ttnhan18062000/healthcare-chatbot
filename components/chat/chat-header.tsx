"use client";

import { PanelLeftIcon } from "lucide-react";
import Link from "next/link";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { VercelIcon } from "./icons";
import { VisibilitySelector, type VisibilityType } from "./visibility-selector";

function PureChatHeader({
  chatId,
  selectedVisibilityType,
  isReadonly,
  chatMode,
}: {
  chatId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
  chatMode: "normal" | "rag";
}) {
  const { state, toggleSidebar, isMobile } = useSidebar();

  if (state === "collapsed" && !isMobile) {
    return null;
  }

  return (
    <header className="sticky top-0 flex h-14 items-center gap-2 bg-sidebar px-3">
      <Button
        className="md:hidden"
        onClick={toggleSidebar}
        size="icon-sm"
        variant="ghost"
      >
        <PanelLeftIcon className="size-4" />
      </Button>

      <div className="flex items-center gap-1.5 rounded-full border border-border/40 bg-muted/30 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        <span className="opacity-60">Mode:</span>
        <span className="text-foreground">
          {chatMode === "rag" ? "Document" : "Normal"}
        </span>
      </div>

      <Link
        className="flex size-8 items-center justify-center rounded-lg md:hidden"
        href="https://vercel.com/templates/next.js/chatbot"
        rel="noopener noreferrer"
        target="_blank"
      >
        <VercelIcon size={14} />
      </Link>

      {!isReadonly && (
        <VisibilitySelector
          chatId={chatId}
          selectedVisibilityType={selectedVisibilityType}
        />
      )}

      <Button
        asChild
        className="hidden rounded-lg bg-foreground px-4 text-background hover:bg-foreground/90 md:ml-auto md:flex"
      >
        <Link
          href="https://vercel.com/templates/next.js/chatbot"
          rel="noopener noreferrer"
          target="_blank"
        >
          <VercelIcon size={16} />
          Deploy with Vercel
        </Link>
      </Button>
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return (
    prevProps.chatId === nextProps.chatId &&
    prevProps.selectedVisibilityType === nextProps.selectedVisibilityType &&
    prevProps.isReadonly === nextProps.isReadonly &&
    prevProps.chatMode === nextProps.chatMode
  );
});
