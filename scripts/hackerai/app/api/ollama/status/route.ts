/**
 * Ollama availability + live local model catalog.
 *
 * Backed by the local daemon's `GET /api/tags`; the daemon is the only source
 * of truth, so newly pulled models appear without a code change.
 */
import { NextRequest, NextResponse } from "next/server";
import { getUserID } from "@/lib/auth/get-user-id";
import {
  getOllamaModelName,
  isOllamaEnabled,
  listOllamaModels,
  toOllamaModelKey,
} from "@/lib/ai/providers/ollama";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 60 * 1000;

type OllamaModelEntry = {
  /** Internal `ollama-*` id used as the `SelectedModel` value. */
  id: string;
  /** Model name the daemon expects. */
  modelId: string;
  name: string;
  supportsThinking: boolean;
};

let cached: { data: OllamaModelEntry[]; expiresAt: number } | null = null;

export async function GET(req: NextRequest) {
  try {
    await getUserID(req);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isOllamaEnabled()) {
    return NextResponse.json({
      available: false,
      models: [],
      hint: "Ollama is disabled (OLLAMA_DISABLED=1).",
    });
  }

  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json({
      available: cached.data.length > 0,
      models: cached.data,
      source: "cache",
    });
  }

  const models = await listOllamaModels();
  const entries: OllamaModelEntry[] = models.map((m) => ({
    id: toOllamaModelKey(m.name),
    modelId: m.name,
    name: getOllamaModelName(toOllamaModelKey(m.name)),
    supportsThinking: false,
  }));

  cached = { data: entries, expiresAt: Date.now() + CACHE_TTL_MS };

  return NextResponse.json({
    available: entries.length > 0,
    models: entries,
    ...(entries.length === 0
      ? {
          hint: "No local models found. Start Ollama and run `ollama pull <model>`.",
        }
      : {}),
    source: "daemon",
  });
}
