import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const GATE_COOKIE = "hai_console";

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function publicClient() {
  return createClient<Database>(
    process.env["SUPABASE_URL"]!,
    process.env["SUPABASE_PUBLISHABLE_KEY"]!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

/** Access token of the signed-in console user, or null. */
export function gateToken(request: Request): string | null {
  return readCookie(request, GATE_COOKIE);
}

/** Validates the console cookie against Auth and returns the user id. */
export async function consoleUserId(request: Request): Promise<string | null> {
  const token = gateToken(request);
  if (!token) return null;
  try {
    const { data, error } = await publicClient().auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

/** Supabase client acting as the signed-in console user (RLS applies). */
export function userClient(token: string) {
  return createClient<Database>(
    process.env["SUPABASE_URL"]!,
    process.env["SUPABASE_PUBLISHABLE_KEY"]!,
    {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );
}

export function gateCookieHeader(token: string): string {
  const maxAge = 60 * 60 * 12;
  // SameSite=None so the cookie also works when the console runs inside the
  // Lovable editor preview iframe (a third-party context).
  return `${GATE_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${maxAge}`;
}

export function clearGateCookieHeader(): string {
  return `${GATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`;
}

