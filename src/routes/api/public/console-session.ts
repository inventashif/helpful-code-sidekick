import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  clearGateCookieHeader,
  gateCookieHeader,
} from "@/lib/console-gate.server";

const bodySchema = z.object({ access_token: z.string().min(10) });

export const Route = createFileRoute("/api/public/console-session")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let parsed: { access_token: string };
        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return new Response("Invalid request", { status: 400 });
        }

        const supabase = createClient(
          process.env["SUPABASE_URL"]!,
          process.env["SUPABASE_PUBLISHABLE_KEY"]!,
          { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
        );
        const { data, error } = await supabase.auth.getUser(parsed.access_token);
        if (error || !data.user) {
          return new Response("Unauthorized", { status: 401 });
        }

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "set-cookie": gateCookieHeader(parsed.access_token),
          },
        });
      },
      DELETE: async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "set-cookie": clearGateCookieHeader(),
          },
        }),
    },
  },
});
