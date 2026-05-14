import { useState } from "react";
import UploadPanel from "./components/UploadPanel";
import DocumentList from "./components/DocumentList";
import SearchPanel from "./components/SearchPanel";
import DocumentModal from "./components/DocumentModal";
import type { DocumentDetail } from "./types/document";
import "./App.css";

type Tab = "upload" | "documents" | "search";

export default function App() {
  const [tab, setTab] = useState<Tab>("upload");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedDoc, setSelectedDoc] = useState<DocumentDetail | null>(null);

  const handleUploadComplete = () => {
    setRefreshKey((k) => k + 1);
    setTab("documents");
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>DocProc</h1>
        <p>Upload, classify, and search PDF documents with AI</p>
      </header>

      <nav className="tab-bar">
        {(["upload", "documents", "search"] as Tab[]).map((t) => (
          <button
            key={t}
            className={`tab-btn ${tab === t ? "active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "upload" ? "Upload" : t === "documents" ? "Documents" : "Search"}
          </button>
        ))}
      </nav>

      <main className="main-content">
        {tab === "upload" && <UploadPanel onComplete={handleUploadComplete} />}
        {tab === "documents" && (
          <DocumentList key={refreshKey} onSelect={setSelectedDoc} />
        )}
        {tab === "search" && <SearchPanel onSelect={setSelectedDoc} />}
      </main>

      {selectedDoc && (
        <DocumentModal doc={selectedDoc} onClose={() => setSelectedDoc(null)} />
      )}
    </div>
  );
}
