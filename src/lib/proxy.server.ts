// Public fallback used when localhost is unreachable (deployed Worker).
// Cloudflare Quick Tunnels (*.trycloudflare.com) cannot be fetched from the
// Worker — Cloudflare's edge answers 1003 — so this must be a non-Cloudflare
// tunnel (localtunnel).
const DEFAULT_TARGET = "https://inventashif-hackerai.loca.lt";

// Inside the workspace the app is reachable directly on localhost, which never
// expires. Only fall back to the public tunnel when localhost is unreachable
// (e.g. the deployed Worker).
const LOCAL_TARGET = "http://127.0.0.1:3000";

let localOk: boolean | undefined;
let localCheckedAt = 0;

async function localReachable(): Promise<boolean> {
  // In the deployed Cloudflare Worker there is no localhost app, and fetching a
  // raw IP there is answered by Cloudflare's edge with "error code: 1003"
  // (a 403), which previously looked "reachable" and got proxied to the user.
  if (process.env["NODE_ENV"] === "production") return false;
  const now = Date.now();
  if (localOk !== undefined && now - localCheckedAt < 30_000) return localOk;
  localCheckedAt = now;
  try {
    const res = await fetch(`${LOCAL_TARGET}/`, {
      method: "HEAD",
      signal: AbortSignal.timeout(1500),
    });
    // Only real app responses count; 4xx/5xx edge errors do not.
    localOk = res.status < 400;
  } catch {
    localOk = false;
  }
  return localOk;
}

const getTarget = () =>
  (process.env["APP_PROXY_TARGET"] || DEFAULT_TARGET).replace(/\/$/, "");


const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  "content-encoding",
  // Cloudflare-injected headers: forwarding them into another Cloudflare zone
  // (the tunnel hostname) makes the edge reject the request with error 1003.
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "cf-worker",
  "cf-ew-via",
  "cf-request-id",
  "cdn-loop",
  "x-forwarded-for",
  "x-real-ip",
]);


export async function proxyRequest(request: Request): Promise<Response> {
  const target = (await localReachable()) ? LOCAL_TARGET : getTarget();
  const incoming = new URL(request.url);
  const targetUrl = new URL(target);
  const url = `${targetUrl.origin}${incoming.pathname}${incoming.search}`;


  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (HOP_BY_HOP.has(k) || k.startsWith("cf-")) return;
    headers.set(key, value);
  });
  // Never forward/override Host: the fetch URL decides it. Setting it manually
  // makes Cloudflare-fronted tunnel hosts answer 1003.
  headers.delete("host");
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-forwarded-proto", incoming.protocol.replace(":", ""));
  // localtunnel shows an interstitial page to unknown browsers unless this
  // header is present.
  headers.set("bypass-tunnel-reminder", "1");

  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";

  const attempt = () =>
    fetch(url, {
      method,
      headers,
      body: hasBody ? request.body : undefined,
      redirect: "manual",
      // @ts-expect-error Cloudflare/undici streaming request bodies
      duplex: hasBody ? "half" : undefined,
    });

  try {
    let upstream: Response;
    try {
      upstream = await attempt();
    } catch (error) {
      // One retry for transient upstream hiccups (restarts, tunnel reconnects).
      if (hasBody) throw error;
      await new Promise((resolve) => setTimeout(resolve, 400));
      upstream = await attempt();
    }


    const responseHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      if (!HOP_BY_HOP.has(key.toLowerCase())) responseHeaders.set(key, value);
    });

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch {
    return new Response(
      "The app is not reachable right now. Make sure it is running.",
      { status: 502, headers: { "content-type": "text/plain" } },
    );
  }
}

/**
 * Console requests require a signed-in account. The console itself is a proxied
 * app, so the session travels in an HttpOnly cookie set right after sign-in.
 */
async function gatedProxy(request: Request): Promise<Response> {
  const { consoleUserId, gateToken } = await import("./console-gate.server");
  const userId = await consoleUserId(request);

  if (!userId) {
    const wantsHtml = (request.headers.get("accept") ?? "").includes("text/html");
    if (wantsHtml) {
      return new Response(null, { status: 302, headers: { location: "/auth" } });
    }
    return new Response("Sign in required", { status: 401 });
  }

  const url = new URL(request.url);
  const isChat = request.method === "POST" && /\/api\/chat(\/|$)/.test(url.pathname);

  if (!isChat) return proxyRequest(request);

  let rawBody = "";
  let forwarded = request;
  try {
    rawBody = await request.clone().text();
  } catch {
    forwarded = request;
  }

  const startedAt = Date.now();
  const response = await proxyRequest(forwarded);

  const token = gateToken(request);
  if (token && rawBody) {
    const { captureFromBody, recordRun } = await import("./console-activity.server");
    void recordRun(
      token,
      userId,
      captureFromBody(rawBody),
      response.status,
      Date.now() - startedAt,
    );
  }

  return response;
}

export const proxyHandlers = {
  GET: ({ request }: { request: Request }) => gatedProxy(request),
  POST: ({ request }: { request: Request }) => gatedProxy(request),
  PUT: ({ request }: { request: Request }) => gatedProxy(request),
  PATCH: ({ request }: { request: Request }) => gatedProxy(request),
  DELETE: ({ request }: { request: Request }) => gatedProxy(request),
  OPTIONS: ({ request }: { request: Request }) => proxyRequest(request),
  HEAD: ({ request }: { request: Request }) => gatedProxy(request),
};
