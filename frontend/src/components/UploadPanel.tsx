import { useCallback, useEffect, useRef, useState } from "react";
import { uploadDocument } from "../api/client";
import { useDocumentStatus } from "../hooks/useDocumentStatus";
import type { DocumentJob, DocumentStatus } from "../types/document";
import EntityBadges from "./EntityBadges";
import "./UploadPanel.css";

interface Props {
  onComplete: () => void;
}

// Human-readable label + CSS modifier for each lifecycle state.
const STATUS_COPY: Record<
  DocumentStatus,
  { label: string; hint: string; modifier: string }
> = {
  pending: {
    label: "Queued",
    hint: "Waiting for a worker to pick up the job...",
    modifier: "pending",
  },
  processing: {
    label: "Processing",
    hint: "Extracting text, classifying, and embedding...",
    modifier: "processing",
  },
  ready: {
    label: "Ready",
    hint: "Done.",
    modifier: "ready",
  },
  failed: {
    label: "Failed",
    hint: "The pipeline could not finish.",
    modifier: "failed",
  },
};

export default function UploadPanel({ onComplete }: Props) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [job, setJob] = useState<DocumentJob | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Drives the polling loop once we have a job id.
  const { doc, status, isPolling, pollError } = useDocumentStatus(job?.id ?? null);

  const handleFile = useCallback(async (file: File) => {
    setUploadError(null);
    setJob(null);
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setUploadError("Please upload a PDF file.");
      return;
    }
    setUploading(true);
    try {
      const created = await uploadDocument(file);
      setJob(created);
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }, []);

  // Once we have a job, reset the drop zone for the next upload.
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  // When the pipeline successfully completes, refresh the documents list in
  // the background so the user sees it the moment they switch tabs.
  const completedFor = useRef<string | null>(null);
  useEffect(() => {
    if (status === "ready" && job && completedFor.current !== job.id) {
      completedFor.current = job.id;
      onComplete();
    }
  }, [status, job, onComplete]);

  const showSpinner = uploading || (job !== null && isPolling);
  const copy = STATUS_COPY[status];

  return (
    <div className="upload-panel">
      <div
        className={`drop-zone ${dragging ? "dragging" : ""} ${showSpinner ? "busy" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !showSpinner && inputRef.current?.click()}
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
        {showSpinner ? (
          <div className="upload-spinner">
            <div className="spinner" />
            <span>
              {uploading ? "Uploading..." : `${copy.label}: ${copy.hint}`}
            </span>
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

      {uploadError && <div className="upload-error">{uploadError}</div>}
      {pollError && <div className="upload-error">{pollError}</div>}

      {/* In-flight job indicator (queued / processing) */}
      {job && !uploading && !pollError && status !== "ready" && status !== "failed" && (
        <div className="upload-job">
          <span className="job-filename">{job.filename}</span>
          <span className={`status-pill status-${copy.modifier}`}>{copy.label}</span>
        </div>
      )}

      {/* Terminal: failed */}
      {doc && doc.status === "failed" && (
        <div className="upload-result upload-result-failed">
          <div className="result-header">
            <h3>{doc.filename}</h3>
            <span className={`status-pill status-failed`}>Failed</span>
          </div>
          <p className="upload-error" style={{ marginTop: 12 }}>
            {doc.error ?? "Unknown error."}
          </p>
          <div className="result-actions">
            <button
              className="btn-primary"
              onClick={() => {
                setJob(null);
                completedFor.current = null;
              }}
            >
              Try another file
            </button>
          </div>
        </div>
      )}

      {/* Terminal: ready */}
      {doc && doc.status === "ready" && (
        <div className="upload-result">
          <div className="result-header">
            <h3>{doc.filename}</h3>
            {doc.doc_type && (
              <span className={`doc-type-badge ${doc.doc_type}`}>
                {doc.doc_type.replace("_", " ")}
              </span>
            )}
            <span className="status-pill status-ready">Ready</span>
          </div>
          {doc.entities && <EntityBadges entities={doc.entities} />}
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
