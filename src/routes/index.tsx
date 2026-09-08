import { createFileRoute } from "@tanstack/react-router";
import { proxyHandlers } from "@/lib/proxy.server";

// Full HackerAI runtime (Next.js + Convex + Centrifugo + sandbox) proxied from
// the workspace machine. Same app as the persistent backup.
export const Route = createFileRoute("/")({
  server: {
    handlers: proxyHandlers,
  },
});
