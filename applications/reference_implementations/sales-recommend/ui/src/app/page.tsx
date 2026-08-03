"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ChatView } from "@/components/ChatView";
import { ReportPreviewPanel } from "@/components/ReportPreviewPanel";
import { SolutionMatrix } from "@/components/SolutionMatrix";
import { ClientApproachReport } from "@/components/ClientApproachReport";
import { ChatMessage, HighlightsBlock } from "@/lib/types";
import { initialMessages } from "@/lib/mockData";
import { newSessionId, streamAgentReply } from "@/lib/agentClient";
import { extractHighlights } from "@/lib/highlights";
import { extractChoices } from "@/lib/choices";
import { dbg } from "@/lib/debug";

type View = "chat" | "matrix" | "report";

function timestampNow() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Home() {
  const [view, setView] = useState<View>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isTyping, setIsTyping] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

  // Stable AgentCore session ID for the lifetime of this conversation.
  // Reused across turns so the agent gets multi-turn context. Reset on New Chat.
  const sessionIdRef = useRef<string>(newSessionId());
  // Allow cancelling an in-flight request when the user clears or starts a new chat.
  const abortRef = useRef<AbortController | null>(null);

  // The latest highlights block extracted from any assistant message in the
  // current conversation. Walks backwards so we always prefer the most
  // recent recommendation.
  const latestHighlights = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== "assistant") continue;
      // Don't surface mid-stream blocks until the closing fence has arrived.
      if (m.streaming) continue;
      const { block } = extractHighlights(m.content);
      if (block) return block;
    }
    return null;
  }, [messages]);

  // "Sticky" highlights — what the right panel actually shows. We promote a
  // new block here when one arrives, but never clear it just because a later
  // assistant turn happens not to emit a block. That keeps cards from
  // flashing away between questions; they only get replaced by the next
  // recommendation. Reset explicitly on New Chat / Clear.
  const [stickyHighlights, setStickyHighlights] =
    useState<HighlightsBlock | null>(null);
  useEffect(() => {
    if (latestHighlights) {
      setStickyHighlights(latestHighlights);
      dbg.log("sticky highlights updated", {
        points: latestHighlights.points.length,
        title: latestHighlights.title,
      });
    }
  }, [latestHighlights]);

  const handleSend = async (text: string) => {
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: timestampNow(),
    };
    setMessages((m) => [...m, userMsg]);
    setIsTyping(true);

    // Cancel any previous in-flight request.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const aiId = `a-${Date.now()}`;
    let started = false;
    // Local accumulator so we can log/parse the full response without
    // doing the dance of reading state from inside a setter callback.
    let assembled = "";

    try {
      const stream = streamAgentReply({
        message: text,
        sessionId: sessionIdRef.current,
        signal: controller.signal,
      });

      for await (const chunk of stream) {
        if (!chunk) continue;
        assembled += chunk;
        if (!started) {
          started = true;
          setIsTyping(false);
          setMessages((m) => [
            ...m,
            {
              id: aiId,
              role: "assistant",
              content: chunk,
              timestamp: timestampNow(),
              streaming: true,
            },
          ]);
        } else {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === aiId ? { ...msg, content: msg.content + chunk } : msg
            )
          );
        }
      }

      if (!started) {
        // Stream ended without producing any text.
        setIsTyping(false);
        setMessages((m) => [
          ...m,
          {
            id: aiId,
            role: "assistant",
            content: "_The agent returned an empty response._",
            timestamp: timestampNow(),
          },
        ]);
        dbg.log("stream produced no text");
      } else {
        // Mark the streamed message complete so embedded interactions enable.
        setMessages((m) =>
          m.map((msg) => (msg.id === aiId ? { ...msg, streaming: false } : msg))
        );

        // ---- Debug: post-stream summary --------------------------------
        dbg.group("assistant message complete", () => {
          dbg.text("full markdown", assembled);
          const hl = extractHighlights(assembled);
          if (hl.block) {
            dbg.log(
              `highlights → ${hl.block.points.length} point(s)`,
              hl.block
            );
          } else {
            dbg.log("highlights → none parsed");
            const hasFence = /```(?:highlights|talking_points)/.test(assembled);
            if (hasFence) {
              dbg.warn(
                "fence detected but no block returned — check [highlights] warnings above"
              );
            }
          }
          const ch = extractChoices(assembled);
          if (ch.blocks.length) {
            dbg.log(`choices → ${ch.blocks.length} block(s)`, ch.blocks);
          }
        });
      }
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") {
        // User cancelled — silently drop.
        setIsTyping(false);
        setMessages((m) =>
          m.map((msg) => (msg.id === aiId ? { ...msg, streaming: false } : msg))
        );
        return;
      }
      const detail = err instanceof Error ? err.message : "Unknown error";
      setIsTyping(false);
      setMessages((m) => [
        ...m.map((msg) =>
          msg.id === aiId ? { ...msg, streaming: false } : msg
        ),
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          content: `**⚠️ Could not reach the agent.**\n\n\`${detail}\`\n\nCheck that \`.env.local\` has valid \`AWS_*\` credentials and \`AGENT_RUNTIME_ARN\`, then try again.`,
          timestamp: timestampNow(),
        },
      ]);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  };

  const handleClear = () => {
    abortRef.current?.abort();
    sessionIdRef.current = newSessionId();
    setMessages(initialMessages.slice(0, 1));
    setIsTyping(false);
    setStickyHighlights(null);
  };

  const handleNewChat = () => {
    abortRef.current?.abort();
    sessionIdRef.current = newSessionId();
    setView("chat");
    setMessages(initialMessages.slice(0, 1));
    setIsTyping(false);
    setSidebarOpen(false);
    setStickyHighlights(null);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-ink-950 text-slate-200">
      <Sidebar
        activeView={view}
        onNavigate={(v) => {
          setView(v);
          setSidebarOpen(false);
        }}
        onNewChat={handleNewChat}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main column */}
      <main className="flex min-w-0 flex-1">
        {view === "chat" && (
          <>
            <ChatView
              messages={messages}
              isTyping={isTyping}
              onSend={handleSend}
              onClear={handleClear}
              onOpenSidebar={() => setSidebarOpen(true)}
              onOpenPanel={() => setPanelOpen(true)}
              onGenerateReport={() => setView("report")}
              panelOpen={panelOpen}
            />
            {/* Right panel — collapsible */}
            <div
              className={`transition-all duration-300 ${
                panelOpen ? "w-[360px] xl:w-[400px]" : "w-0"
              } hidden overflow-hidden xl:block`}
            >
              {panelOpen && (
                <ReportPreviewPanel
                  highlights={stickyHighlights}
                  onClose={() => setPanelOpen(false)}
                />
              )}
            </div>
            {/* Mobile right panel as overlay */}
            {panelOpen && (
              <div className="fixed inset-0 z-40 xl:hidden">
                <div
                  className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                  onClick={() => setPanelOpen(false)}
                />
                <div className="absolute right-0 top-0 h-full w-[90%] max-w-md">
                  <ReportPreviewPanel
                    highlights={stickyHighlights}
                    onClose={() => setPanelOpen(false)}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {view === "matrix" && <SolutionMatrix onBack={() => setView("chat")} />}

        {view === "report" && <ClientApproachReport onBack={() => setView("chat")} />}
      </main>
    </div>
  );
}
