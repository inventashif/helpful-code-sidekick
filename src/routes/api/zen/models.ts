import { createFileRoute } from "@tanstack/react-router";
import { randomBytes } from "node:crypto";

type ZenModel = { id: string; object?: string; created?: number; owned_by?: string };

const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: { data: ZenModel[]; expiresAt: number } | null = null;

const isFreeModel = (id: string) => id.endsWith("-free") || id === "big-pickle";

function zenHeaders(): Record<string, string> {
  const key = process.env["OPENCODE_ZEN_API_KEY"]?.trim();
  return {
    "Content-Type": "application/json",
    "x-opencode-client": "cli",
    "x-opencode-project": "global",
    "x-opencode-request": `msg_${randomBytes(16).toString("hex")}`,
    "x-opencode-session": `ses_${randomBytes(16).toString("hex")}`,
    "User-Agent": "opencode/1.15.0 ai-sdk/provider-utils/4.0.23",
    Authorization: key ? `Bearer ${key}` : "Bearer public",
  };
}

export const Route = createFileRoute("/api/zen/models")({
  server: {
    handlers: {
      GET: async () => {
        if (cached && Date.now() < cached.expiresAt) {
          return Response.json({ object: "list", data: cached.data });
        }
        const baseUrl = process.env["OPENCODE_ZEN_BASE_URL"]?.trim() || "https://opencode.ai/zen/v1";
        try {
          const res = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
            headers: zenHeaders(),
          });
          if (!res.ok) {
            if (cached) return Response.json({ object: "list", data: cached.data, stale: true });
            return new Response("Failed to fetch Zen models", { status: 502 });
          }
          const json = (await res.json()) as { data?: ZenModel[] };
          const all = Array.isArray(json.data) ? json.data : [];
          const free = all.filter((m) => isFreeModel(m.id)).sort((a, b) => a.id.localeCompare(b.id));
          cached = { data: free, expiresAt: Date.now() + CACHE_TTL_MS };
          return Response.json({ object: "list", data: free });
        } catch {
          if (cached) return Response.json({ object: "list", data: cached.data, stale: true });
          return new Response("Failed to fetch Zen models", { status: 502 });
        }
      },
    },
  },
});
