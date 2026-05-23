import { useEffect, useState } from "react";
import { listDocuments, getDocument } from "../api/client";
import type { DocumentDetail, DocumentSummary } from "../types/document";
import EntityBadges from "./EntityBadges";
import "./DocumentList.css";

interface Props {
  onSelect: (doc: DocumentDetail) => void;
}

export default function DocumentList({ onSelect }: Props) {
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listDocuments()
      .then(setDocs)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleClick = async (id: string) => {
    try {
      const full = await getDocument(id);
      onSelect(full);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load document.");
    }
  };

  if (loading) return <p className="status-message">Loading documents...</p>;
  if (error) return <p className="status-message error">{error}</p>;
  if (docs.length === 0)
    return <p className="status-message">No documents yet. Upload one to get started.</p>;

  return (
    <div className="doc-list">
      {docs.map((doc) => {
        const isReady = doc.status === "ready";
        return (
          <button
            key={doc.id}
            className="doc-card"
            onClick={() => handleClick(doc.id)}
          >
            <div className="doc-card-header">
              <span className="doc-filename">{doc.filename}</span>
              {isReady && doc.doc_type && (
                <span className={`doc-type-badge ${doc.doc_type}`}>
                  {doc.doc_type.replace("_", " ")}
                </span>
              )}
              {!isReady && (
                <span className={`status-pill status-${doc.status}`}>
                  {doc.status}
                </span>
              )}
            </div>
            {isReady && doc.entities ? (
              <EntityBadges entities={doc.entities} />
            ) : (
              <p className="no-entities">
                {doc.status === "failed"
                  ? "Processing failed. Open to see details."
                  : "Awaiting processing..."}
              </p>
            )}
            <div className="doc-card-footer">
              {new Date(doc.created_at).toLocaleDateString()}
            </div>
          </button>
        );
      })}
    </div>
  );
}
