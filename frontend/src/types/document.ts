export interface Entities {
  person_names: string[];
  dates: string[];
  dollar_amounts: string[];
  medical_conditions: string[];
  organizations: string[];
}

export interface DocumentSummary {
  id: string;
  filename: string;
  doc_type: string;
  entities: Entities;
  created_at: string;
  similarity?: number;
}

export interface DocumentDetail extends DocumentSummary {
  raw_text: string;
}

export interface SearchRequest {
  query: string;
  doc_type?: string;
  entity_filters?: Record<string, string>;
  top_k?: number;
}
