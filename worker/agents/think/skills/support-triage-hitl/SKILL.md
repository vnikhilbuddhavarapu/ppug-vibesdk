---
name: support-triage-hitl
description: Build a support-ticket triage agent — AI drafts a suggested reply or categorization for each incoming ticket, a human reviews and approves before it's considered sent, with live UI updates as tickets arrive or get resolved. Use when the user asks for a support triage app, ticket assistant, or "AI drafts, human approves" workflow. Medium-tier starter idea.
---

Read `agent-primitives`, `backend-ai-and-data`, and `agent-interaction-patterns` first — this skill only adds the idea-specific wiring on top of those. This idea specifically requires Pattern 1 (WebSocket) and Pattern 2 (HITL approval gate) from `agent-interaction-patterns` — build both, not just the AI-drafting part.

## Architecture

- **Storage**: `this.ctx.storage.sql` (DO SQLite). A `tickets` table (id, subject, body, status: `open`/`resolved`) and the `pending_actions` table from `agent-interaction-patterns` Pattern 2, where each pending action's payload is `{ ticketId, draftReply }`.
- **AI drafting**: when a ticket is created (manually entered for this scope — no real inbound-email integration), call `chat/completions` to draft a suggested reply, then `proposeAction("send_reply", { ticketId, draftReply })` — never send/finalize automatically.
- **HITL gate**: the UI shows each ticket's AI-drafted reply with Approve/Reject. Approving marks the ticket `resolved` and the draft as the "sent" reply (no real email delivery required — persisting it as sent is enough for this scope). Rejecting lets the human edit and resubmit, or discard.
- **Live updates**: use `agent-interaction-patterns` Pattern 1 so a new ticket or a resolved status appears without a page refresh — this is the WebSocket flag.

## Scope fence (1.5 hours)

In scope: manual ticket entry (or a "generate sample tickets" seed action), one AI draft per ticket, one approval gate, WebSocket-pushed ticket-list updates. Out of scope: real email/helpdesk integration (unless the user has a matching MCP server configured), multi-agent routing, SLA timers.

## Completion checkpoints (flags earned)

- **Deployed to Cloudflare URL** — real deploy succeeds, AI drafting works post-deploy.
- **Persisted state** — tickets and their resolution status survive across sessions.
- **WebSocket live update visible** — a second browser tab/window sees a new or resolved ticket without refreshing.
- **Human-in-the-loop checkpoint present** — no drafted reply is marked sent without an explicit Approve action.
