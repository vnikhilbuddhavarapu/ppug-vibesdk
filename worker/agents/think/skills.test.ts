import { describe, expect, it } from 'vitest';

import APP_FILE_STRUCTURE from './skills/app-file-structure/SKILL.md?raw';
import BACKEND_AI_AND_DATA from './skills/backend-ai-and-data/SKILL.md?raw';
import AGENT_PRIMITIVES from './skills/agent-primitives/SKILL.md?raw';
import AGENT_INTERACTION_PATTERNS from './skills/agent-interaction-patterns/SKILL.md?raw';
import MEETING_NOTES from './skills/meeting-notes/SKILL.md?raw';
import KNOWLEDGE_BASE_RAG from './skills/knowledge-base-rag/SKILL.md?raw';
import SUPPORT_TRIAGE_HITL from './skills/support-triage-hitl/SKILL.md?raw';
import DOC_RAG_CITATIONS from './skills/doc-rag-citations/SKILL.md?raw';
import RESEARCH_RELEASE_MONITOR from './skills/research-release-monitor/SKILL.md?raw';
import FRONTEND_DESIGN from './skills/frontend-design/SKILL.md?raw';
import FRONTEND_DESIGN_LANDING_PAGE from './skills/frontend-design-landing-page/SKILL.md?raw';
import FRONTEND_DESIGN_SAAS from './skills/frontend-design-saas/SKILL.md?raw';

const RAW_SKILLS: Record<string, string> = {
	'app-file-structure': APP_FILE_STRUCTURE,
	'backend-ai-and-data': BACKEND_AI_AND_DATA,
	'agent-primitives': AGENT_PRIMITIVES,
	'agent-interaction-patterns': AGENT_INTERACTION_PATTERNS,
	'meeting-notes': MEETING_NOTES,
	'knowledge-base-rag': KNOWLEDGE_BASE_RAG,
	'support-triage-hitl': SUPPORT_TRIAGE_HITL,
	'doc-rag-citations': DOC_RAG_CITATIONS,
	'research-release-monitor': RESEARCH_RELEASE_MONITOR,
	'frontend-design': FRONTEND_DESIGN,
	'frontend-design-landing-page': FRONTEND_DESIGN_LANDING_PAGE,
	'frontend-design-saas': FRONTEND_DESIGN_SAAS,
};

// The 5 finalized starter-catalog skills, one per idea (Phase 4 scope).
const CATALOG_SKILLS = [
	'meeting-notes',
	'knowledge-base-rag',
	'support-triage-hitl',
	'doc-rag-citations',
	'research-release-monitor',
];

// Generic, catalog-independent skills that back free-form/off-catalog builds.
const GENERIC_AGENT_SKILLS = ['agent-primitives', 'agent-interaction-patterns'];

/**
 * Minimal frontmatter extractor for these tests. Deliberately does not import
 * the real `agents/skills` package: its `parseSkillMarkdown`/`fromManifest`
 * pull in `just-bash`, which drags in a browser-only `turndown` build that
 * `vitest-pool-workers` (workerd) cannot resolve — a known Workers-testing
 * module-resolution limitation, not a bug in this skill content. Production
 * code (`skills.ts`, `ThinkAgent.getSkills()`) still uses the real package;
 * this only re-derives the two frontmatter fields these tests assert on.
 */
function extractFrontmatter(raw: string): {
	name?: string;
	description?: string;
	body: string;
} {
	const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	if (!match) return { body: raw };
	const [, frontmatter, body] = match;
	const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim();
	const description = frontmatter
		.match(/^description:\s*(.+)$/m)?.[1]
		?.trim();
	return { name, description, body };
}

describe('Think skill catalog', () => {
	it('parses every registered SKILL.md into valid frontmatter + body', () => {
		for (const [dir, raw] of Object.entries(RAW_SKILLS)) {
			const parsed = extractFrontmatter(raw);
			expect(parsed.name, `${dir}/SKILL.md missing name`).toBeTruthy();
			expect(
				parsed.description,
				`${dir}/SKILL.md missing description`,
			).toBeTruthy();
			expect(
				parsed.body.trim().length,
				`${dir}/SKILL.md has an empty body`,
			).toBeGreaterThan(0);
		}
	});

	it('names every Phase 4 skill after its own directory (name === dir slug)', () => {
		// Pre-existing skills (e.g. app-file-structure's frontmatter name is
		// `cloudflare-bundler-apps`) predate this convention and are left as-is.
		for (const dir of [...CATALOG_SKILLS, ...GENERIC_AGENT_SKILLS]) {
			const parsed = extractFrontmatter(RAW_SKILLS[dir]);
			expect(parsed.name).toBe(dir);
		}
	});

	it('registers all 5 finalized catalog-idea skills', () => {
		for (const dir of CATALOG_SKILLS) {
			expect(
				RAW_SKILLS[dir],
				`missing catalog skill: ${dir}`,
			).toBeTruthy();
		}
	});

	it('registers both generic, catalog-independent agent skills', () => {
		for (const dir of GENERIC_AGENT_SKILLS) {
			expect(
				RAW_SKILLS[dir],
				`missing generic agent skill: ${dir}`,
			).toBeTruthy();
		}
	});

	it('every catalog-idea skill cross-references at least one generic agent skill', () => {
		for (const dir of CATALOG_SKILLS) {
			const raw = RAW_SKILLS[dir];
			const referencesGeneric = GENERIC_AGENT_SKILLS.some((generic) =>
				raw.includes(`\`${generic}\``),
			);
			expect(
				referencesGeneric,
				`${dir}/SKILL.md should reference agent-primitives and/or agent-interaction-patterns instead of duplicating their content`,
			).toBe(true);
		}
	});

	it('every skill directory on disk has a non-trivial, distinct description (real trigger text, not a placeholder)', () => {
		const descriptions = new Set<string>();
		for (const [dir, raw] of Object.entries(RAW_SKILLS)) {
			const { description } = extractFrontmatter(raw);
			expect(
				description && description.length > 20,
				`${dir}/SKILL.md description is missing or too short to be a real trigger`,
			).toBe(true);
			expect(
				description && !descriptions.has(description),
				`${dir}/SKILL.md description duplicates another skill's — auto-load triggers must be distinct`,
			).toBe(true);
			if (description) descriptions.add(description);
		}
	});
});

/**
 * `skills.ts` itself (`RAW_SKILLS`, and therefore `createThinkSkillSource()`)
 * is exercised indirectly by `bun run build` (which resolves every `?raw`
 * import) and by production use in `ThinkAgent.getSkills()` — not re-tested
 * here directly, since doing so requires importing `agents/skills`, which
 * fails in this Workers test environment for the reason documented above.
 */
