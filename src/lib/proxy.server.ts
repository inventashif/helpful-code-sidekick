const DEFAULT_TARGET =
  "https://divorce-drugs-ruth-aged.trycloudflare.com";

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
]);

export async function proxyRequest(request: Request): Promise<Response> {
  const target = getTarget();
  const incoming = new URL(request.url);
  const targetUrl = new URL(target);
  const url = `${targetUrl.origin}${incoming.pathname}${incoming.search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });
  headers.set("host", targetUrl.host);
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-forwarded-proto", incoming.protocol.replace(":", ""));

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

export const proxyHandlers = {
  GET: ({ request }: { request: Request }) => proxyRequest(request),
  POST: ({ request }: { request: Request }) => proxyRequest(request),
  PUT: ({ request }: { request: Request }) => proxyRequest(request),
  PATCH: ({ request }: { request: Request }) => proxyRequest(request),
  DELETE: ({ request }: { request: Request }) => proxyRequest(request),
  OPTIONS: ({ request }: { request: Request }) => proxyRequest(request),
  HEAD: ({ request }: { request: Request }) => proxyRequest(request),
};
