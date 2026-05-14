import { useState } from "react";
import { searchDocuments, getDocument } from "../api/client";
import type { DocumentDetail, DocumentSummary } from "../types/document";
import EntityBadges from "./EntityBadges";
import "./SearchPanel.css";

const DOC_TYPES = [
  { value: "", label: "All types" },
  { value: "medical_record", label: "Medical Record" },
  { value: "legal_filing", label: "Legal Filing" },
  { value: "billing", label: "Billing" },
  { value: "correspondence", label: "Correspondence" },
  { value: "other", label: "Other" },
];

interface Props {
  onSelect: (doc: DocumentDetail) => void;
}

export default function SearchPanel({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [docType, setDocType] = useState("");
  const [results, setResults] = useState<DocumentSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await searchDocuments({
        query: query.trim(),
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

  const handleClick = async (id: string) => {
    try {
      const full = await getDocument(id);
      onSelect(full);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load document.");
    }
  };

  return (
    <div className="search-panel">
      <form className="search-form" onSubmit={handleSearch}>
        <input
          type="text"
          className="search-input"
          placeholder="Describe what you're looking for..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="search-filter"
          value={docType}
          onChange={(e) => setDocType(e.target.value)}
        >
          {DOC_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? "Searching..." : "Search"}
        </button>
      </form>

      {error && <p className="status-message error">{error}</p>}

      {results !== null && (
        <div className="search-results">
          {results.length === 0 ? (
            <p className="status-message">No matching documents found.</p>
          ) : (
            results.map((doc) => (
              <button
                key={doc.id}
                className="doc-card"
                onClick={() => handleClick(doc.id)}
              >
                <div className="doc-card-header">
                  <span className="doc-filename">{doc.filename}</span>
                  <span className={`doc-type-badge ${doc.doc_type}`}>
                    {doc.doc_type.replace("_", " ")}
                  </span>
                  {doc.similarity != null && (
                    <span className="similarity-badge">
                      {(doc.similarity * 100).toFixed(1)}% match
                    </span>
                  )}
                </div>
                <EntityBadges entities={doc.entities} />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
