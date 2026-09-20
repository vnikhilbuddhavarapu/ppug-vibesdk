---
name: meeting-notes
description: Build a meeting-notes and action-item agent — paste or upload a transcript, AI extracts a summary and action items, persisted and browsable across sessions. Use when the user asks for a meeting-notes app, transcript summarizer, or action-item tracker. Easy-tier starter idea.
---

Read `agent-primitives` and `backend-ai-and-data` first — this skill only adds the idea-specific wiring on top of those.

## Architecture

- **Storage**: `this.ctx.storage.sql` (DO SQLite) is enough — one `meetings` table (id, title, transcript, summary, created_at) and one `action_items` table (id, meeting_id, text, owner, done). No D1 provisioning needed unless the user explicitly wants a schema independent of this app.
- **AI**: one call per meeting through `env.CF_AI_BASE_URL`/`chat/completions` — prompt the model to return summary + action items as structured JSON (`response_format` or a strict "return only JSON" system prompt), parse and insert rows individually so the UI can list/check off items independently.
- **UI**: a form to paste/upload a transcript, a list of past meetings, a detail view with summary + checkable action items.

## Scope fence (1.5 hours)

In scope: transcript input (paste, not live audio capture — no speech-to-text primitive exists on this platform), one AI extraction call, persisted list + detail view, checkable action items. Out of scope: calendar integration, live meeting recording/transcription, multi-user assignment notifications — if asked, reshape to "the user pastes the transcript from wherever they recorded it" and "action items show an owner field but don't send notifications."

## Completion checkpoints (flags earned)

- **Deployed to Cloudflare URL** — real deploy succeeds, `env.CF_AI_BASE_URL` present.
- **Persisted state across turns** — a meeting saved in one turn is visible in a later turn/session.
- **Tool call executed** — the AI extraction call actually returns and populates action items (not a hardcoded placeholder).
