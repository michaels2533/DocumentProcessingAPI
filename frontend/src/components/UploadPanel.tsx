import { useCallback, useState, useRef } from "react";
import { uploadDocument } from "../api/client";
import type { DocumentDetail } from "../types/document";
import EntityBadges from "./EntityBadges";
import "./UploadPanel.css";

interface Props {
  onComplete: () => void;
}

export default function UploadPanel({ onComplete }: Props) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DocumentDetail | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setResult(null);
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please upload a PDF file.");
      return;
    }
    setUploading(true);
    try {
      const doc = await uploadDocument(file);
      setResult(doc);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="upload-panel">
      <div
        className={`drop-zone ${dragging ? "dragging" : ""} ${uploading ? "busy" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        {uploading ? (
          <div className="upload-spinner">
            <div className="spinner" />
            <span>Processing document...</span>
          </div>
        ) : (
          <>
            <div className="drop-icon">PDF</div>
            <p className="drop-text">
              Drop a PDF here or <span className="link">browse</span>
            </p>
            <p className="drop-hint">Text-based PDFs up to 20 MB</p>
          </>
        )}
      </div>

      {error && <div className="upload-error">{error}</div>}

      {result && (
        <div className="upload-result">
          <div className="result-header">
            <h3>{result.filename}</h3>
            <span className={`doc-type-badge ${result.doc_type}`}>
              {result.doc_type.replace("_", " ")}
            </span>
          </div>
          <EntityBadges entities={result.entities} />
          <div className="result-actions">
            <button className="btn-primary" onClick={onComplete}>
              View all documents
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
