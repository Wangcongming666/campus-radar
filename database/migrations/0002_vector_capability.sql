-- Optional V2 capability. Not required or run by the MVP local bootstrap.
-- Execute only on a PostgreSQL distribution providing pgvector, after choosing
-- a provider that supports 1536 output dimensions. No embeddings are generated.
BEGIN;
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE jobs ADD COLUMN embedding vector(1536), ADD COLUMN embedding_model text, ADD COLUMN embedding_version text;
ALTER TABLE jobs ADD CONSTRAINT jobs_embedding_metadata CHECK (
  (embedding IS NULL AND embedding_model IS NULL AND embedding_version IS NULL)
  OR (embedding IS NOT NULL AND embedding_model IS NOT NULL AND embedding_version IS NOT NULL)
);
COMMIT;
