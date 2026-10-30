/**
 * Re-export shim (Putaran 17, Batch 1). Replaces the verbatim copy made in
 * Batch 0 — the actual Drizzle table definitions now live in
 * `packages/core/src/db/schema.ts`, the single source of truth shared with
 * `apps/server`. `import * as schema from './schema'` in `lib/db/index.ts`
 * still gathers the full table bag via this re-export.
 */
export * from '@amwal/core/db/schema';
