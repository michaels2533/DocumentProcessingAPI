import { useCallback, useEffect, useState } from "react";
import { listDocuments } from "./api/client";
import type { DocumentDetail, DocumentSummary } from "./types/document";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import LibraryOverview from "./components/LibraryOverview";
import DocumentList from "./components/DocumentList";
import UploadPanel from "./components/UploadPanel";
import SearchPanel from "./components/SearchPanel";
import DossierPanel from "./components/DocumentModal";
import "./App.css";

export type View = "library" | "upload" | "search";

export default function App() {
  const [view, setView] = useState<View>("library");
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<DocumentDetail | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    listDocuments()
      .then((rows) => {
        setDocs(rows);
        setError(null);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load documents.")
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleUploadComplete = useCallback(() => {
    refresh();
    setView("library");
  }, [refresh]);

  // Global "/" → jump to search, like Linear/Vercel.
  // Skipped when the user is already typing in an input/textarea.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        (t && t.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      setView("search");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app-shell">
      <Sidebar
        view={view}
        onView={setView}
        docs={docs}
        onSelectDoc={setSelectedDoc}
      />

      <div className="app-main">
        <TopBar
          view={view}
          docCount={docs.length}
          onUpload={() => setView("upload")}
          onSearch={() => setView("search")}
        />

        <main className="canvas">
          {view === "library" && (
            <>
              <LibraryOverview
                docs={docs}
                loading={loading}
                onUpload={() => setView("upload")}
                onSearch={() => setView("search")}
              />
              <section className="canvas-section">
                <header className="section-head">
                  <h2 className="section-title">All documents</h2>
                  <span className="section-meta tnum">
                    {docs.length} {docs.length === 1 ? "file" : "files"}
                  </span>
                </header>
                <DocumentList
                  docs={docs}
                  loading={loading}
                  error={error}
                  onSelect={setSelectedDoc}
                />
              </section>
            </>
          )}

          {view === "upload" && (
            <section className="canvas-section">
              <header className="section-head">
                <h2 className="section-title">Add a document</h2>
                <span className="section-meta">
                  Text-based PDFs, up to 20&nbsp;MB
                </span>
              </header>
              <UploadPanel onComplete={handleUploadComplete} />
            </section>
          )}

          {view === "search" && (
            <section className="canvas-section">
              <header className="section-head">
                <h2 className="section-title">Search the library</h2>
                <span className="section-meta">
                  Semantic match, with optional keyword and type filters
                </span>
              </header>
              <SearchPanel onSelect={setSelectedDoc} />
            </section>
          )}
        </main>

        <footer className="app-footer">
          <a
            className="app-footer-link"
            href="https://github.com/michaels2533/DocumentProcessingAPI"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View source on GitHub (opens in a new tab)"
          >
            <svg
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden
              className="app-footer-icon"
            >
              <path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.34c-2.22.48-2.69-1.07-2.69-1.07-.36-.93-.89-1.18-.89-1.18-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.23 1.88.87 2.34.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.83-2.15-.08-.2-.36-1.02.08-2.13 0 0 .67-.22 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.11.16 1.93.08 2.13.52.56.83 1.28.83 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.74.54 1.49v2.21c0 .21.15.46.55.38A8 8 0 0 0 8 0Z" />
            </svg>
            <span>View source on GitHub</span>
            <svg
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden
              className="app-footer-arrow"
            >
              <path
                d="M6 4h6v6M11.5 4.5 4.5 11.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </footer>
      </div>

      <DossierPanel
        doc={selectedDoc}
        onClose={() => setSelectedDoc(null)}
        onDeleted={() => {
          setSelectedDoc(null);
          refresh();
        }}
      />
    </div>
  );
}
