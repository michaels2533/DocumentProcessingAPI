import { useEffect, useState } from "react";
import { pollDocument } from "../api/client";
import {
  TERMINAL_STATUSES,
  type DocumentDetail,
  type DocumentStatus,
} from "../types/document";

export interface DocumentStatusState {
  // The most recent snapshot returned by the API (or null until the first
  // successful poll).
  doc: DocumentDetail | null;
  // The current lifecycle state. Stays `pending` until the first poll
  // resolves, then tracks the server.
  status: DocumentStatus;
  // True while still polling (i.e. status is not yet terminal and no error).
  isPolling: boolean;
  // Set if polling itself failed (timeout, network giving up, etc.).
  // A `failed` *document* surfaces via `doc.error`, not here.
  pollError: string | null;
}

/**
 * Polls `GET /documents/{id}` until the document reaches a terminal state
 * (`ready` or `failed`). Pass `null` to disable polling.
 *
 * Cleanly aborts on unmount or when the id changes, so it's safe to use
 * inside StrictMode and across re-renders.
 */
export function useDocumentStatus(
  id: string | null,
  intervalMs = 1500
): DocumentStatusState {
  const [state, setState] = useState<DocumentStatusState>({
    doc: null,
    status: "pending",
    isPolling: id !== null,
    pollError: null,
  });

  useEffect(() => {
    if (!id) {
      setState({ doc: null, status: "pending", isPolling: false, pollError: null });
      return;
    }

    setState({ doc: null, status: "pending", isPolling: true, pollError: null });

    const controller = new AbortController();

    pollDocument(id, {
      intervalMs,
      signal: controller.signal,
      onUpdate: (doc) => {
        if (controller.signal.aborted) return;
        setState({
          doc,
          status: doc.status,
          isPolling: !TERMINAL_STATUSES.has(doc.status),
          pollError: null,
        });
      },
    }).catch((err: unknown) => {
      if (controller.signal.aborted) return;
      setState((prev) => ({
        ...prev,
        isPolling: false,
        pollError:
          err instanceof Error ? err.message : "Failed to poll document status.",
      }));
    });

    return () => controller.abort();
  }, [id, intervalMs]);

  return state;
}
