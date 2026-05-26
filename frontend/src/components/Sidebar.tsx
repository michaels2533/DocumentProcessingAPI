import type React from "react";
import { useState } from "react";
import { getDocument } from "../api/client";
import type { DocumentDetail, DocumentSummary } from "../types/document";
import type { View } from "../App";
import "./Sidebar.css";

interface Props {
  view: View;
  onView: (v: View) => void;
  docs: DocumentSummary[];
  onSelectDoc: (doc: DocumentDetail) => void;
}

const NAV: { id: View; label: string; icon: React.ReactElement }[] = [
  {
    id: "library",
    label: "Library",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M3 2.5h3.5a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Zm6.5 0H13a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H9.5a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z"
          stroke="currentColor"
          strokeWidth="1.25"
        />
      </svg>
    ),
  },
  {
    id: "upload",
    label: "Add document",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M8 3v8m0-8L5 6m3-3 3 3M3.5 13h9"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    id: "search",
    label: "Search",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.25" />
        <path
          d="m13 13-2.7-2.7"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

// "Type counts" mini index, like Quicken's account groups.
const TYPE_LABELS: Record<string, string> = {
  medical_record: "Medical",
  legal_filing: "Legal",
  billing: "Billing",
  correspondence: "Correspondence",
  other: "Other",
};

export default function Sidebar({ view, onView, docs, onSelectDoc }: Props) {
  const [openingId, setOpeningId] = useState<string | null>(null);

  // Recent docs (most recent 5, ready only — they're the ones you'd revisit)
  const recent = [...docs]
    .filter((d) => d.status === "ready")
    .slice(0, 5);

  const counts = docs.reduce<Record<string, number>>((acc, d) => {
    if (d.status !== "ready") return acc;
    const k = d.doc_type ?? "other";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  const handleOpen = async (id: string) => {
    setOpeningId(id);
    try {
      const full = await getDocument(id);
      onSelectDoc(full);
    } catch {
      // fall through silently — list view will surface the error
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M6 3.5h8.5L19 8v12.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            <path d="M14 3.5V8h5" stroke="currentColor" strokeWidth="1.4" />
            <path
              d="M8.5 13h7M8.5 16h4.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <div className="brand-words">
          <span className="brand-name">DocProc</span>
          <span className="brand-tag">Document workspace</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Primary">
        {NAV.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${view === item.id ? "active" : ""}`}
            onClick={() => onView(item.id)}
          >
            <span className="nav-icon" aria-hidden>
              {item.icon}
            </span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-section">
        <div className="sidebar-section-head">
          <span className="sidebar-section-title">Library</span>
          <span className="sidebar-section-count tnum">{docs.length}</span>
        </div>
        <ul className="type-index">
          {Object.entries(TYPE_LABELS).map(([key, label]) => (
            <li key={key} className="type-row">
              <span className={`type-dot type-${key}`} aria-hidden />
              <span className="type-name">{label}</span>
              <span className="type-count tnum">{counts[key] ?? 0}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="sidebar-section sidebar-recent">
        <div className="sidebar-section-head">
          <span className="sidebar-section-title">Recent</span>
        </div>
        {recent.length === 0 ? (
          <p className="sidebar-empty">Nothing yet.</p>
        ) : (
          <ul className="recent-list">
            {recent.map((d) => (
              <li key={d.id}>
                <button
                  className={`recent-item ${
                    openingId === d.id ? "loading" : ""
                  }`}
                  onClick={() => handleOpen(d.id)}
                  title={d.filename}
                >
                  <span
                    className={`recent-stripe stripe-${d.doc_type ?? "other"}`}
                    aria-hidden
                  />
                  <span className="recent-name">{d.filename}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="sidebar-foot">
        <span className="foot-version mono">v0.1</span>
      </div>
    </aside>
  );
}
