-- RAG module: context packs, documents, chunks and retrieval audit log.
-- Strictly additive. No existing tables or constraints are touched.
--
-- Note: the `vector` extension must be installed by a superuser at database
-- initialization time. See `infra/docker/postgres/init/01-create-databases.sql`.

CREATE TABLE IF NOT EXISTS context_packs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    primary_language TEXT,
    embedding_provider TEXT NOT NULL,
    embedding_model TEXT NOT NULL,
    embedding_dimension INTEGER NOT NULL CHECK (embedding_dimension > 0),
    chunk_strategy_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rag_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    context_pack_id UUID NOT NULL REFERENCES context_packs(id) ON DELETE CASCADE,
    source_path TEXT NOT NULL,
    source_sha256 TEXT NOT NULL,
    title TEXT,
    mime_type TEXT NOT NULL,
    language TEXT,
    effective_date DATE,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    raw_text TEXT NOT NULL,
    raw_text_sha256 TEXT NOT NULL,
    char_count INTEGER NOT NULL CHECK (char_count >= 0),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'archived')),
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ,
    UNIQUE (context_pack_id, source_path, source_sha256)
);

CREATE INDEX IF NOT EXISTS idx_rag_documents_pack_status
    ON rag_documents(context_pack_id, status);

CREATE INDEX IF NOT EXISTS idx_rag_documents_pack_path
    ON rag_documents(context_pack_id, source_path);

CREATE TABLE IF NOT EXISTS rag_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
    context_pack_id UUID NOT NULL REFERENCES context_packs(id) ON DELETE CASCADE,
    chunk_seq INTEGER NOT NULL CHECK (chunk_seq >= 0),
    content TEXT NOT NULL,
    content_sha256 TEXT NOT NULL,
    section_path TEXT,
    char_start INTEGER,
    char_end INTEGER,
    token_count INTEGER,
    embedding vector(1024) NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'archived')),
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (document_id, chunk_seq)
);

CREATE INDEX IF NOT EXISTS idx_rag_chunks_pack_status
    ON rag_chunks(context_pack_id, status);

CREATE INDEX IF NOT EXISTS idx_rag_chunks_document
    ON rag_chunks(document_id);

CREATE INDEX IF NOT EXISTS idx_rag_chunks_embedding_hnsw
    ON rag_chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS rag_retrievals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester TEXT NOT NULL,
    requester_ref TEXT,
    query_text TEXT NOT NULL,
    query_text_sha256 TEXT NOT NULL,
    query_embedding vector(1024) NOT NULL,
    embedding_provider TEXT NOT NULL,
    embedding_model TEXT NOT NULL,
    requested_packs JSONB NOT NULL,
    top_k INTEGER NOT NULL CHECK (top_k > 0),
    filters_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    retrieved_chunks_json JSONB NOT NULL,
    latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rag_retrievals_created
    ON rag_retrievals(created_at DESC);

DROP TRIGGER IF EXISTS trg_context_packs_updated_at ON context_packs;
CREATE TRIGGER trg_context_packs_updated_at
BEFORE UPDATE ON context_packs
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
