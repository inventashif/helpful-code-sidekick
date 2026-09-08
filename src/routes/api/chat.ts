import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.7-flash";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Unauthorized", { status: 401 });

        const supabase = createClient<Database>(
          process.env["SUPABASE_URL"]!,
          process.env["SUPABASE_PUBLISHABLE_KEY"]!,
          {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: `Bearer ${token}` } },
          },
        );
        const { data: userRes } = await supabase.auth.getUser();
        const user = userRes.user;
        if (!user) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json()) as {
          chatId?: string;
          messages?: { role: "user" | "assistant"; content: string }[];
        };
        if (!body.chatId || !Array.isArray(body.messages) || body.messages.length === 0) {
          return new Response("Bad Request", { status: 400 });
        }

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("AI key missing", { status: 500 });

        const upstream = await fetch(AI_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              {
                role: "system",
                content:
                  "You are HackerAI, an offensive-security research assistant. Give clear, practical, ethical guidance for authorized security testing, with concrete commands and steps where useful. Refuse requests that target systems the user is not authorized to test.",
              },
              ...body.messages.slice(-30),
            ],
          }),
        });

        if (!upstream.ok) {
          if (upstream.status === 429) return new Response("Rate limit reached", { status: 429 });
          if (upstream.status === 402) return new Response("AI credits exhausted", { status: 402 });
          console.error("AI upstream failed", upstream.status, await upstream.text().catch(() => ""));
          return new Response("AI upstream failed", { status: 502 });
        }

        const payload = (await upstream.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const reply = payload.choices?.[0]?.message?.content?.trim() ?? "";
        if (!reply) return new Response("Empty reply", { status: 502 });

        const { data: saved } = await supabase
          .from("messages")
          .insert({
            chat_id: body.chatId,
            user_id: user.id,
            role: "assistant",
            content: reply,
          })
          .select("id, role, content")
          .single();

        return Response.json(
          { message: saved ?? { id: `tmp-${Date.now()}`, role: "assistant", content: reply } },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
