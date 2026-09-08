/**
 * The console is a proxied app, so its server side reads the account from an
 * HttpOnly cookie. These helpers keep that cookie in step with the session.
 */
export async function syncConsoleSession(accessToken: string): Promise<void> {
  try {
    await fetch("/api/public/console-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ access_token: accessToken }),
    });
  } catch {
    // ignore: the auth gate will send the user back to sign-in
  }
}

export async function clearConsoleSession(): Promise<void> {
  try {
    await fetch("/api/public/console-session", { method: "DELETE" });
  } catch {
    // ignore
  }
}
