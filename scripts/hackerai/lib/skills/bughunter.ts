import { promises as fs } from "node:fs";
import path from "node:path";

type Skill = { file: string; title: string; tokens: Set<string> };

const ROOT = path.join(process.cwd(), "skills", "bughunter");
const MAX_CHARS = 12_000;
const bodyCache = new Map<string, string>();
let indexPromise: Promise<Skill[]> | null = null;

const words = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9+#.-]+/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2),
  );

async function buildIndex(): Promise<Skill[]> {
  const entries = await fs.readdir(ROOT, { withFileTypes: true });
  const skills: Skill[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = path.join(ROOT, entry.name, "SKILL.md");
    try {
      const body = await fs.readFile(file, "utf8");
      const title =
        body.match(/^#\s+(.+)$/m)?.[1]?.trim() || entry.name.replace(/-/g, " ");
      skills.push({ file, title, tokens: words(`${entry.name} ${title}`) });
    } catch {
      // Ignore malformed or incomplete playbook directories.
    }
  }
  return skills;
}

export async function getBugHunterPlaybookSection(
  query: string,
): Promise<string> {
  if (process.env.BUGHUNTER_SKILLS_DISABLED === "1" || !query.trim()) return "";
  try {
    indexPromise ??= buildIndex();
    const queryTokens = words(query);
    let best: Skill | undefined;
    let bestScore = 0;
    for (const skill of await indexPromise) {
      let score = 0;
      for (const token of queryTokens) if (skill.tokens.has(token)) score += 1;
      if (score > bestScore) {
        best = skill;
        bestScore = score;
      }
    }
    if (!best || bestScore < 2) return "";
    let body = bodyCache.get(best.file);
    if (!body) {
      body = await fs.readFile(best.file, "utf8");
      bodyCache.set(best.file, body);
    }
    const trimmed = body.slice(0, MAX_CHARS);
    return `\n\n<bug_hunting_playbook title="${best.title.replace(/"/g, "&quot;")}">\n${trimmed}\n</bug_hunting_playbook>`;
  } catch {
    return "";
  }
}