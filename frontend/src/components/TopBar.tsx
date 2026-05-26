import type { View } from "../App";
import "./TopBar.css";

interface Props {
  view: View;
  docCount: number;
  onUpload: () => void;
  onSearch: () => void;
}

const TITLES: Record<View, { eyebrow: string; title: string }> = {
  library: { eyebrow: "Workspace", title: "Library" },
  upload: { eyebrow: "Workspace", title: "Add document" },
  search: { eyebrow: "Workspace", title: "Search" },
};

export default function TopBar({ view, docCount, onUpload, onSearch }: Props) {
  const { eyebrow, title } = TITLES[view];

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="crumbs">
          <span className="crumb-eyebrow">{eyebrow}</span>
          <span className="crumb-divider" aria-hidden>
            /
          </span>
          <span className="crumb-active">{title}</span>
        </div>
        {view === "library" && (
          <p className="topbar-sub tnum">
            {docCount} {docCount === 1 ? "document" : "documents"} processed
          </p>
        )}
      </div>

      <div className="topbar-right">
        <button
          type="button"
          className="topbar-search"
          onClick={onSearch}
          aria-label="Search the library"
        >
          <svg viewBox="0 0 16 16" fill="none" aria-hidden>
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
          <span>Search documents</span>
          <kbd className="kbd mono">/</kbd>
        </button>
        <button className="btn btn-primary" onClick={onUpload}>
          <svg viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M8 3.5v9m-4.5-4.5h9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          New upload
        </button>
      </div>
    </header>
  );
}
