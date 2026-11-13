import { Icon } from "../../components/ui";
import { boldParts, citationLabel } from "../../data/assistant";
import type { Turn } from "../../data/assistant";
import { REGULATIONS_URL } from "../../data/constants";

/** The answer + citation cards for one turn; `size` picks the mobile (06) or desktop (D5) styling. */
export function AssistantAnswer({ turn, size }: { turn: Turn; size: "mobile" | "desktop" }) {
  const p = size === "mobile" ? "ma" : "da";
  if (turn.status === "pending") return <p className={`${p}-answer ${p}-answer-preview`}>Checking the regulations…</p>;
  if (turn.status === "error") return <p className={`${p}-answer ${p}-answer-preview`}>{turn.error}</p>;

  return (
    <>
      <p className={`${p}-answer`}>
        {boldParts(turn.answer ?? "").map((part, i) => (part.bold ? <strong key={i}>{part.text}</strong> : <span key={i}>{part.text}</span>))}
      </p>
      {(turn.citations ?? []).map((c) => (
        <div key={c.id} className={`${p}-citation`}>
          <p className={`${p}-citation-title`}>
            <Icon name={size === "mobile" ? "m6-book-dark.svg" : "d5-book-dark.svg"} size={size === "mobile" ? 16 : 18} />
            {c.section ?? "Hunting regulations"}
          </p>
          <p className={size === "mobile" ? "ma-citation-source" : "dd-muted-13"}>{citationLabel(c)}</p>
          <a className={size === "mobile" ? "ma-source-link" : "da-source"} href={c.source_url ?? REGULATIONS_URL} target="_blank" rel="noreferrer">
            View source
            <Icon name={size === "mobile" ? "m6-arrow-up-right.svg" : "d5-arrow-up-right.svg"} size={15} />
          </a>
        </div>
      ))}
    </>
  );
}
