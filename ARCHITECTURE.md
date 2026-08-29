# Architecture

## Memory types

| Type | Table | TTL | Use |
|---|---|---|---|
| Episodic | `episodic_memories` | Yes | Events, interactions |
| Semantic | `semantic_memories` | No | Facts, preferences |
| Working | In-session only | Session | Current context |

## Write pipeline
Input → PII strip → embed → dedup check (cosine > 0.95) → write with TTL.

## Read pipeline
Query → embed → pgvector similarity search → rerank by recency + relevance → inject into prompt.
