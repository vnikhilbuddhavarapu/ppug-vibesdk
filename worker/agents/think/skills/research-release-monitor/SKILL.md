---
name: research-release-monitor
description: Build a research or release-monitor agent that autonomously checks a source on a schedule, uses AI to summarize or flag what changed, and asks for human sign-off before surfacing or acting on it. Use when the user asks for a monitoring agent, a "watch this and tell me when something changes" app, or a scheduled/autonomous research assistant. Hard-tier starter idea.
---

Read `agent-primitives`, `backend-ai-and-data`, and `agent-interaction-patterns` first — this idea specifically requires Pattern 3 (DO alarm) and Pattern 2 (HITL approval gate) from `agent-interaction-patterns`; Pattern 1 (WebSocket) is optional but recommended for showing live monitor status.

## Architecture

- **Storage**: D1 (or DO SQLite if scope stays single-app) for `sources` (id, description, last_checked_at, last_summary) and `findings` (id, source_id, content, status: `pending`/`approved`/`rejected`, created_at). D1 provisioning is worth it if the user wants monitors to persist independent of a single app rebuild; DO SQLite is fine otherwise.
- **Autonomous step**: `agent-interaction-patterns` Pattern 3 — an `alarm()` handler that runs on a timer (e.g. every 15-60 minutes, tune to the scope), does the actual "check" (since this platform has no live external-fetch-on-schedule to arbitrary sites without an MCP tool, simulate the check against user-provided/pasted content, or use a configured MCP tool if one exists for the target source), calls AI to summarize/flag what's notable, then proposes the finding via Pattern 2 rather than surfacing it directly.
- **HITL sign-off**: findings sit as `pending` until a human approves — this is the "asks for human sign-off" requirement, not optional. Approving marks it `approved` and makes it visible in the main findings feed; rejecting discards it.
- **UI**: a list of monitored sources with last-checked time, a findings feed split into pending (needs sign-off) and approved, optionally live-updated via Pattern 1.

## Scope fence (1.5 hours)

In scope: one or a few monitored "sources" (user-defined, checked against pasted/uploaded content or a configured MCP tool — not arbitrary live web scraping), a working alarm loop, AI summarization, one approval gate. Out of scope: crawling arbitrary external URLs without an MCP tool for it, multi-source correlation, notification delivery (email/Slack) beyond in-app display.

## Completion checkpoints (flags earned)

- **Deployed to Cloudflare URL** — real deploy succeeds, the alarm actually fires post-deploy (verify by checking `last_checked_at` advances on its own).
- **Scheduled/autonomous step (DO alarm)** — the check genuinely runs on `alarm()`, not only in response to a user request.
- **Human-in-the-loop checkpoint present** — no finding reaches the approved feed without an explicit approval action.
- **Persisted state** — sources and findings survive across sessions.
