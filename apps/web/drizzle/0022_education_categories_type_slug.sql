-- Relaxing only (db/MIGRATION_RULES.md): the new composite unique index is created
-- first, then the stricter global one is dropped, so uniqueness is never unguarded.
-- Every existing row already satisfies (type, slug) because it satisfied slug alone.
-- Lets an article category and a video category share a name (QA Test#1, Awan).
CREATE UNIQUE INDEX "education_categories_type_slug_key" ON "education_categories" USING btree ("type" text_ops,"slug" text_ops);--> statement-breakpoint
DROP INDEX "education_categories_slug_key";
