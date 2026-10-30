import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for Drizzle commands');
}

const parsedUrl = new URL(databaseUrl);
if (parsedUrl.port !== '5432') {
  throw new Error(
    'DATABASE_URL must target port 5432 (session mode). The transaction pooler on 6543 is forbidden.'
  );
}

export default defineConfig({
  dialect: 'postgresql',
  // Putaran 17: packages/core is the single source of truth for the schema
  // — point drizzle-kit straight at it rather than through the re-export
  // shim at src/lib/db/schema.ts. Moved here from apps/server in Batch 6
  // (decommissioning) — apps/web is now the only app holding a DB
  // connection, so it's the only one that needs drizzle-kit.
  schema: '../../packages/core/src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: databaseUrl,
  },
});
