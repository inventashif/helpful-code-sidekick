import { createFileRoute } from "@tanstack/react-router";
import { proxyHandlers } from "@/lib/proxy.server";

// The original workspace-hosted HackerAI runtime, proxied from its own machine.
// The persistent Cloud console lives at "/".
export const Route = createFileRoute("/local")({
  server: {
    handlers: proxyHandlers,
  },
});
