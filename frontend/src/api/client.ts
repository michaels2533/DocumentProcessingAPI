import type { DocumentDetail, DocumentSummary, SearchRequest } from "../types/document";

const BASE = "/api/documents";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function uploadDocument(file: File): Promise<DocumentDetail> {
  const form = new FormData();
  form.append("file", file);
  return request<DocumentDetail>(`${BASE}/upload`, {
    method: "POST",
    body: form,
  });
}

export async function listDocuments(): Promise<DocumentSummary[]> {
  return request<DocumentSummary[]>(BASE);
}

export async function getDocument(id: string): Promise<DocumentDetail> {
  return request<DocumentDetail>(`${BASE}/${id}`);
}

export async function searchDocuments(
  req: SearchRequest
): Promise<{ results: DocumentSummary[] }> {
  return request<{ results: DocumentSummary[] }>(`${BASE}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
}
