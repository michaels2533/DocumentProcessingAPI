import type { Entities } from "../types/document";
import "./EntityBadges.css";

const LABELS: Record<keyof Entities, string> = {
  person_names: "People",
  dates: "Dates",
  dollar_amounts: "Amounts",
  medical_conditions: "Conditions",
  organizations: "Orgs",
};

interface Props {
  entities: Entities;
}

export default function EntityBadges({ entities }: Props) {
  const sections = (Object.keys(LABELS) as (keyof Entities)[]).filter(
    (k) => entities[k]?.length > 0
  );

  if (sections.length === 0) return <p className="no-entities">No entities extracted</p>;

  return (
    <div className="entity-badges">
      {sections.map((key) => (
        <div key={key} className="entity-group">
          <span className="entity-label">{LABELS[key]}</span>
          <div className="badges">
            {entities[key].map((val, i) => (
              <span key={i} className={`badge badge-${key}`}>
                {val}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
