import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from './schema';

/**
 * The `Database` type only — deliberately no connection factory and no
 * `process.env`-bound singleton here (Putaran 17, Batch 1). A shared kernel
 * package cannot assume any one app's environment; each app keeps owning its
 * own `createDatabase(url)` + `db` singleton and passes the connection in via
 * dependency injection to everything in this package that needs one.
 */
export type Database = PostgresJsDatabase<typeof schema>;
