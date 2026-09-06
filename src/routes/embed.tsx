import { createFileRoute } from "@tanstack/react-router";

// Same-origin path: the workspace proxies "/" straight to the local app on
// 127.0.0.1:3000, so this never breaks when a public link changes.
const APP_URL = "/";


export const Route = createFileRoute("/embed")({
  head: () => ({
    meta: [
      { title: "HackerAI Console — Embedded Workspace" },
      {
        name: "description",
        content:
          "Embedded HackerAI penetration-testing console served from the local workspace runtime.",
      },
      { property: "og:title", content: "HackerAI Console — Embedded Workspace" },
      {
        property: "og:description",
        content:
          "Embedded HackerAI penetration-testing console served from the local workspace runtime.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EmbedPage,
});

function EmbedPage() {
  return (
    <div className="h-screen w-screen bg-background">
      <iframe
        src={APP_URL}
        title="HackerAI Console"
        className="h-full w-full border-0"
        allow="clipboard-read; clipboard-write; fullscreen"
      />
    </div>
  );
}
