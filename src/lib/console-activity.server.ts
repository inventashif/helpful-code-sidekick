import { userClient } from "./console-gate.server";

type Captured = {
  externalId?: string | null;
  title?: string | null;
  model?: string | null;
  mode?: string | null;
};

function pickString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : null;
}

/** Best-effort extraction of session/model info from a console chat request. */
export function captureFromBody(raw: string): Captured {
  try {
    const body = JSON.parse(raw) as Record<string, unknown>;
    const messages = Array.isArray(body["messages"]) ? body["messages"] : [];
    const first = messages.find(
      (m) => typeof m === "object" && m !== null && (m as Record<string, unknown>)["role"] === "user",
    ) as Record<string, unknown> | undefined;
    const content = first ? first["content"] : undefined;
    return {
      externalId:
        pickString(body["chatId"]) ?? pickString(body["id"]) ?? pickString(body["threadId"]),
      title: pickString(content),
      model: pickString(body["model"]) ?? pickString(body["modelId"]),
      mode: pickString(body["mode"]) ?? pickString(body["chatMode"]),
    };
  } catch {
    return {};
  }
}

/**
 * Persists a chat session, the model run and the latest model/mode preference
 * for the signed-in console user. Never throws: telemetry must not break chat.
 */
export async function recordRun(
  token: string,
  userId: string,
  info: Captured,
  status: number,
  durationMs: number,
): Promise<void> {
  try {
    const supabase = userClient(token);
    let sessionId: string | null = null;

    if (info.externalId) {
      const { data } = await supabase
        .from("console_sessions")
        .upsert(
          {
            user_id: userId,
            external_id: info.externalId,
            title: info.title,
            last_active_at: new Date().toISOString(),
          },
          { onConflict: "user_id,external_id" },
        )
        .select("id")
        .maybeSingle();
      sessionId = data?.id ?? null;
    }

    await supabase.from("model_runs").insert({
      user_id: userId,
      session_id: sessionId,
      model: info.model,
      mode: info.mode,
      status,
      duration_ms: Math.round(durationMs),
    });

    if (info.model || info.mode) {
      await supabase.from("console_preferences").upsert({
        user_id: userId,
        model: info.model,
        mode: info.mode,
        updated_at: new Date().toISOString(),
      });
    }
  } catch {
    // ignore
  }
}
