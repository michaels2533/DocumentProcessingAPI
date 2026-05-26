import {
  TERMINAL_STATUSES,
  type DocumentDetail,
  type DocumentJob,
  type DocumentSummary,
  type SearchRequest,
} from "../types/document";

const BASE = "/api/documents";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

// Returns a `DocumentJob` (HTTP 202) -- the pipeline runs in the worker.
// Use `pollDocument(job.id)` to wait for completion.
export async function uploadDocument(file: File): Promise<DocumentJob> {
  const form = new FormData();
  form.append("file", file);
  return request<DocumentJob>(`${BASE}/upload`, {
    method: "POST",
    body: form,
  });
}

export async function listDocuments(): Promise<DocumentSummary[]> {
  return request<DocumentSummary[]>(`${BASE}/`);
}

export async function getDocument(id: string): Promise<DocumentDetail> {
  return request<DocumentDetail>(`${BASE}/${id}`);
}

export async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Delete failed: ${res.status}`);
  }
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

export interface PollOptions {
  // Time between polls in ms. Defaults to 1500.
  intervalMs?: number;
  // Hard upper bound in ms to avoid polling forever on a stuck job.
  // Defaults to 5 minutes -- comfortably above WORKER_JOB_TIMEOUT * WORKER_MAX_TRIES.
  timeoutMs?: number;
  // Aborts polling cooperatively (e.g. when the user navigates away).
  signal?: AbortSignal;
  // Optional callback fired on every successful fetch so the UI can show
  // intermediate states (pending -> processing).
  onUpdate?: (doc: DocumentDetail) => void;
}

/**
 * Polls `GET /documents/{id}` until the document reaches a terminal state
 * (`ready` or `failed`), the timeout elapses, or the abort signal fires.
 * Network errors are swallowed and retried on the next tick so a transient
 * blip doesn't abort the whole poll.
 */
export async function pollDocument(
  id: string,
  opts: PollOptions = {}
): Promise<DocumentDetail> {
  const intervalMs = opts.intervalMs ?? 1500;
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
  const deadline = Date.now() + timeoutMs;

  // Helper that sleeps and resolves early on abort.
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const t = window.setTimeout(resolve, ms);
      opts.signal?.addEventListener(
        "abort",
        () => {
          window.clearTimeout(t);
          resolve();
        },
        { once: true }
      );
    });

  while (true) {
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");

    try {
      const doc = await getDocument(id);
      opts.onUpdate?.(doc);
      if (TERMINAL_STATUSES.has(doc.status)) return doc;
    } catch (err) {
      // Last-attempt failure: only surface once the deadline is reached.
      if (Date.now() >= deadline) throw err;
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out waiting for document ${id} to finish processing.`
      );
    }
    await sleep(intervalMs);
  }
}
