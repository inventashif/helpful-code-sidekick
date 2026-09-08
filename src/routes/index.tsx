import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ChatRow = { id: string; title: string; updated_at: string };
type MessageRow = { id: string; role: string; content: string };

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HackerAI Console — Always-on Security Research Chat" },
      {
        name: "description",
        content:
          "An always-on security research assistant. Your chats are saved to your account and survive every restart.",
      },
      { property: "og:title", content: "HackerAI Console — Always-on Security Research Chat" },
      {
        property: "og:description",
        content:
          "An always-on security research assistant. Your chats are saved to your account and survive every restart.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ConsolePage,
});

function ConsolePage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate({ to: "/auth" });
        return;
      }
      setEmail(data.session.user.email ?? null);
      setReady(true);
    });
  }, [navigate]);

  const loadChats = useCallback(async () => {
    const { data } = await supabase
      .from("chats")
      .select("id, title, updated_at")
      .order("updated_at", { ascending: false });
    setChats(data ?? []);
    return data ?? [];
  }, []);

  useEffect(() => {
    if (!ready) return;
    loadChats().then((rows) => {
      if (rows.length > 0 && rows[0]) setActiveId(rows[0].id);
    });
  }, [ready, loadChats]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    supabase
      .from("messages")
      .select("id, role, content")
      .eq("chat_id", activeId)
      .order("created_at", { ascending: true })
      .then(({ data }) => setMessages(data ?? []));
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function newChat() {
    const { data: session } = await supabase.auth.getSession();
    const uid = session.session?.user.id;
    if (!uid) return;
    const { data } = await supabase
      .from("chats")
      .insert({ user_id: uid, title: "New chat" })
      .select("id, title, updated_at")
      .single();
    if (data) {
      setChats((prev) => [data, ...prev]);
      setActiveId(data.id);
      setMessages([]);
    }
  }

  async function deleteChat(id: string) {
    await supabase.from("chats").delete().eq("id", id);
    const rows = await loadChats();
    setActiveId(rows[0]?.id ?? null);
  }

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    setError(null);
    setBusy(true);
    setDraft("");

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      navigate({ to: "/auth" });
      return;
    }
    const uid = session.user.id;

    let chatId = activeId;
    if (!chatId) {
      const { data } = await supabase
        .from("chats")
        .insert({ user_id: uid, title: text.slice(0, 60) })
        .select("id, title, updated_at")
        .single();
      if (!data) {
        setError("Could not start a chat.");
        setBusy(false);
        return;
      }
      chatId = data.id;
      setChats((prev) => [data, ...prev]);
      setActiveId(data.id);
    } else if (messages.length === 0) {
      await supabase.from("chats").update({ title: text.slice(0, 60) }).eq("id", chatId);
      loadChats();
    }

    const { data: inserted } = await supabase
      .from("messages")
      .insert({ chat_id: chatId, user_id: uid, role: "user", content: text })
      .select("id, role, content")
      .single();

    const history = [...messages, ...(inserted ? [inserted] : [])];
    setMessages(history);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          chatId,
          messages: history.map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          })),
        }),
      });

      if (!res.ok) {
        setError(
          res.status === 429
            ? "Too many requests right now — try again in a moment."
            : "The assistant could not answer. Please try again.",
        );
        return;
      }

      const data = (await res.json()) as { message?: MessageRow };
      if (data.message) setMessages((prev) => [...prev, data.message as MessageRow]);
    } catch {
      setError("Connection interrupted. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="hidden w-72 flex-col border-r border-border bg-card p-3 md:flex">
        <Button className="w-full" onClick={newChat}>
          New chat
        </Button>
        <div className="mt-3 flex-1 space-y-1 overflow-y-auto">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={`group flex items-center justify-between rounded-md px-2 py-2 text-sm ${
                chat.id === activeId ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
              }`}
            >
              <button
                type="button"
                className="flex-1 truncate text-left"
                onClick={() => setActiveId(chat.id)}
              >
                {chat.title}
              </button>
              <button
                type="button"
                aria-label="Delete chat"
                className="ml-2 hidden text-xs text-muted-foreground group-hover:block"
                onClick={() => deleteChat(chat.id)}
              >
                ✕
              </button>
            </div>
          ))}
          {chats.length === 0 ? (
            <p className="px-2 py-4 text-xs text-muted-foreground">No chats yet.</p>
          ) : null}
        </div>
        <div className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          <p className="truncate">{email}</p>
          <div className="mt-2 flex items-center gap-3">
            <button type="button" className="underline" onClick={signOut}>
              Sign out
            </button>
            <Link to="/embed" className="underline">
              Local console
            </Link>
          </div>
        </div>
      </aside>

      <main className="flex flex-1 flex-col">
        <header className="border-b border-border px-4 py-3">
          <h1 className="text-sm font-semibold">HackerAI Console</h1>
          <p className="text-xs text-muted-foreground">
            Always on — your chats are saved to your account.
          </p>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-6">
          {messages.length === 0 && !busy ? (
            <div className="mx-auto max-w-lg py-16 text-center">
              <h2 className="text-lg font-semibold">Start a security research chat</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Ask about recon, web app testing, hardening, or report writing.
              </p>
            </div>
          ) : null}

          {messages.map((m) => (
            <div key={m.id} className="mx-auto max-w-3xl">
              <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                {m.role === "assistant" ? "HackerAI" : "You"}
              </p>
              <div className="whitespace-pre-wrap rounded-md border border-border bg-card px-3 py-2 text-sm">
                {m.content}
              </div>
            </div>
          ))}

          {busy ? (
            <div className="mx-auto max-w-3xl">
              <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">HackerAI</p>
              <div className="whitespace-pre-wrap rounded-md border border-border bg-card px-3 py-2 text-sm">
                Thinking…
              </div>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-border p-3">
          {error ? <p className="mx-auto mb-2 max-w-3xl text-xs text-destructive">{error}</p> : null}
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <Textarea
              value={draft}
              placeholder="Ask HackerAI…"
              rows={2}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <Button onClick={send} disabled={busy || draft.trim().length === 0}>
              {busy ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
