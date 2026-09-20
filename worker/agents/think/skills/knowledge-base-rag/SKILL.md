---
name: knowledge-base-rag
description: Build a personal knowledge-base Q&A agent — upload documents/notes, ask questions, get answers grounded in retrieved content via embeddings and semantic search. Use when the user asks for a knowledge base, personal wiki Q&A, or "chat with my notes/docs" app. Easy-tier starter idea.
---

Read `agent-primitives` and `backend-ai-and-data` first — this skill only adds the idea-specific wiring on top of those.

## Architecture

- **Storage**: R2 for the raw uploaded documents/notes (provision via `provision_resource`, binding e.g. `DOCS_BUCKET`). A DO SQLite table for document metadata (id, filename, r2_key, uploaded_at) is enough — D1 not needed at this scope.
- **Search**: Vectorize (provision via `provision_resource`, binding e.g. `KB_INDEX`) for semantic retrieval. Generate embeddings with `workers-ai/@cf/baai/bge-base-en-v1.5` through the AI proxy's `/embeddings` path (see `backend-ai-and-data`) when a document is uploaded (chunk long documents — a few hundred words per chunk — before embedding each chunk separately) and again for each incoming question.
- **Q&A flow**: embed the question, `env.KB_INDEX.query(vector, { topK: 5 })` for the closest chunks, then one `chat/completions` call with the retrieved chunks as context and an instruction to answer only from them.
- **UI**: upload control, a document list, a chat-style Q&A box.

## Scope fence (1.5 hours)

In scope: text-based documents (paste or plain-text upload — no PDF/image parsing pipeline), chunk + embed on upload, single-turn Q&A grounded in retrieved chunks. Out of scope: multi-format document parsing, citation back-links to exact source spans (see `doc-rag-citations` for that harder variant), multi-user shared knowledge bases.

## Completion checkpoints (flags earned)

- **Deployed to Cloudflare URL** — real deploy succeeds with the Vectorize index bound.
- **RAG retrieval** — an answer visibly changes based on what's been uploaded, not a generic model response.
- **Tool call executed** — both the embedding call and the answer-generation call complete through the AI proxy.
