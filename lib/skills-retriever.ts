/**
 * NeMo Retriever pattern — NVIDIA Embedding NIM + cosine similarity.
 *
 * Architecture:
 *  1. STATIC_SKILLS (compiled-in baseline) are embedded at first call and cached.
 *  2. A background async refresh fetches live SKILL.md files from GitHub on
 *     server startup. If successful, it replaces the in-memory skill store and
 *     invalidates the embedding cache so the next query re-embeds fresh data.
 *  3. retrieveRelevantSkills() embeds the user goal via NVIDIA's nv-embedqa-e5-v5
 *     model and returns the top-K semantically matched skills — these are injected
 *     into the Nemotron system prompt as grounding context.
 *
 * IMPORTANT — Next.js module lifecycle:
 *  Module-level state persists across requests in a long-running Node.js server
 *  (`next start` or `next dev`). This is the intended deployment model for this
 *  demo. Serverless/edge deployments would need a different caching strategy.
 */

import OpenAI from 'openai';
import { STATIC_SKILLS, SKILL_SOURCE_URLS } from '@/data/skills-catalog';
import type { Skill, ServiceSkills } from '@/types/ecosystem';

// ── NIM client (server-only) ──────────────────────────────────────────────────
const nim = new OpenAI({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  apiKey: process.env.NVIDIA_API_KEY ?? '',
});

// ── Module-level state ────────────────────────────────────────────────────────

/** Current live skill store — starts as static baseline, updated by background refresh */
let liveSkills: ServiceSkills[] = STATIC_SKILLS;

/** Embedding cache — null means embeddings need to be (re)computed */
let embeddingCache: Array<{ skill: Skill; serviceId: string; embedding: number[] }> | null = null;

// ── Embedding helpers ─────────────────────────────────────────────────────────

async function getEmbedding(text: string): Promise<number[]> {
  const res = await nim.embeddings.create({
    model: 'nvidia/nv-embedqa-e5-v5',
    input: text,
    encoding_format: 'float',
  });
  return res.data[0].embedding;
}

function cosineSim(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Embed the user goal and retrieve the top-K most semantically relevant skills
 * from the live skills store. Results are injected into the Nemotron prompt.
 *
 * Embeddings for the skill corpus are computed once and cached in memory.
 * Re-computed only when the background refresh replaces liveSkills.
 */
export async function retrieveRelevantSkills(goal: string, topK = 5): Promise<Skill[]> {
  // Build embedding cache if not yet computed (or invalidated by refresh)
  if (!embeddingCache) {
    const allSkills = liveSkills.flatMap(s =>
      s.skills.map(skill => ({ skill, serviceId: s.serviceId }))
    );
    const embeddings = await Promise.all(
      allSkills.map(async ({ skill, serviceId }) => ({
        skill,
        serviceId,
        embedding: await getEmbedding(`${skill.name}: ${skill.description}`),
      }))
    );
    embeddingCache = embeddings;
    console.log(`[skills-retriever] Embedded ${embeddings.length} skills into cache`);
  }

  const goalEmbedding = await getEmbedding(goal);

  return embeddingCache
    .map(entry => ({ ...entry, score: cosineSim(goalEmbedding, entry.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(entry => entry.skill);
}

/** Returns the number of cached skill embeddings (for diagnostics). */
export function getCacheSize(): number {
  return embeddingCache?.length ?? 0;
}

// ── Background GitHub refresh ─────────────────────────────────────────────────

/** Parse YAML frontmatter from a raw SKILL.md string */
function parseSkillMd(
  raw: string,
  repoUrl: string,
): Pick<Skill, 'name' | 'version' | 'description'> | null {
  const block = raw.match(/^---\n([\s\S]*?)\n---/)?.[1];
  if (!block) return null;
  const get = (key: string) =>
    block.match(new RegExp(`^${key}:\\s*"?([^"\\n]+)"?`, 'm'))?.[1]?.trim() ?? '';
  const name = get('name');
  const description = get('description');
  if (!name || !description) return null;
  return { name, version: get('version'), description };
}

/** Merge fresh skills into existing service entries, adding or replacing by skill name */
function mergeIntoStore(
  base: ServiceSkills[],
  fresh: Array<{ serviceId: string; skill: Skill }>,
): ServiceSkills[] {
  const result = base.map(s => ({ ...s, skills: [...s.skills] }));
  for (const { serviceId, skill } of fresh) {
    let entry = result.find(s => s.serviceId === serviceId);
    if (!entry) {
      entry = { serviceId, skills: [] };
      result.push(entry);
    }
    const idx = entry.skills.findIndex(s => s.name === skill.name);
    if (idx >= 0) {
      entry.skills[idx] = skill;
    } else {
      entry.skills.push(skill);
    }
  }
  return result;
}

async function backgroundRefresh(): Promise<void> {
  const headers: Record<string, string> = {};
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
  }

  const results = await Promise.allSettled(
    SKILL_SOURCE_URLS.map(async ({ serviceId, name, rawUrl }) => {
      const res = await fetch(rawUrl, { headers });
      if (!res.ok) throw new Error(`${res.status} ${rawUrl}`);
      const text = await res.text();
      const parsed = parseSkillMd(text, rawUrl);
      if (!parsed) throw new Error(`YAML parse failed: ${rawUrl}`);
      const skill: Skill = { ...parsed, repoUrl: rawUrl.replace('raw.githubusercontent.com', 'github.com').replace('/main/', '/blob/main/') };
      return { serviceId, name, skill };
    })
  );

  const fresh = results
    .filter((r): r is PromiseFulfilledResult<{ serviceId: string; name: string; skill: Skill }> =>
      r.status === 'fulfilled'
    )
    .map(r => r.value);

  const failed = results.filter(r => r.status === 'rejected').length;

  if (fresh.length > 0) {
    liveSkills = mergeIntoStore(liveSkills, fresh);
    embeddingCache = null; // invalidate — will recompute on next query
    console.log(
      `[skills-retriever] Refreshed ${fresh.length}/${SKILL_SOURCE_URLS.length} skills from GitHub` +
      (failed > 0 ? ` (${failed} failed — using static fallback for those)` : '')
    );
  } else {
    console.warn('[skills-retriever] GitHub refresh failed for all sources — using static baseline');
  }
}

// Fire-and-forget on module load. Never rejects, never blocks request handling.
backgroundRefresh().catch(() => {});
