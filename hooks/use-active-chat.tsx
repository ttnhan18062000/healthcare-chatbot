"use client";

import { useChat } from "@ai-sdk/react";
import { usePathname } from "next/navigation";
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import useSWR, { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import { getChatHistoryPaginationKey } from "@/components/chat/sidebar-history";
import { toast } from "@/components/chat/toast";
import type { VisibilityType } from "@/components/chat/visibility-selector";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { fetcher, generateUUID } from "@/lib/utils";

type ActiveChatContextValue = {
  chatId: string;
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  sendMessage: (message?: any, options?: any) => any;
  handleSubmit: (e?: React.FormEvent) => any;
  handleInputChange: (
    e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>
  ) => void;
  status: any;
  stop: () => any;
  regenerate: (options?: any) => any;
  addToolApprovalResponse: (response: any) => any;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  visibilityType: VisibilityType;
  isReadonly: boolean;
  isLoading: boolean;
  votes: Vote[] | undefined;
  currentModelId: string;
  setCurrentModelId: (id: string) => void;
  chatMode: "normal" | "rag";
  setChatMode: (mode: "normal" | "rag") => void;
  showCreditCardAlert: boolean;
  setShowCreditCardAlert: Dispatch<SetStateAction<boolean>>;
};

const ActiveChatContext = createContext<ActiveChatContextValue | null>(null);

function extractChatId(pathname: string): string | null {
  const match = pathname.match(/\/chat\/([^/]+)/);
  return match ? match[1] : null;
}

export function ActiveChatProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const chatIdFromUrl = extractChatId(pathname);
  const isNewChat = !chatIdFromUrl;
  const newChatIdRef = useRef(generateUUID());
  const prevPathnameRef = useRef(pathname);

  if (isNewChat && prevPathnameRef.current !== pathname) {
    newChatIdRef.current = generateUUID();
  }
  prevPathnameRef.current = pathname;

  const chatId = chatIdFromUrl ?? newChatIdRef.current;

  const [currentModelId, setCurrentModelId] = useState(DEFAULT_CHAT_MODEL);
  const [chatMode, setChatMode] = useState<"normal" | "rag">("normal");
  const isManualModeSelectionRef = useRef(false);

  const setChatModeWithTracking = useCallback((mode: "normal" | "rag") => {
    isManualModeSelectionRef.current = true;
    setChatMode(mode);
  }, []);

  const [showCreditCardAlert, setShowCreditCardAlert] = useState(false);
  const [input, setInput] = useState("");

  const { data: chatData, isLoading: isChatLoading } = useSWR(
    isNewChat
      ? null
      : `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/messages?chatId=${chatId}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  useEffect(() => {
    if (chatData?.chatMode && !isChatLoading) {
      if (!isManualModeSelectionRef.current) {
        setChatMode(chatData.chatMode);
      }
    }
  }, [chatData?.chatMode, isChatLoading]);

  const initialMessages: ChatMessage[] = isNewChat
    ? []
    : (chatData?.messages ?? []);
  const visibility: VisibilityType = isNewChat
    ? "private"
    : (chatData?.visibility ?? "private");

  const {
    messages,
    setMessages,
    sendMessage: baseSendMessage,
    status,
    stop,
    regenerate,
    addToolApprovalResponse,
    resumeStream,
  } = useChat({
    id: chatId,
    messages: initialMessages as any,
    experimental_throttle: 100,
    // @ts-ignore - body is supported at runtime in many transports but missing in types
    body: {
      mode: chatMode,
    },
    onError: (error: Error) => {
      if (error.message?.includes("AI Gateway requires a valid credit card")) {
        setShowCreditCardAlert(true);
      } else {
        toast({
          type: "error",
          description: error.message || "Oops, an error occurred!",
        });
      }
    },
  });

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      setInput(e.target.value);
    },
    []
  );

  const sendMessage = useCallback(async (
    params: string | (Omit<ChatMessage, "id"> & { id?: string })
  ) => {
    if (typeof params === "string") {
      const text = params.trim();
      if (!text) return;

      const userMessage: Omit<ChatMessage, "id"> = {
        role: "user",
        parts: [{ type: "text", text }],
      };

      setInput("");
    }

    return baseSendMessage(params as any, {
      body: {
        mode: chatMode,
      },
    });
  }, [baseSendMessage, chatMode]);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || status === "streaming") return;
    await sendMessage(input);
  }, [input, status, sendMessage]);

  const loadedChatIds = useRef(new Set<string>());

  if (isNewChat && !loadedChatIds.current.has(newChatIdRef.current)) {
    loadedChatIds.current.add(newChatIdRef.current);
  }

  useEffect(() => {
    if (loadedChatIds.current.has(chatId)) {
      return;
    }
    if (chatData?.messages) {
      loadedChatIds.current.add(chatId);
      setMessages(chatData.messages as any);
    }
  }, [chatId, chatData?.messages, setMessages]);

  const prevChatIdRef = useRef(chatId);
  useEffect(() => {
    if (prevChatIdRef.current !== chatId) {
      prevChatIdRef.current = chatId;
      if (isNewChat) {
        setMessages([]);
      }
    }
  }, [chatId, isNewChat, setMessages]);

  const isReadonly = isNewChat ? false : (chatData?.isReadonly ?? false);

  const { data: votes } = useSWR<Vote[]>(
    !isReadonly && messages.length >= 2
      ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/vote?chatId=${chatId}`
      : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const value = useMemo<ActiveChatContextValue>(
    () => ({
      chatId,
      messages: messages as ChatMessage[],
      setMessages: setMessages as any,
      sendMessage: sendMessage as any,
      handleSubmit,
      status: status as any,
      stop,
      regenerate: regenerate as any,
      addToolApprovalResponse,
      input,
      setInput,
      handleInputChange,
      visibilityType: visibility,
      isReadonly,
      isLoading: !isNewChat && isChatLoading,
      votes,
      currentModelId,
      setCurrentModelId,
      chatMode,
      setChatMode: setChatModeWithTracking,
      showCreditCardAlert,
      setShowCreditCardAlert,
    }),
    [
      chatId,
      messages,
      setMessages,
      sendMessage,
      handleSubmit,
      status,
      stop,
      regenerate,
      addToolApprovalResponse,
      input,
      handleInputChange,
      visibility,
      isReadonly,
      isNewChat,
      isChatLoading,
      votes,
      currentModelId,
      chatMode,
      showCreditCardAlert,
    ]
  );

  return (
    <ActiveChatContext.Provider value={value}>
      {children}
    </ActiveChatContext.Provider>
  );
}

export function useActiveChat() {
  const context = useContext(ActiveChatContext);
  if (!context) {
    throw new Error("useActiveChat must be used within an ActiveChatProvider");
  }
  return context;
}
