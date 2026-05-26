import { useEffect, useState } from "react";
import { deleteDocument } from "../api/client";
import type { DocumentDetail } from "../types/document";
import EntityBadges from "./EntityBadges";
import "./DocumentModal.css";

interface Props {
  doc: DocumentDetail | null;
  onClose: () => void;
  onDeleted: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  medical_record: "Medical record",
  legal_filing: "Legal filing",
  billing: "Billing",
  correspondence: "Correspondence",
  other: "Other",
};

const STATUS_LABEL: Record<DocumentDetail["status"], string> = {
  pending: "Queued",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};

/**
 * Renamed in spirit to DossierPanel — slides in from the right when a
 * document is selected. The library list remains visible behind a soft
 * scrim, so the user can hop between documents without losing context.
 */
export default function DossierPanel({ doc, onClose, onDeleted }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Reset confirm/delete state whenever the panel switches to a new doc.
  useEffect(() => {
    setConfirming(false);
    setDeleting(false);
    setDeleteError(null);
  }, [doc?.id]);

  // Close on Escape — but if a confirmation is open, Escape cancels that
  // first so a destructive action is never one keypress from disappearing.
  useEffect(() => {
    if (!doc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (confirming) {
        setConfirming(false);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doc, onClose, confirming]);

  const handleDelete = async () => {
    if (!doc) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteDocument(doc.id);
      onDeleted();
    } catch (e: unknown) {
      setDeleteError(
        e instanceof Error ? e.message : "Could not delete document."
      );
      setDeleting(false);
    }
  };

  const open = doc !== null;
  const tabKey = doc?.doc_type ?? "other";
  const isReady = doc?.status === "ready";

  return (
    <>
      <div
        className={`dossier-scrim ${open ? "open" : ""}`}
        onClick={() => {
          if (confirming) {
            setConfirming(false);
            return;
          }
          onClose();
        }}
        aria-hidden={!open}
      />
      <aside
        className={`dossier ${open ? "open" : ""}`}
        role="dialog"
        aria-modal="false"
        aria-label="Document detail"
      >
        {doc && (
          <>
            <div className="dossier-head">
              <div className="dossier-head-meta">
                <span
                  className={`dossier-stripe stripe-${tabKey}`}
                  aria-hidden
                />
                <div className="dossier-meta-text">
                  <span className="dossier-eyebrow">
                    {doc.doc_type
                      ? TYPE_LABELS[doc.doc_type] ?? doc.doc_type
                      : "Document"}
                  </span>
                  <h2 className="dossier-title serif">{doc.filename}</h2>
                </div>
              </div>
              <div className="dossier-head-actions">
                <button
                  className="dossier-icon-btn dossier-icon-btn-danger"
                  onClick={() => setConfirming(true)}
                  disabled={deleting}
                  title="Delete document"
                  aria-label="Delete document"
                >
                  <svg viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path
                      d="M3.5 5h9M6.5 5V3.5h3V5M5 5l.5 8.5a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1L11 5M7 7.5v5M9 7.5v5"
                      stroke="currentColor"
                      strokeWidth="1.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  className="dossier-icon-btn"
                  onClick={onClose}
                  aria-label="Close"
                >
                  <svg viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path
                      d="m4 4 8 8M12 4l-8 8"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            </div>

            <div className="dossier-status-row">
              <span className={`status-pill status-${doc.status}`}>
                {STATUS_LABEL[doc.status]}
              </span>
              {doc.created_at && (
                <span className="dossier-stamp tnum">
                  Added {new Date(doc.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              )}
              {doc.processed_at && (
                <span className="dossier-stamp tnum">
                  Processed{" "}
                  {new Date(doc.processed_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              )}
            </div>

            {confirming && (
              <div className="dossier-confirm" role="alertdialog">
                <div className="dossier-confirm-text">
                  <strong className="dossier-confirm-title">
                    Delete this document?
                  </strong>
                  <span className="dossier-confirm-sub">
                    Its raw text, entities, and embedding will be removed
                    permanently. This cannot be undone.
                  </span>
                  {deleteError && (
                    <span className="dossier-confirm-error">{deleteError}</span>
                  )}
                </div>
                <div className="dossier-confirm-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={() => setConfirming(false)}
                    disabled={deleting}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    {deleting ? "Deleting…" : "Delete document"}
                  </button>
                </div>
              </div>
            )}

            <div className="dossier-body">
              {doc.status === "failed" && doc.error && (
                <section className="dossier-section dossier-section-error">
                  <h3 className="dossier-section-title">Pipeline error</h3>
                  <pre className="raw-text raw-text-error">{doc.error}</pre>
                </section>
              )}

              <section className="dossier-section">
                <h3 className="dossier-section-title">Extracted entities</h3>
                {doc.entities ? (
                  <EntityBadges entities={doc.entities} />
                ) : (
                  <p className="no-entities">
                    {doc.status === "failed"
                      ? "No entities — processing failed."
                      : "Not yet extracted."}
                  </p>
                )}
              </section>

              <section className="dossier-section">
                <h3 className="dossier-section-title">Raw text</h3>
                {doc.raw_text ? (
                  <pre className="raw-text">{doc.raw_text}</pre>
                ) : (
                  <p className="no-entities">
                    {doc.status === "failed"
                      ? "Extraction did not complete."
                      : "Not yet extracted."}
                  </p>
                )}
              </section>

              {isReady && (
                <p className="dossier-foot mono">
                  ID&nbsp;{doc.id}
                </p>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
