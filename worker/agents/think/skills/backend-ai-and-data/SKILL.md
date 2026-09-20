---
name: backend-ai-and-data
description: Call AI models at runtime from a generated app, and provision extra Cloudflare resources (D1, R2, KV, Vectorize) beyond the App DO's own storage. Use this skill whenever the user's request implies AI/LLM features (chat, summarization, drafting, classification, embeddings/semantic search) or needs storage beyond a single Durable Object's SQLite (a separate relational schema, object/file storage, a KV cache, or vector search).
---

This skill covers two runtime capabilities that only exist in the **real Cloudflare deployment** (the "Deploy"/"Publish" action the user triggers), not in the `deploy_space` preview iframe. Both are inert during preview — write your code so it degrades gracefully there (see "Preview vs. deploy" below).

## Calling AI models at runtime

If a deployed app needs to call an LLM (chat, drafting, summarization, classification), your `App` class can reach the platform's AI Gateway proxy through two env vars injected only at real-deploy time:

- `env.CF_AI_BASE_URL` — an OpenAI-compatible base URL, e.g. `https://<domain>/api/proxy/openai`.
- `env.CF_AI_API_KEY` — a bearer token scoped to this app.

Supported paths (append to the base URL): `/chat/completions`, `/completions`, `/embeddings`, `/responses`, `/models`.

```ts
export class App extends DurableObject {
	async fetch(request: Request): Promise<Response> {
		// ...
		if (url.pathname === '/api/draft-reply' && request.method === 'POST') {
			if (!this.env.CF_AI_BASE_URL) {
				return Response.json(
					{
						error: 'AI is only available once this app is deployed, not in preview.',
					},
					{ status: 503 },
				);
			}
			const { ticketBody } = await request.json<{ ticketBody: string }>();
			const aiRes = await fetch(
				`${this.env.CF_AI_BASE_URL}/chat/completions`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${this.env.CF_AI_API_KEY}`,
					},
					body: JSON.stringify({
						model: 'workers-ai/@cf/zai-org/glm-5.3-flash',
						messages: [
							{
								role: 'system',
								content: 'Draft a short, polite support reply.',
							},
							{ role: 'user', content: ticketBody },
						],
					}),
				},
			);
			const data = await aiRes.json();
			return Response.json({ draft: data.choices[0].message.content });
		}
	}
}
```

**Chat/completion model IDs you may call** (any other `model` value is rejected with a 400):

```
workers-ai/@cf/deepseek-ai/deepseek-v4-pro-0813
workers-ai/@cf/deepseek-ai/deepseek-v4-flash-0731
workers-ai/@cf/moonshotai/kimi-k2.6
workers-ai/@cf/moonshotai/kimi-k2.7-code
workers-ai/@cf/zai-org/glm-5.2
workers-ai/@cf/zai-org/glm-5.3
workers-ai/@cf/zai-org/glm-5.3-flash
```

Prefer a `-flash`/smaller model for latency-sensitive UI-triggered calls (drafting, classification) and a larger model only for tasks that need it (long-context summarization, complex reasoning). Requests are rate-limited per user and capped at 16384 output tokens — don't request more.

**Embeddings model** (for RAG chunk/query embedding, call `/embeddings` on the same base URL): `workers-ai/@cf/baai/bge-base-en-v1.5`, outputs 768-dimension vectors — matches the default dimension `provision_resource` uses when creating a Vectorize index, so you don't need to pass a custom `dimensions` value.

```ts
const embedRes = await fetch(`${this.env.CF_AI_BASE_URL}/embeddings`, {
	method: 'POST',
	headers: {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${this.env.CF_AI_API_KEY}`,
	},
	body: JSON.stringify({
		model: 'workers-ai/@cf/baai/bge-base-en-v1.5',
		input: chunkText,
	}),
});
const { data } = await embedRes.json();
const vector = data[0].embedding; // number[768]
await this.env.MY_INDEX.upsert([
	{ id: chunkId, values: vector, metadata: { documentId } },
]);
```

Do not add `d1_databases`/`kv_namespaces` bindings, an `AI` binding, or any provider SDK/API key to call this — there is nothing to configure. `env.CF_AI_BASE_URL`/`env.CF_AI_API_KEY` simply won't exist until the app is deployed.

## Provisioning extra storage (D1 / R2 / KV / Vectorize)

Default to `this.ctx.storage` (see `app-file-structure`) for everything — it's zero-setup and covers most apps, including per-entity partitioning with a column. Reach for a provisioned resource only when you genuinely need:

- **D1** — a separate relational database with its own migration history, independent of the App DO's lifecycle (rare; usually `this.ctx.storage.sql` is enough).
- **R2** — object storage for user-uploaded files, images, or any blob too large/binary for SQLite.
- **KV** — a simple global cache/config store outside the App DO (rare; `this.ctx.storage.kv` usually suffices).
- **Vectorize** — vector search / embeddings for semantic search, RAG, or "find similar" features. This is the one case `this.ctx.storage` cannot do at all.

Call the `provision_resource` tool (not a `wrangler.json` edit — those blocks are ignored, see `app-file-structure`) to create the resource. It returns a binding name; use `list_provisioned_resources` to see what's already provisioned for this app before creating more (there's a 5-per-type cap per user). Provisioned resources are bound into your worker automatically on every deploy — you don't declare them anywhere in code except reading `env.<BINDING_NAME>` in your `App` class, exactly like any other Workers binding (`env.MY_BUCKET.put(...)`, `env.MY_DB.prepare(...)`, `env.MY_INDEX.query(...)`).

For D1, schema changes go through `run_d1_migration`, not raw `ALTER`/`DROP` — only additive statements (`CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE ... ADD COLUMN`) are allowed.

## Preview vs. deploy

`deploy_space` (the tool you call after writing files) only rebuilds the `/space/:name/preview/:branch/` iframe — it never has `CF_AI_BASE_URL`/`CF_AI_API_KEY` or any provisioned-resource bindings, because those only exist on the real Cloudflare Worker created when the user clicks Deploy/Publish. Always feature-detect (`if (!env.CF_AI_BASE_URL)` / check the binding exists) and return a clear message rather than throwing, so the preview doesn't look broken while you're iterating. Tell the user these features will work once they deploy.
