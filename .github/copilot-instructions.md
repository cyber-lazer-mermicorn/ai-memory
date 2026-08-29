# Copilot Instructions — AI Memory

## Always
- Write memory through `lib/memory/writer.ts`
- Use `MemoryQuery` type for all reads
- Check cosine similarity before writing (dedup at 0.95)
- Set `ttl` on episodic memories
- Strip PII before semantic memory writes

## Never
- Write directly to memory tables
- Store raw email, name, or location in semantic memory
- Skip deduplication check on writes
