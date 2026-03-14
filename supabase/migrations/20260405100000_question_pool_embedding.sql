ALTER TABLE question_pool ADD COLUMN IF NOT EXISTS embedding vector(768);

CREATE INDEX IF NOT EXISTS idx_question_pool_embedding
  ON question_pool USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;

CREATE OR REPLACE FUNCTION find_near_duplicate_in_pool(
  query_embedding vector(768),
  p_category text,
  p_threshold float DEFAULT 0.12
)
RETURNS TABLE(id uuid, similarity float)
LANGUAGE sql STABLE
AS $$
  SELECT id, 1 - (embedding <=> query_embedding) AS similarity
  FROM question_pool
  WHERE category = p_category
    AND embedding IS NOT NULL
    AND (embedding <=> query_embedding) < p_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT 1;
$$;
