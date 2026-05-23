import type { DocumentDetail } from "../types/document";
import EntityBadges from "./EntityBadges";
import "./DocumentModal.css";

interface Props {
  doc: DocumentDetail;
  onClose: () => void;
}

export default function DocumentModal({ doc, onClose }: Props) {
  const isReady = doc.status === "ready";
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{doc.filename}</h2>
            {isReady && doc.doc_type && (
              <span className={`doc-type-badge ${doc.doc_type}`}>
                {doc.doc_type.replace("_", " ")}
              </span>
            )}
            <span className={`status-pill status-${doc.status}`}>
              {doc.status}
            </span>
          </div>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        {doc.status === "failed" && doc.error && (
          <div className="modal-section">
            <h3>Error</h3>
            <pre className="raw-text">{doc.error}</pre>
          </div>
        )}

        <div className="modal-section">
          <h3>Extracted Entities</h3>
          {doc.entities ? (
            <EntityBadges entities={doc.entities} />
          ) : (
            <p className="no-entities">
              {doc.status === "failed"
                ? "No entities -- processing failed."
                : "Not yet extracted."}
            </p>
          )}
        </div>

        <div className="modal-section">
          <h3>Raw Text</h3>
          {doc.raw_text ? (
            <pre className="raw-text">{doc.raw_text}</pre>
          ) : (
            <p className="no-entities">
              {doc.status === "failed"
                ? "No text -- processing failed before extraction completed."
                : "Not yet extracted."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
