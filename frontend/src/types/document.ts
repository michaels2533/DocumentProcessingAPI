export interface Entities {
  person_names: string[];
  dates: string[];
  dollar_amounts: string[];
  medical_conditions: string[];
  organizations: string[];
}

// Lifecycle states surfaced by the backend's `documents.status` column.
// Mirrors `DOCUMENT_STATUS_*` constants in `backend/app/models/document.py`.
export type DocumentStatus = "pending" | "processing" | "ready" | "failed";

export const TERMINAL_STATUSES: ReadonlySet<DocumentStatus> = new Set([
  "ready",
  "failed",
]);

export interface DocumentSummary {
  id: string;
  filename: string;
  status: DocumentStatus;
  // Pipeline outputs are absent while the document is pending/processing
  // and may be absent on a failed document.
  doc_type: string | null;
  entities: Entities | null;
  created_at: string;
  similarity?: number;
  fts_rank?: number;
}

export interface DocumentDetail extends DocumentSummary {
  raw_text: string | null;
  error: string | null;
  processed_at: string | null;
}

// Response shape of `POST /api/documents/upload` (HTTP 202).
// The pipeline runs out-of-band; clients poll `getDocument(id)` from here.
export interface DocumentJob {
  id: string;
  status: DocumentStatus;
  filename: string;
  created_at: string;
}

export interface SearchRequest {
  query: string;
  keyword?: string;
  semantic_weight?: number;
  doc_type?: string;
  entity_filters?: Record<string, string>;
  top_k?: number;
}
