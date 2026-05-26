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
