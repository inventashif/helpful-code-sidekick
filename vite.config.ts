// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Boots (and keeps alive) the local HackerAI runtime whenever the dev server
// starts, so a workspace restart brings the proxied app back automatically.
// The watchdog lives inside a detached tmux session on a fixed socket
// (/tmp/hackerai.sock) so it survives this process going away.
const hackeraiKeepalive = () => ({
  name: "hackerai-keepalive",
  apply: "serve" as const,
  configureServer() {
    const script = "/dev-server/scripts/hackerai-keepalive.sh";
    if (!existsSync(script)) return;
    const child = spawn(
      "bash",
      [
        "-lc",
        "tmux -S /tmp/hackerai.sock has-session -t hackerai 2>/dev/null || " +
          `tmux -S /tmp/hackerai.sock new-session -d -s hackerai 'bash ${script}'`,
      ],
      { detached: true, stdio: "ignore" },
    );
    child.unref();
  },
});


export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [hackeraiKeepalive()],
    server: {
      watch: {
        // The proxied HackerAI app lives in ./hackerai; its build output churns
        // constantly and must not trigger dev-server reloads.
        ignored: ["**/hackerai/**"],
      },
    },
  },
});

