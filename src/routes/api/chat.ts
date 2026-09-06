import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.7-flash";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Unauthorized", { status: 401 });

        const supabase = createClient<Database>(
          process.env["SUPABASE_URL"]!,
          process.env["SUPABASE_PUBLISHABLE_KEY"]!,
          { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } },
        );
        const { data: userRes } = await supabase.auth.getUser();
        const user = userRes.user;
        if (!user) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json()) as {
          chatId: string;
          messages: { role: "user" | "assistant" | "system"; content: string }[];
        };
        if (!body.chatId || !Array.isArray(body.messages)) {
          return new Response("Bad Request", { status: 400 });
        }

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("AI key missing", { status: 500 });

        const upstream = await fetch(AI_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: MODEL,
            stream: true,
            messages: [
              {
                role: "system",
                content:
                  "You are HackerAI, an offensive-security research assistant. Answer clearly with practical, ethical guidance for authorized security testing. Refuse illegal targets.",
              },
              ...body.messages,
            ],
          }),
        });

        if (!upstream.ok || !upstream.body) {
          const text = await upstream.text().catch(() => "");
          if (upstream.status === 429) return new Response("Rate limit reached", { status: 429 });
          if (upstream.status === 402) return new Response("AI credits exhausted", { status: 402 });
          return new Response(text || "AI upstream failed", { status: 502 });
        }

        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let assistant = "";
        let buffer = "";

        const stream = new ReadableStream({
          async pull(controller) {
            const { done, value } = await reader.read();
            if (done) {
              if (assistant.trim()) {
                await supabase.from("messages").insert({
                  chat_id: body.chatId,
                  user_id: user.id,
                  role: "assistant",
                  content: assistant,
                });
              }
              controller.close();
              return;
            }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const payload = trimmed.slice(5).trim();
              if (payload === "[DONE]") continue;
              try {
                const parsed = JSON.parse(payload);
                const delta: string | undefined = parsed?.choices?.[0]?.delta?.content;
                if (delta) {
                  assistant += delta;
                  controller.enqueue(encoder.encode(delta));
                }
              } catch {
                /* ignore keepalives */
              }
            }
          },
          cancel() {
            reader.cancel().catch(() => {});
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});
