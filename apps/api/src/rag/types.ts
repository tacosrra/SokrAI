export interface ChunkStrategy {
  type: 'markdown_first' | 'plain_text';
  target_tokens: number;
  overlap_tokens: number;
}

export interface PackManifest {
  name: string;
  description?: string;
  primary_language?: string;
  embedding: {
    provider: 'ollama';
    model: string;
    dimension: number;
  };
  chunking: ChunkStrategy;
  metadata?: Record<string, unknown>;
}

export interface ContextPackRecord {
  id: string;
  name: string;
  description: string | null;
  primary_language: string | null;
  embedding_provider: string;
  embedding_model: string;
  embedding_dimension: number;
  chunk_strategy_json: ChunkStrategy;
  metadata_json: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface RagDocumentRecord {
  id: string;
  context_pack_id: string;
  source_path: string;
  source_sha256: string;
  title: string | null;
  mime_type: string;
  language: string | null;
  effective_date: Date | null;
  metadata_json: Record<string, unknown>;
  raw_text: string;
  raw_text_sha256: string;
  char_count: number;
  status: 'active' | 'archived';
  ingested_at: Date;
  archived_at: Date | null;
}

export interface RagChunkRecord {
  id: string;
  document_id: string;
  context_pack_id: string;
  chunk_seq: number;
  content: string;
  content_sha256: string;
  section_path: string | null;
  char_start: number | null;
  char_end: number | null;
  token_count: number | null;
  status: 'active' | 'archived';
  metadata_json: Record<string, unknown>;
  created_at: Date;
}

export interface RetrievalFilters {
  language?: string;
  effectiveAfter?: Date;
}

export interface RetrievalRequest {
  query: string;
  packs: string[];
  topK?: number;
  filters?: RetrievalFilters;
  requester: 'cli_search' | 'api_search' | 'agent_run';
  requesterRef?: string;
}

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  sectionPath: string | null;
  content: string;
  score: number;
}

export interface RetrievalResult {
  retrievalId: string;
  chunks: RetrievedChunk[];
  latencyMs: number;
  embeddingModel: string;
  embeddingProvider: string;
}

export interface IngestionFileReport {
  sourcePath: string;
  status: 'added' | 'updated' | 'skipped' | 'failed';
  documentId?: string;
  chunksInserted?: number;
  charCount?: number;
  errorMessage?: string;
}

export interface IngestionReport {
  packName: string;
  embeddingModel: string;
  files: IngestionFileReport[];
  totalChunksInserted: number;
  startedAt: string;
  finishedAt: string;
}

export interface PackSummary {
  id: string;
  name: string;
  description: string | null;
  primary_language: string | null;
  embedding_provider: string;
  embedding_model: string;
  embedding_dimension: number;
  active_documents: number;
  archived_documents: number;
  active_chunks: number;
  updated_at: Date;
}
