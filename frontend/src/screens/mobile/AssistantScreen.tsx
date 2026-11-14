import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "../../components/ui";
import { ask, useAssistant } from "../../data/assistant";
import { REGULATIONS_URL, suggestedQuestions } from "../../data/constants";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { MobileHeader } from "../../layout/MobileShell";
import { AssistantAnswer } from "../shared/AssistantAnswer";
import "./mobile-screens.css";

// Figma "06 Assistant", answered by Gemini from the saved regulations.

export function AssistantScreen() {
  const { turns } = useAssistant();
  const online = useOnlineStatus();
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end", behavior: "smooth" });
  }, [turns]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void ask(draft);
    setDraft("");
  }

  return (
    <>
      <MobileHeader
        kicker="MAPLEHUNT / REGULATIONS"
        title="Field assistant"
        action={{ icon: "m6-book-white.svg", label: "Open the hunting regulations", onClick: () => window.open(REGULATIONS_URL, "_blank", "noopener") }}
      />
      <div className="m-body ma">
        <div className="ma-conversation">
          <p className="ma-offline" style={online ? undefined : { color: "var(--warn)" }}>
            <Icon name={online ? "m6-download.svg" : "m5-cloud-off.svg"} size={14} />
            {online ? "Answers from the Ontario hunting regulations" : "No signal · the assistant needs signal to answer"}
          </p>

          {turns.length === 0 && <p className="ma-answer ma-answer-preview">Ask about seasons, party hunting, WMUs or what to record after a harvest.</p>}

          {turns.map((turn) => (
            <div key={turn.id} className="ma-conversation">
              <p className="ma-question">{turn.question}</p>
              <div className="ma-reply">
                <div className="ma-identity">
                  <span className="ma-mark">
                    <Icon name="m6-trees-orange.svg" size={16} />
                  </span>
                  <span className="ma-name">MapleHunt</span>
                  <span className="ma-kind">Regulations summary</span>
                </div>
                <AssistantAnswer turn={turn} size="mobile" />
              </div>
            </div>
          ))}
          <div ref={end} />
        </div>

        <div className="ma-composer">
          <p className="ma-suggest-label">ASK ABOUT YOUR HUNT</p>
          <div className="ma-chips">
            {suggestedQuestions.map((q, i) => (
              <button key={q} type="button" className={i === 2 ? "ma-chip ma-chip-wide" : "ma-chip"} onClick={() => setDraft(q)}>
                <span>{q}</span>
                <Icon name="m6-arrow-up-left.svg" size={13} />
              </button>
            ))}
          </div>
          <form className="ma-input" onSubmit={handleSubmit}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask a hunting question…" aria-label="Ask a hunting question" maxLength={500} />
            <button type="submit" className="ma-send" aria-label="Send question" disabled={!draft.trim()}>
              <Icon name="m6-arrow-up-dark.svg" size={21} />
            </button>
          </form>
          <p className="ma-footnote">Summary only — always check the official regulations.</p>
        </div>
      </div>
    </>
  );
}
