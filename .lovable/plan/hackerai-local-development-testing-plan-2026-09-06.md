# HackerAI Local Development & Testing Plan

## Goal
Set up the cloned `inventashif/hackerai` repository for full local development and automated testing inside the Lovable sandbox, then prepare to iterate on features or fixes.

## Context
The repository is a Next.js application that provides an AI-powered penetration-testing assistant. It currently sits in `/tmp/hackerai` and uses:
- **Framework:** Next.js (with Turbopack)
- **Backend:** Convex
- **Real-time relay:** Centrifugo (via Docker)
- **AI models:** OpenCode Zen (free tier available)
- **Testing:** Jest (unit) and Playwright (e2e)

## Plan

### 1. Relocate the clone to persistent storage
Move `/tmp/hackerai` to `/mnt/documents/hackerai` so it survives sandbox cleanup and is easy to find.

### 2. Verify prerequisites
Check that the sandbox has:
- Node.js 20, 22, or 24
- pnpm 10+
- Docker (needed for Centrifugo and the local sandbox)
- Git

Install or surface any missing tool before proceeding.

### 3. Install dependencies
Run `pnpm install` inside `/mnt/documents/hackerai`.

### 4. Generate local environment secrets
Run the provided personal setup script:
```
pnpm personal:setup
```
This creates a JWT keypair and writes `.env.local` with local defaults.

### 5. Add the OpenCode Zen API key
Ask the user for a free API key from https://opencode.ai/zen and write it into `.env.local` as `OPENCODE_ZEN_API_KEY`.

### 6. Start the local development stack
Run:
```
pnpm personal:dev
```
This starts:
- Centrifugo on port 8001
- Convex on ports 3210/3211
- Next.js with Turbopack on port 3000

Then verify the app loads at `http://localhost:3000`.

### 7. Connect the local sandbox (optional)
If the user wants terminal/sandbox execution, generate a token in the app at **Settings → Remote Control → Generate Token** and run the local-sandbox command shown there.

### 8. Run the test suites
- Unit tests: `pnpm test`
- End-to-end tests: `pnpm test:e2e`

If tests need test users, run `pnpm test:e2e:setup` first.

### 9. Decide the first change
After the repo is running and tests are green, ask the user what feature, fix, or refactor they want to tackle first, then create a focused implementation plan for that change.

## Technical details
- All commands run from `/mnt/documents/hackerai`.
- The project uses `pnpm`, not `npm`/`bun`, because of `pnpm-workspace.yaml` and workspace patches.
- The `personal:*` scripts are designed for fully local development without WorkOS, E2B cloud, or Trigger.dev.
