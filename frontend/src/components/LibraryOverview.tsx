import { useMemo } from "react";
import type { DocumentSummary } from "../types/document";
import "./LibraryOverview.css";

interface Props {
  docs: DocumentSummary[];
  loading: boolean;
  onUpload: () => void;
  onSearch: () => void;
}

const TYPE_META: { key: string; label: string; varName: string }[] = [
  { key: "medical_record", label: "Medical", varName: "--tab-medical" },
  { key: "legal_filing", label: "Legal", varName: "--tab-legal" },
  { key: "billing", label: "Billing", varName: "--tab-billing" },
  { key: "correspondence", label: "Correspondence", varName: "--tab-correspondence" },
  { key: "other", label: "Other", varName: "--tab-other" },
];

interface Slice {
  key: string;
  label: string;
  varName: string;
  count: number;
  fraction: number;
}

export default function LibraryOverview({
  docs,
  loading,
  onUpload,
  onSearch,
}: Props) {
  const { slices, ready, processing, failed } = useMemo(() => {
    const ready = docs.filter((d) => d.status === "ready");
    const processing = docs.filter(
      (d) => d.status === "pending" || d.status === "processing"
    ).length;
    const failed = docs.filter((d) => d.status === "failed").length;
    const total = ready.length;
    const counts: Record<string, number> = {};
    for (const d of ready) {
      const k = d.doc_type ?? "other";
      counts[k] = (counts[k] ?? 0) + 1;
    }
    const slices: Slice[] = TYPE_META.map((m) => ({
      ...m,
      count: counts[m.key] ?? 0,
      fraction: total ? (counts[m.key] ?? 0) / total : 0,
    }));
    return { slices, ready: total, processing, failed };
  }, [docs]);

  // Empty state — friendlier than a blank panel.
  if (!loading && docs.length === 0) {
    return (
      <section className="library-empty">
        <div className="library-empty-mark" aria-hidden>
          <svg viewBox="0 0 64 64" fill="none">
            <rect
              x="14"
              y="10"
              width="32"
              height="44"
              rx="3"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M22 22h16M22 30h16M22 38h10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <h2 className="library-empty-title serif">
          Your library is empty.
        </h2>
        <p className="library-empty-sub">
          Drop in a PDF and DocProc will extract its type, key entities,
          and full text — usually in under a minute.
        </p>
        <div className="library-empty-actions">
          <button className="btn btn-primary" onClick={onUpload}>
            Upload your first document
          </button>
          <button className="btn btn-secondary" onClick={onSearch}>
            Try search
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="library-overview">
      <article className="overview-card overview-distribution">
        <header className="overview-head">
          <div>
            <h2 className="overview-title">Library overview</h2>
            <p className="overview-sub">Document types in your workspace</p>
          </div>
          <span className="overview-period">All time</span>
        </header>

        <div className="overview-body">
          <div className="donut-wrap">
            <Donut slices={slices} />
            <div className="donut-center">
              <span className="donut-eyebrow">Processed</span>
              <span className="donut-value serif tnum">{ready}</span>
              <span className="donut-caption">
                {ready === 1 ? "document" : "documents"}
              </span>
            </div>
          </div>

          <ul className="legend">
            {slices
              .filter((s) => s.count > 0 || ready === 0)
              .map((s) => (
                <li key={s.key} className="legend-row">
                  <span
                    className="legend-swatch"
                    style={{ background: `var(${s.varName})` }}
                    aria-hidden
                  />
                  <span className="legend-label">{s.label}</span>
                  <span className="legend-bar" aria-hidden>
                    <span
                      className="legend-bar-fill"
                      style={{
                        width: `${Math.max(s.fraction * 100, s.count > 0 ? 4 : 0)}%`,
                        background: `var(${s.varName})`,
                      }}
                    />
                  </span>
                  <span className="legend-count tnum">{s.count}</span>
                </li>
              ))}
          </ul>
        </div>
      </article>

      <article className="overview-card overview-pipeline">
        <header className="overview-head">
          <div>
            <h2 className="overview-title">Pipeline</h2>
            <p className="overview-sub">Live processing status</p>
          </div>
        </header>

        <div className="stat-row">
          <Stat label="Ready" value={ready} tone="ready" />
          <Stat label="In flight" value={processing} tone="processing" />
          <Stat label="Failed" value={failed} tone="failed" />
        </div>

        <div className="overview-tip">
          <span className="overview-tip-icon" aria-hidden>
            <svg viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.25" />
              <path
                d="M8 5v3.5M8 11v.01"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span>
            Search blends semantic similarity with keyword and type filters —
            try a phrase like <em>“invoice for outpatient visit”</em>.
          </span>
        </div>
      </article>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ready" | "processing" | "failed";
}) {
  return (
    <div className={`stat stat-${tone}`}>
      <span className="stat-value serif tnum">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------ */
/*  Donut chart — pure SVG, no library.                         */
/*  Each arc is a stroked circle clipped via dasharray + offset.*/
/* ------------------------------------------------------------ */
function Donut({ slices }: { slices: Slice[] }) {
  const SIZE = 168;
  const STROKE = 18;
  const R = (SIZE - STROKE) / 2;
  const C = 2 * Math.PI * R;

  const total = slices.reduce((acc, s) => acc + s.count, 0);

  // No data -> render a quiet ring placeholder.
  if (total === 0) {
    return (
      <svg
        className="donut"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label="Document distribution donut chart, empty"
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="var(--surface-sunken)"
          strokeWidth={STROKE}
        />
      </svg>
    );
  }

  let cumulative = 0;
  const arcs = slices
    .filter((s) => s.count > 0)
    .map((s) => {
      const len = (s.count / total) * C;
      const offset = -cumulative;
      cumulative += len;
      return { key: s.key, varName: s.varName, len, offset };
    });

  return (
    <svg
      className="donut"
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label="Document distribution by type"
    >
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={R}
        fill="none"
        stroke="var(--surface-sunken)"
        strokeWidth={STROKE}
      />
      <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
        {arcs.map((a) => (
          <circle
            key={a.key}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke={`var(${a.varName})`}
            strokeWidth={STROKE}
            strokeLinecap="butt"
            strokeDasharray={`${a.len} ${C - a.len}`}
            strokeDashoffset={a.offset}
          />
        ))}
      </g>
    </svg>
  );
}
