import { useState } from "react";
import { searchDocuments, getDocument } from "../api/client";
import type { DocumentDetail, DocumentSummary } from "../types/document";
import "./SearchPanel.css";

const DOC_TYPES = [
  { value: "", label: "All types" },
  { value: "medical_record", label: "Medical record" },
  { value: "legal_filing", label: "Legal filing" },
  { value: "billing", label: "Billing" },
  { value: "correspondence", label: "Correspondence" },
  { value: "other", label: "Other" },
];

interface Props {
  onSelect: (doc: DocumentDetail) => void;
}

export default function SearchPanel({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [keyword, setKeyword] = useState("");
  const [docType, setDocType] = useState("");
  const [results, setResults] = useState<DocumentSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await searchDocuments({
        query: query.trim(),
        keyword: keyword.trim() || undefined,
        doc_type: docType || undefined,
        top_k: 10,
      });
      setResults(data.results);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  };

  const open = async (id: string) => {
    setOpeningId(id);
    try {
      const full = await getDocument(id);
      onSelect(full);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load document.");
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <div className="search-panel">
      <form className="search-card" onSubmit={handleSearch}>
        <label className="field field-primary">
          <span className="field-label">What are you looking for?</span>
          <div className="field-input-wrap">
            <svg
              className="field-icon"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden
            >
              <circle
                cx="7"
                cy="7"
                r="4.25"
                stroke="currentColor"
                strokeWidth="1.25"
              />
              <path
                d="m13 13-2.7-2.7"
                stroke="currentColor"
                strokeWidth="1.25"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="text"
              className="field-input field-input-primary"
              placeholder="Describe the document or topic in plain language…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
        </label>

        <div className="field-row">
          <label className="field">
            <span className="field-label">Must contain keyword</span>
            <input
              type="text"
              className="field-input"
              placeholder="e.g. invoice, MRI"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </label>
          <label className="field field-select-wrap">
            <span className="field-label">Document type</span>
            <div className="select-shell">
              <select
                className="field-input field-select"
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
              >
                {DOC_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <svg
                className="select-caret"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden
              >
                <path
                  d="m4 6 4 4 4-4"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </label>
        </div>

        <div className="search-actions">
          <p className="search-hint">
            Results blend semantic similarity with optional keyword + type
            filters.
          </p>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading || !query.trim()}
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
      </form>

      {error && <p className="status-message error">{error}</p>}

      {results !== null && !error && (
        <div className="search-results">
          <header className="section-head">
            <h3 className="section-title">
              {results.length === 0
                ? "No matches"
                : `${results.length} ${
                    results.length === 1 ? "match" : "matches"
                  }`}
            </h3>
            <span className="section-meta">Ranked by relevance</span>
          </header>

          {results.length === 0 ? (
            <p className="status-message">
              Try broadening your query or removing the keyword filter.
            </p>
          ) : (
            <ol className="result-list">
              {results.map((doc, i) => {
                const tab = doc.doc_type ?? "other";
                return (
                  <li key={doc.id}>
                    <button
                      className={`result-row ${
                        openingId === doc.id ? "opening" : ""
                      }`}
                      onClick={() => open(doc.id)}
                    >
                      <span className="result-rank tnum">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span
                        className={`result-stripe stripe-${tab}`}
                        aria-hidden
                      />
                      <div className="result-body">
                        <div className="result-head-row">
                          <span className="result-name">{doc.filename}</span>
                          {doc.doc_type && (
                            <span
                              className={`doc-type-badge ${doc.doc_type}`}
                            >
                              {doc.doc_type.replace("_", " ")}
                            </span>
                          )}
                        </div>
                        <div className="result-meta">
                          {doc.similarity != null && (
                            <span className="meta-chip">
                              <span className="meta-chip-dot" />
                              <span className="tnum">
                                {(doc.similarity * 100).toFixed(1)}%
                              </span>
                              <span className="meta-chip-label">semantic</span>
                            </span>
                          )}
                          {doc.fts_rank != null && (
                            <span className="meta-chip meta-chip-amber">
                              <span className="meta-chip-dot" />
                              <span className="tnum">
                                {doc.fts_rank.toFixed(3)}
                              </span>
                              <span className="meta-chip-label">FTS</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="result-arrow" aria-hidden>
                        <svg viewBox="0 0 16 16" fill="none">
                          <path
                            d="m6 4 4 4-4 4"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
