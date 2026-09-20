---
name: doc-rag-citations
description: Build a document RAG agent that answers questions with citations back to the specific uploaded document and chunk an answer came from, via a multi-step retrieve-then-cite pipeline. Use when the user asks for document Q&A with sources/citations, a "chat with your PDFs but show me where it got that" app, or a research-doc assistant. Hard-tier starter idea.
---

Read `agent-primitives`, `backend-ai-and-data`, and `knowledge-base-rag` first — this is the harder variant of the same RAG shape, adding structured citation metadata and a multi-step pipeline.

## Architecture

- **Storage**: R2 for raw documents (`provision_resource`, e.g. `DOCS_BUCKET`). D1 (not DO SQLite — provision it explicitly) for document + chunk metadata: a `documents` table (id, filename, r2_key) and a `chunks` table (id, document_id, chunk_index, text, char_start, char_end) so a citation can point to an exact chunk and its position within the source document. D1 earns its keep here specifically because chunk metadata benefits from real foreign-key joins across documents.
- **Search**: Vectorize (`provision_resource`, e.g. `DOCS_INDEX`), one vector per chunk, metadata payload includes `documentId` + `chunkId` so a query result maps straight back to the D1 row.
- **Multi-step pipeline** (this is the "multi-step pipeline" flag — implement as distinct, sequential steps, not one monolithic call):
    1. Ingest: chunk the uploaded document, embed each chunk with `workers-ai/@cf/baai/bge-base-en-v1.5` (see `backend-ai-and-data`), insert into D1 + Vectorize.
    2. Retrieve: embed the question with the same model, query Vectorize for top chunks.
    3. Generate: call `chat/completions` with retrieved chunks as context, instructing the model to cite which chunk(s) it used (e.g. by index) in a structured field of its response.
    4. Resolve citations: map the model's cited chunk indices back to the D1 rows (filename, char range) and render them alongside the answer.
- **UI**: upload, document list, Q&A box, answer rendered with clickable citation markers that reveal source filename + excerpt.

## Scope fence (1.5 hours)

In scope: text-based documents, the 4-step pipeline above, citations resolved to filename + excerpt (not exact pixel/page highlighting). Out of scope: PDF layout-aware parsing, multi-document cross-referencing beyond simple top-K retrieval, citation accuracy guarantees beyond what the model reports.

## Completion checkpoints (flags earned)

- **Deployed to Cloudflare URL** — real deploy succeeds with D1 + Vectorize bound.
- **RAG retrieval with citation** — an answer visibly names the source document/chunk it came from, and that citation is real (traceable to an actual retrieved chunk), not fabricated.
- **Multi-step pipeline** — ingest/retrieve/generate/resolve are implemented as distinguishable steps (visible in code structure or, better, surfaced in the UI/logs), not collapsed into one opaque call.
- **Persisted state** — documents and their chunks survive across sessions.
