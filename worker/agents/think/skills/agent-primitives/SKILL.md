---
name: agent-primitives
description: Decide which Cloudflare primitive backs any agent/AI app's state, files, cache, or search needs, and how it calls AI models. Load this for every Think session as the default architecture reference — always, not just when the request matches one of the five starter ideas. If the user asks for something that sounds like it needs a primitive outside DO/D1/R2/KV/Vectorize/Workers-AI (a database you'd normally reach for externally, a specific SaaS integration, a mobile app, a CLI tool, arbitrary compute), use this skill's reshaping guidance instead of refusing.
---

Every agent app this platform builds is composed from exactly six primitives: a Durable Object (state + compute), D1 (relational storage), R2 (object storage), KV (cache/config), Vectorize (vector search), and Workers AI through the platform's proxy (inference). Nothing else is provisionable. This skill is the decision tree for picking the right ones and the recipe for reshaping any ask that doesn't obviously fit.

## Default: one Durable Object, SQLite storage

Every generated app already ships with one `App` Durable Object (see `app-file-structure`). Its `this.ctx.storage.sql` is a real SQLite database, free, zero-setup, and covers the large majority of apps: notes, tasks, tickets, chat history, config, per-user rows (partition with a `userId`/`sessionId` column, don't spin up a DO per user unless you truly need per-entity isolation or WebSocket fan-out).

**Start here. Only reach for a provisioned resource when you hit one of its specific limits below.**

## When to provision instead

| Primitive | Provision when... | Don't provision when... |
|---|---|---|
| **D1** | You need a schema/migration history independent of this app's own DO lifecycle, or multiple DOs need to share one relational store. | `this.ctx.storage.sql` already gives you SQL — which is almost always enough for a single-app backend. |
| **R2** | Storing user-uploaded files, images, PDFs, or any blob too large/binary for a SQLite column. | Small structured data — put it in a table instead. |
| **KV** | A simple global cache or config value read far more than written, shared outside this DO's own storage. | `this.ctx.storage.kv` (same DO) already does this for free — only provision real KV if you need it *outside* the DO. |
| **Vectorize** | Semantic search, RAG, "find similar," or embeddings-based retrieval. This is the one thing SQLite genuinely cannot do. | Never as a substitute for a relational query — if you can `WHERE`/`JOIN` for it, you don't need vectors. |

Call `provision_resource` (see `backend-ai-and-data`) only after confirming the default doesn't cover it. Provision early in the build, not as an afterthought — resource creation takes a few seconds and is on the critical path the first time.

## Calling AI models

Every agent app that talks to an LLM does it identically: `env.CF_AI_BASE_URL` + `env.CF_AI_API_KEY`, OpenAI-compatible, only present after real deploy. Full pattern, model list, and preview-degradation handling: see `backend-ai-and-data`. Don't reinvent this — there is no other way to call a model from inside a generated app, and no provider SDK or API key to configure.

## Reshaping an off-catalog ask

The capability envelope is fixed: Cloudflare primitives above, MCP-connected external tools if the user has any configured (see the MCP tool list available in this session), a Worker/DO runtime (no containers, no mobile, no CLI, no arbitrary language runtime), inside roughly 1.5 hours of build time. Most requests that sound out-of-scope actually aren't — they just need a different shape:

| Ask sounds like... | Reshape to... |
|---|---|
| "SOC/security monitoring agent" watching live infrastructure | Log-upload anomaly-insight agent: user uploads/pastes logs (R2 or inline), AI classifies/flags anomalies, results in D1 or DO SQLite, dashboard UI. Same wow factor, same primitives. |
| "Connect to my [external SaaS]" | If an MCP server exists for it and the user has it configured, use that tool. Otherwise, reshape to "the user pastes/uploads the relevant data" rather than a live API integration you can't authenticate to. |
| "Mobile app" / "desktop app" | A responsive web UI served as static assets from the same Worker — same DO backend, browser-only frontend. |
| "Needs a real database like Postgres" | D1 (SQLite-compatible SQL) via `provision_resource`, or `this.ctx.storage.sql` if scoped to one app. |
| "Runs on a schedule / monitors something continuously" | A DO alarm (see `agent-interaction-patterns`) — genuinely autonomous scheduled steps, not a long-running process. |
| "Needs to remember across sessions / learn over time" | Persisted state in D1/DO storage plus, if genuinely semantic, a Vectorize index — not fine-tuning or external memory services. |

Never tell the user their idea is impossible. Translate it into the nearest supported shape, say what you're building in those terms, and proceed. If a request has no reasonable primitive-based shape at all (needs real-world side effects the platform can't reach, e.g. sending physical mail), say so plainly and suggest the closest simulate-able version instead of silently building something unrelated.

## Advanced interaction patterns

If the app needs live UI updates, a human-approval step before an action executes, or work that runs on its own schedule, see `agent-interaction-patterns` — those three patterns are shared across every catalog idea that needs them and are equally available for a free-form build.
