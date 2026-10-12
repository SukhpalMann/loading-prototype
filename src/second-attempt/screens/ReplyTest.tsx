import { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { ANSWER_KEY } from "../checks/replies/key";
import { MODEL_ANSWERS } from "../checks/replies/model-answers";
import { REPLIES } from "../checks/replies/replies";
import { MODEL_SCORE, RULE_ANSWERS, RULE_SCORE } from "../checks/replies/score";

// The blind reply test, shown as it was scored. Nothing here is computed by a model at run
// time: the replies, both readers' answers and the key are fixed files in checks/replies.

type Verdict = "caught" | "missed" | "alarm" | "clear";

function judge(truth: "D" | "N", said: "D" | "N"): Verdict {
  if (truth === "D") return said === "D" ? "caught" : "missed";
  return said === "D" ? "alarm" : "clear";
}

const LABEL: Record<Verdict, string> = {
  caught: "Caught",
  missed: "Missed",
  alarm: "False alarm",
  clear: "Right",
};

function Mark({ v }: { v: Verdict }) {
  const wrong = v === "missed" || v === "alarm";
  return (
    <span className={`sa-rt__mark sa-rt__mark--${wrong ? v : "ok"}`}>
      {wrong ? <X size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
      {LABEL[v]}
    </span>
  );
}

const REPO_FOLDER =
  "https://github.com/SukhpalMann/loading-prototype/tree/main/src/second-attempt/checks/replies";

export function ReplyTest({ onClose }: { onClose: () => void }) {
  const [all, setAll] = useState(false);
  const rows = useMemo(
    () =>
      REPLIES.map((text, i) => {
        const truth = ANSWER_KEY[i] ?? "N";
        const model = MODEL_ANSWERS[i];
        return {
          n: i + 1,
          text,
          truth,
          rule: judge(truth, RULE_ANSWERS[i] ?? "N"),
          model: judge(truth, model?.answer ?? "N"),
          reading: model?.why ?? "",
        };
      }),
    [],
  );
  // The costly mistakes come first: a debit report the rule did not see.
  const wrong = useMemo(
    () => [...rows.filter((r) => r.rule === "missed"), ...rows.filter((r) => r.rule === "alarm")],
    [rows],
  );
  const shown = all ? rows : wrong;

  return (
    <div className="sa-modal" role="dialog" aria-label="The reply test" onClick={onClose}>
      <div className="sa-modal__box sa-modal__box--wide" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="sa-drawer__close" onClick={onClose}>
          Close
        </button>
        <h2 className="sa-h2">Can a keyword rule read what customers write back?</h2>
        <p>
          Second Attempt asks a customer to reply if money has left their account. One such reply
          must switch the payment link off. Reading these replies is the one job proposed for a
          model, so I tested whether a keyword rule would do it as well.
        </p>

        <div className="sa-rt__scores">
          <div className="sa-rt__score">
            <span className="sa-rt__who">Keyword rule</span>
            <span className="sa-rt__big">
              <b className="sa-num">
                {RULE_SCORE.correct} of {RULE_SCORE.total}
              </b>{" "}
              right
            </span>
            <span className="sa-rt__sub">
              Missed <b className="is-bad">{RULE_SCORE.missed.length}</b> of the{" "}
              {RULE_SCORE.moneyMoved} replies that said money had moved. Raised{" "}
              <b className="is-bad">{RULE_SCORE.falseAlarms.length}</b> false alarms.
            </span>
          </div>
          <div className="sa-rt__score">
            <span className="sa-rt__who">Language model</span>
            <span className="sa-rt__big">
              <b className="sa-num">
                {MODEL_SCORE.correct} of {MODEL_SCORE.total}
              </b>{" "}
              right
            </span>
            <span className="sa-rt__sub">
              {MODEL_SCORE.missed.length === 0
                ? "Missed none."
                : `Missed ${MODEL_SCORE.missed.length}.`}{" "}
              {MODEL_SCORE.falseAlarms.length === 0
                ? "No false alarms."
                : `Raised ${MODEL_SCORE.falseAlarms.length} false alarms.`}{" "}
              The answers came from Claude in the build session, from a fixed prompt.
            </span>
          </div>
        </div>
        <p className="sa-note">
          A miss is the costly mistake: the link stays on for a customer who has already been
          debited. A false alarm switches off a link that could have stayed on.
        </p>

        <div className="sa-rt__bar">
          <span className="sa-seg" role="group" aria-label="Replies shown">
            <button type="button" aria-pressed={!all} onClick={() => setAll(false)}>
              The {wrong.length} the rule got wrong
            </button>
            <button type="button" aria-pressed={all} onClick={() => setAll(true)}>
              All {rows.length}
            </button>
          </span>
          <span className="sa-note">The grey line is how the model read each reply.</span>
        </div>

        <div className="sa-rt__scroll">
          <table className="sa-rt__table">
            <thead>
              <tr>
                <th>#</th>
                <th>What the customer wrote</th>
                <th>Money moved?</th>
                <th>Keyword rule</th>
                <th>Model</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.n}>
                  <td>{r.n}</td>
                  <td>
                    <span className="sa-rt__text">{r.text}</span>
                    <span className="sa-rt__reading">{r.reading}</span>
                  </td>
                  <td>{r.truth === "D" ? "Yes" : "No"}</td>
                  <td>
                    <Mark v={r.rule} />
                  </td>
                  <td>
                    <Mark v={r.model} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p>
          <b>How the test was run.</b> The keyword rule and the model's prompt were fixed and
          committed before any reply existed. I then wrote {RULE_SCORE.total} replies by hand, as a
          customer answering the retry message, in English, Hindi and Hinglish. I kept my answer key
          back until both readers' answers were committed. The commit history shows that order.
        </p>
        <p>
          <b>What it does not show.</b> I wrote the replies to include hard cases: a negation, a
          corrected typo, a balance that fell by the order amount, a payment made another way. So
          the test shows that a gap exists, not how large it is in real traffic. The model's answers
          came from Claude in the build session, working from the fixed prompt, not from a call made
          by this prototype. A cautious first version would switch the link off when either reader
          says money moved.
        </p>
        <p>
          The rule, the prompt, the replies and both sets of answers are in the repository, under{" "}
          <a href={REPO_FOLDER} target="_blank" rel="noreferrer">
            checks/replies
          </a>
          .
        </p>
      </div>
    </div>
  );
}
