import type { DocumentDetail } from "../types/document";
import EntityBadges from "./EntityBadges";
import "./DocumentModal.css";

interface Props {
  doc: DocumentDetail;
  onClose: () => void;
}

export default function DocumentModal({ doc, onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{doc.filename}</h2>
            <span className={`doc-type-badge ${doc.doc_type}`}>
              {doc.doc_type.replace("_", " ")}
            </span>
          </div>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="modal-section">
          <h3>Extracted Entities</h3>
          <EntityBadges entities={doc.entities} />
        </div>

        <div className="modal-section">
          <h3>Raw Text</h3>
          <pre className="raw-text">{doc.raw_text}</pre>
        </div>
      </div>
    </div>
  );
}
