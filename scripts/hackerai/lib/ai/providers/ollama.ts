/**
 * Ollama provider, backed by a locally running Ollama daemon.
 *
 * Ollama ships an OpenAI-compatible surface at `/v1` (chat completions with
 * streaming and tool calls), so it is treated as a plain OpenAI-compatible
 * endpoint via `createOpenAI`, exactly like the Kiro Gateway provider.
 *
 * Internal model keys are `ollama-<model>` (e.g. `ollama-qwen2:7b`) so
 * `coerceSelectedModel` and the tier router can recognize them without an
 * allowlist — the daemon's `/api/tags` is the source of truth.
 *
 * Server-only: never import from client components.
 */
import { createOpenAI } from "@ai-sdk/openai";

const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";

export const OLLAMA_MODEL_PREFIX = "ollama-";

/** Base URL of the Ollama daemon, without a trailing slash. */
export function getOllamaBaseURL(): string {
  const configured =
    process.env.OLLAMA_BASE_URL?.trim() || process.env.OLLAMA_HOST?.trim();
  const raw = configured || DEFAULT_OLLAMA_BASE_URL;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  return withScheme.replace(/\/+$/, "");
}

/** OpenAI-compatible API root of the daemon. */
export function getOllamaOpenAIBaseURL(): string {
  return `${getOllamaBaseURL()}/v1`;
}

/** Ollama is opt-out: local daemons need no key. */
export function isOllamaEnabled(): boolean {
  return process.env.OLLAMA_DISABLED !== "1";
}

export function isOllamaModelKey(value: string): boolean {
  return (
    value.startsWith(OLLAMA_MODEL_PREFIX) &&
    value.length > OLLAMA_MODEL_PREFIX.length
  );
}

/** Map an internal `ollama-*` key to the model name the daemon expects. */
export function getOllamaModelId(key: string): string {
  return isOllamaModelKey(key) ? key.slice(OLLAMA_MODEL_PREFIX.length) : key;
}

/** Map a daemon model name back to its internal key. */
export function toOllamaModelKey(modelId: string): string {
  return `${OLLAMA_MODEL_PREFIX}${modelId}`;
}

/** Human-readable label for a local model (e.g. `qwen2:7b` -> `Qwen2 7b`). */
export function getOllamaModelName(key: string): string {
  const modelId = getOllamaModelId(key);
  const label = modelId
    .replace(/:latest$/, "")
    .split(/[-:_/]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  return `${label} (Ollama)`;
}

export type OllamaTagModel = {
  name: string;
  details?: { parameter_size?: string; family?: string };
  capabilities?: string[];
};

/** List installed models from the daemon. Empty array when unreachable. */
export async function listOllamaModels(
  signal?: AbortSignal,
): Promise<OllamaTagModel[]> {
  if (!isOllamaEnabled()) return [];
  try {
    const res = await fetch(`${getOllamaBaseURL()}/api/tags`, {
      cache: "no-store",
      signal: signal ?? AbortSignal.timeout(4_000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { models?: OllamaTagModel[] };
    return Array.isArray(json.models) ? json.models : [];
  } catch {
    return [];
  }
}

let cachedProvider: ReturnType<typeof createOpenAI> | null = null;
let cachedFingerprint: string | null = null;

function getDaemon(): ReturnType<typeof createOpenAI> {
  const baseURL = getOllamaOpenAIBaseURL();
  if (!cachedProvider || cachedFingerprint !== baseURL) {
    cachedProvider = createOpenAI({
      name: "ollama",
      // Ollama ignores the key, but the SDK requires a non-empty value.
      apiKey: process.env.OLLAMA_API_KEY?.trim() || "ollama",
      baseURL,
    });
    cachedFingerprint = baseURL;
  }
  return cachedProvider;
}

export function createOllamaProvider() {
  return (modelKey: string) => {
    const daemon = getDaemon();
    return daemon.chat(
      getOllamaModelId(modelKey) as Parameters<typeof daemon.chat>[0],
    );
  };
}
