import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Button, Divider, Icon } from "../../components/ui";
import { ask, newConversation, openPast, useAssistant } from "../../data/assistant";
import type { PastQuestion } from "../../data/assistant";
import { REGULATIONS_URL } from "../../data/constants";
import { formatTime } from "../../data/useRecords";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { AssistantAnswer } from "../shared/AssistantAnswer";
import "./desktop-screens.css";

// Figma "D5 Assistant", answered by Gemini from the saved regulations.

const chips = ["Can I cross WMU lines?", "What is reliable contact?", "What if I lose radio contact?"];

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

export function AssistantPage() {
  const { turns, history } = useAssistant();
  const online = useOnlineStatus();
  const [draft, setDraft] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end", behavior: "smooth" });
  }, [turns]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void ask(draft);
    setDraft("");
    setSelected(null);
  }

  const today = history.filter((h) => isToday(h.createdAt));
  const earlier = history.filter((h) => !isToday(h.createdAt));
  const open = (h: PastQuestion) => {
    setSelected(h.id);
    void openPast(h);
  };

  return (
    <div className="da">
      <aside className="da-history">
        <h2 className="da-history-title">Past questions</h2>
        <Button
          variant="outline"
          size="desk"
          icon="d5-plus.svg"
          className="da-new"
          onClick={() => {
            newConversation();
            setSelected(null);
          }}
        >
          New question
        </Button>

        {history.length === 0 && <p className="d-small-muted">Your questions are saved here.</p>}

        {today.length > 0 && (
          <div className="da-group" style={{ gap: 12 }}>
            <p className="da-group-label">TODAY</p>
            {today.map((h) => (
              <button key={h.id} type="button" className={h.id === selected ? "da-today da-today-selected" : "da-today"} onClick={() => open(h)}>
                <span className="da-today-q">{h.question}</span>
                <span className="da-today-meta">{formatTime(h.createdAt)}</span>
              </button>
            ))}
          </div>
        )}

        {earlier.length > 0 && (
          <div className="da-group" style={{ gap: 14 }}>
            <p className="da-group-label">EARLIER</p>
            {earlier.slice(0, 12).map((h) => (
              <button key={h.id} type="button" className="da-yesterday" onClick={() => open(h)}>
                <Icon name="d5-message-square.svg" size={15} />
                <span>{h.question}</span>
              </button>
            ))}
          </div>
        )}

        <div className="da-spacer" />

        <div className="da-library">
          <Icon name="d5-book-library.svg" size={20} />
          <p className="da-library-title">Ontario · {new Date().getFullYear()}</p>
          <p className="d-small-muted">Answers come from the hunting regulations saved in MapleHunt.</p>
          <a className="da-library-ok" href={REGULATIONS_URL} target="_blank" rel="noreferrer">
            Open the official summary ↗
          </a>
        </div>
      </aside>

      <section className="da-main">
        <div className="da-header">
          <div>
            <h2 className="da-title">Field assistant</h2>
            <p className="dd-muted-13">{online ? "Grounded in the Ontario Hunting Regulations · powered by Gemini" : "No signal · the assistant needs a connection"}</p>
          </div>
          <a href={REGULATIONS_URL} target="_blank" rel="noreferrer" aria-label="Open the hunting regulations">
            <Icon name="d5-book-header.svg" size={24} />
          </a>
        </div>
        <Divider />

        <div className="da-conversation">
          {turns.length === 0 && <p className="da-answer da-answer-preview">Ask about seasons, party hunting rules, WMUs, or what to record after a harvest.</p>}
          {turns.map((turn) => (
            <div key={turn.id} className="da-turn">
              <p className="da-question">{turn.question}</p>
              <div className="da-reply">
                <div className="da-identity">
                  <span className="da-mark">
                    <Icon name="d5-assistant-mark.svg" size={19} />
                  </span>
                  <span className="da-name">MapleHunt</span>
                  <span className="d-small-muted">Regulations summary</span>
                </div>
                <AssistantAnswer turn={turn} size="desktop" />
              </div>
            </div>
          ))}
          <div ref={end} />
        </div>

        <div className="da-composer">
          <p className="da-group-label">ASK ABOUT YOUR HUNT</p>
          <div className="da-chips">
            {chips.map((q) => (
              <button key={q} type="button" className="da-chip" onClick={() => setDraft(q)}>
                <span>{q}</span>
                <Icon name="d5-arrow-up-left.svg" size={14} />
              </button>
            ))}
          </div>
          <form className="da-input" onSubmit={handleSubmit}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask a hunting question…" aria-label="Ask a hunting question" maxLength={500} />
            <button type="submit" className="da-send" aria-label="Send question" disabled={!draft.trim()}>
              <Icon name="d5-arrow-up-dark.svg" size={21} />
            </button>
          </form>
          <p className="da-footnote">Summary only — always check the official regulations.</p>
        </div>
      </section>
    </div>
  );
}
