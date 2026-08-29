# AI Memory — Agent Doctrine

## What this repo is
Production-grade AI memory layer: episodic memory, semantic memory, working memory, and memory-augmented generation.
By Cherry Shanaley (Chan), AI Solutions Engineer.

## Tech stack
- TypeScript strict, Next.js 15, Supabase pgvector, OpenAI embeddings

## Coding rules
- Memory types: `episodic` (events), `semantic` (facts), `working` (current session) — stored separately
- All memory writes go through `lib/memory/writer.ts` — never write to memory tables directly
- Memory reads use typed `MemoryQuery` interface from `lib/memory/types.ts`
- Deduplication: cosine similarity threshold `> 0.95` before write — enforced in writer
- Memory expiry: episodic memories have a `ttl` field — expired memories are soft-deleted
- Never store raw PII in semantic memory — strip before write

## Commands
```bash
npm install && npm run dev
npm run test
```
