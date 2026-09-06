import { createFileRoute } from "@tanstack/react-router";
import { proxyHandlers } from "@/lib/proxy.server";

export const Route = createFileRoute("/$")({
  server: {
    handlers: proxyHandlers,
  },
});
