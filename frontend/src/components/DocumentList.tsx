import { useState } from "react";
import { getDocument } from "../api/client";
import type { DocumentDetail, DocumentSummary } from "../types/document";
import "./DocumentList.css";

interface Props {
  docs: DocumentSummary[];
  loading: boolean;
  error: string | null;
  onSelect: (doc: DocumentDetail) => void;
}

const STATUS_LABEL: Record<DocumentSummary["status"], string> = {
  pending: "Queued",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};

export default function DocumentList({
  docs,
  loading,
  error,
  onSelect,
}: Props) {
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const open = async (id: string) => {
    setOpeningId(id);
    setLocalError(null);
    try {
      const full = await getDocument(id);
      onSelect(full);
    } catch (e: unknown) {
      setLocalError(
        e instanceof Error ? e.message : "Failed to load document."
      );
    } finally {
      setOpeningId(null);
    }
  };

  if (loading)
    return <p className="status-message">Loading documents…</p>;
  if (error) return <p className="status-message error">{error}</p>;
  if (docs.length === 0)
    return (
      <p className="status-message">
        No documents in this view yet.
      </p>
    );

  return (
    <div className="doc-table">
      <div className="doc-row doc-row-head" role="row">
        <span />
        <span>Document</span>
        <span>Type</span>
        <span>Status</span>
        <span>Highlights</span>
        <span>Added</span>
      </div>

      {docs.map((doc) => {
        const isReady = doc.status === "ready";
        const tabKey = doc.doc_type ?? "other";
        const highlights = entityPreview(doc);
        return (
          <button
            key={doc.id}
            className={`doc-row doc-row-item ${
              openingId === doc.id ? "opening" : ""
            }`}
            onClick={() => open(doc.id)}
          >
            <span
              className={`doc-stripe stripe-${tabKey}`}
              aria-hidden
            />
            <span className="doc-name">
              <span className="doc-filename">{doc.filename}</span>
            </span>
            <span className="doc-cell">
              {doc.doc_type ? (
                <span className={`doc-type-badge ${doc.doc_type}`}>
                  {doc.doc_type.replace("_", " ")}
                </span>
              ) : (
                <span className="cell-muted">—</span>
              )}
            </span>
            <span className="doc-cell">
              <span className={`status-pill status-${doc.status}`}>
                {STATUS_LABEL[doc.status]}
              </span>
            </span>
            <span className="doc-cell doc-highlights">
              {isReady ? (
                highlights || <span className="cell-muted">No entities</span>
              ) : (
                <span className="cell-muted">
                  {doc.status === "failed"
                    ? "Pipeline error"
                    : "Awaiting processing"}
                </span>
              )}
            </span>
            <span className="doc-cell doc-date tnum">
              {formatDate(doc.created_at)}
            </span>
          </button>
        );
      })}

      {localError && <p className="status-message error">{localError}</p>}
    </div>
  );
}

function entityPreview(doc: DocumentSummary): string | null {
  const e = doc.entities;
  if (!e) return null;
  const parts: string[] = [];
  if (e.person_names?.length) parts.push(e.person_names[0]);
  if (e.dollar_amounts?.length) parts.push(e.dollar_amounts[0]);
  if (e.organizations?.length) parts.push(e.organizations[0]);
  if (e.medical_conditions?.length) parts.push(e.medical_conditions[0]);
  if (parts.length === 0) return null;
  const extra =
    countEntities(e) - parts.length > 0
      ? ` +${countEntities(e) - parts.length}`
      : "";
  return parts.slice(0, 3).join(" · ") + extra;
}

function countEntities(e: DocumentSummary["entities"]): number {
  if (!e) return 0;
  return (
    (e.person_names?.length ?? 0) +
    (e.dollar_amounts?.length ?? 0) +
    (e.organizations?.length ?? 0) +
    (e.medical_conditions?.length ?? 0) +
    (e.dates?.length ?? 0)
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
