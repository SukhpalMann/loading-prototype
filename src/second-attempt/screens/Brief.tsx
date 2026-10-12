import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FileText, History, Landmark } from "lucide-react";
import { MERCHANT, fmtClock, fmtDay, inr, inrShort } from "../data";
import type { FailedPayment, Week } from "../data";
import {
  LANES,
  LANE_ORDER,
  codeVsContext,
  oneLinkMissKinds,
  oneLinkMisses,
  triage,
} from "../engine";
import type { LaneId, MissKind, Triage } from "../engine";
import { LaneIcon, LaneTag } from "../ui";
import { MODEL_SCORE, RULE_SCORE } from "../checks/replies/score";

const DOES: Record<LaneId, string> = {
  retry_now: "One link, ten minutes later. No discount.",
  wait_retry: "Held until the bank is back. No discount.",
  do_not_ask: "No payment link. A status note if money is pending.",
  needs_reason: "Another way to pay first. An offer only as a last resort.",
  left_alone: "No message.",
};

// What one link for everyone gets wrong, and the lane that handles each case instead.
const MISS_ROWS: { kind: MissKind; lane: LaneId; lead: string; rest: string }[] = [
  {
    kind: "downtime",
    lane: "wait_retry",
    lead: "Sent while the customer's bank was still down.",
    rest: "The retry fails a second time.",
  },
  {
    kind: "pending",
    lane: "do_not_ask",
    lead: "Asked for payment again after money had left the account.",
    rest: "The customer risks paying twice.",
  },
  {
    kind: "paid",
    lane: "do_not_ask",
    lead: "Sent after the customer had already paid",
    rest: "on a later attempt or as cash on delivery.",
  },
  {
    kind: "risk",
    lane: "left_alone",
    lead: "Chased a payment a risk check had blocked.",
    rest: "",
  },
  {
    kind: "fail_again",
    lane: "needs_reason",
    lead: "Repeated a payment the bank had just declined",
    rest: "for low balance, a limit, or twice with no cause.",
  },
];

type Mode = "today" | "sorted";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

// The sort plays once per visit. Coming back to this step shows the lanes straight away.
let introPlayed = false;

export function Brief({
  week,
  onInspect,
  onReplyTest,
  onNext,
}: {
  week: Week;
  onInspect: (p: FailedPayment) => void;
  onReplyTest: () => void;
  onNext: () => void;
}) {
  const all = useMemo(
    () =>
      week.payments.map((p) => ({
        p,
        t: triage(p, week),
        wrong: oneLinkMissKinds(p, week).length > 0,
      })),
    [week],
  );
  const sorted = useMemo(() => {
    const byLane = new Map<LaneId, { p: FailedPayment; t: Triage }[]>();
    for (const l of LANE_ORDER) byLane.set(l, []);
    for (const row of all) byLane.get(row.t.lane)!.push(row);
    return byLane;
  }, [all]);

  const total = week.payments.length;
  const value = week.payments.reduce((s, p) => s + p.amount, 0);
  const miss = useMemo(() => oneLinkMisses(week), [week]);
  const cvc = useMemo(() => codeVsContext(week), [week]);
  const missCount: Record<MissKind, number> = {
    downtime: miss.intoDowntime,
    pending: miss.pendingAsked,
    paid: miss.alreadyPaid,
    risk: miss.riskChased,
    fail_again: miss.wouldFailAgain,
  };
  const missMax = Math.max(1, ...Object.values(missCount));

  // One reason code, several right answers: where every payment_timed_out ended up.
  const timedOut = useMemo(() => {
    let retry = 0,
      wait = 0,
      hold = 0,
      other = 0;
    for (const { p, t } of all) {
      if (p.error.reason !== "payment_timed_out") continue;
      if (t.lane === "retry_now") retry++;
      else if (t.lane === "wait_retry") wait++;
      else if (t.lane === "do_not_ask") hold++;
      else other++;
    }
    return { retry, wait, hold, other, all: retry + wait + hold + other };
  }, [all]);

  // ----- the sort: every square travels from the one block into its lane -----
  const [mode, setMode] = useState<Mode>(introPlayed ? "sorted" : "today");
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const stageRef = useRef<HTMLDivElement>(null);
  const before = useRef<Map<string, DOMRect> | null>(null);

  const show = useCallback((next: Mode) => {
    introPlayed = true;
    if (next === modeRef.current) return;
    const stage = stageRef.current;
    if (stage) {
      const rects = new Map<string, DOMRect>();
      stage.querySelectorAll<HTMLElement>("[data-pid]").forEach((el) => {
        rects.set(el.dataset["pid"] ?? "", el.getBoundingClientRect());
      });
      before.current = rects;
    }
    setMode(next);
  }, []);

  useIsoLayoutEffect(() => {
    const prev = before.current;
    before.current = null;
    const stage = stageRef.current;
    if (!prev || !stage) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    stage.querySelectorAll<HTMLElement>("[data-pid]").forEach((el) => {
      const from = prev.get(el.dataset["pid"] ?? "");
      if (!from || typeof el.animate !== "function") return;
      const to = el.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      const order = Number(el.dataset["order"] ?? 0);
      el.animate(
        [
          {
            transform: `translate(${dx}px, ${dy}px)`,
            filter: mode === "sorted" ? "saturate(0.1) brightness(1.6)" : "none",
          },
          { transform: "translate(0, 0)", filter: "none" },
        ],
        {
          duration: 640,
          delay: order * 8,
          easing: "cubic-bezier(0.2, 0.85, 0.25, 1)",
          fill: "backwards",
        },
      );
    });
  }, [mode]);

  useEffect(() => {
    if (introPlayed) return;
    const id = window.setTimeout(() => show("sorted"), 1300);
    return () => window.clearTimeout(id);
  }, [show]);

  let order = 0;

  return (
    <div>
      <section className="sa-yard">
        <h1 className="sa-h1">
          Last week {total} customers pressed Pay at {MERCHANT.name.replace(/ /g, "\u00a0")}, and
          the payment failed.
        </h1>
        <p className="sa-lede">
          That is {inrShort(value)} in carts. The simplest recovery rule sends every one of them the
          same payment link. Second Attempt reads why each payment failed and sorts them into four
          lanes. A fifth group gets no message at all, by rule.
        </p>
        <div className="sa-yard__bar">
          <span
            className="sa-seg sa-seg--yard"
            role="group"
            aria-label="How failed payments are handled"
          >
            <button type="button" aria-pressed={mode === "today"} onClick={() => show("today")}>
              One link for all
            </button>
            <button type="button" aria-pressed={mode === "sorted"} onClick={() => show("sorted")}>
              Second Attempt: four lanes
            </button>
          </span>
          <span className="sa-yard__hint">
            Each square is one failed payment. Click one to read its record.
          </span>
        </div>

        <div className="sa-stage" ref={stageRef} data-mode={mode}>
          {mode === "today" ? (
            <div className="sa-slab">
              <div className="sa-slab__tokens">
                {all.map(({ p, t, wrong }, i) => (
                  <button
                    key={p.id}
                    type="button"
                    data-pid={p.id}
                    data-order={i}
                    className={`sa-token ${wrong ? "sa-token--wrong" : "sa-token--plain"}`}
                    title={`${p.customer.label}, ${inr(p.amount)}, ${p.error.reason}`}
                    aria-label={`${p.customer.label}, ${inr(p.amount)}, ${LANES[t.lane].name}`}
                    onClick={() => onInspect(p)}
                  />
                ))}
              </div>
              <div className="sa-slab__say">
                <p className="sa-slab__big">
                  One payment link for all {total}, thirty minutes after the failure.
                </p>
                <p className="sa-slab__sub">
                  {miss.total} of those links go to the wrong situation. The bank is still down, the
                  money has already left the account, the order is already paid, or the same attempt
                  would fail again.
                </p>
                <p className="sa-slab__key">
                  <span>
                    <i className="sa-token sa-token--wrong" /> A link sent into the wrong situation,{" "}
                    {miss.total}
                  </span>
                  <span>
                    <i className="sa-token sa-token--plain" /> The other {total - miss.total}
                  </span>
                </p>
              </div>
            </div>
          ) : (
            <div className="sa-lanes">
              {LANE_ORDER.map((lane) => {
                const rows = sorted.get(lane)!;
                const laneValue = rows.reduce((s, r) => s + r.p.amount, 0);
                return (
                  <section key={lane} className={`sa-col lane--${lane}`}>
                    <header className="sa-col__head">
                      <LaneIcon lane={lane} />
                      <h2 className="sa-col__name">{LANES[lane].name}</h2>
                    </header>
                    <div className="sa-col__figs">
                      <span className="sa-col__count">{rows.length}</span>
                      <span className="sa-col__value">{inr(laneValue)}</span>
                    </div>
                    <div className="sa-col__tokens">
                      {rows.map(({ p, t }) => (
                        <button
                          key={p.id}
                          type="button"
                          data-pid={p.id}
                          data-order={order++}
                          className={`sa-token${lane === "left_alone" ? " sa-token--hollow" : t.basis === "context" ? " sa-token--ctx" : ""}`}
                          title={`${p.customer.label}, ${inr(p.amount)}, ${p.error.reason}`}
                          aria-label={`${p.customer.label}, ${inr(p.amount)}, ${LANES[lane].name}`}
                          onClick={() => onInspect(p)}
                        />
                      ))}
                    </div>
                    <p className="sa-col__rule">{LANES[lane].rule}</p>
                    <p className="sa-col__does">{DOES[lane]}</p>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        {mode === "sorted" ? (
          <div className="sa-yard__key">
            <span>
              <i className="sa-token" /> Sorted by the reason code alone
            </span>
            <span>
              <i className="sa-token sa-token--ctx" /> Needed context beyond the code
            </span>
            <span>
              <i className="sa-token sa-token--hollow" /> No message allowed
            </span>
          </div>
        ) : (
          <div className="sa-yard__key">
            <span>Compared with one rule: a payment link 30 minutes after every failure.</span>
          </div>
        )}
      </section>

      <div className="sa-two">
        <section className="sa-card">
          <h2 className="sa-h2">
            {miss.total} of those {total} links went to the wrong situation
          </h2>
          <ul className="sa-miss">
            {MISS_ROWS.map((row) => (
              <li key={row.kind} className={`lane--${row.lane}`}>
                <span className="sa-num">{missCount[row.kind]}</span>
                <div>
                  <p>
                    <b>{row.lead}</b> {row.rest}
                  </p>
                  <div className="sa-miss__bar">
                    <i style={{ width: `${(missCount[row.kind] / missMax) * 100}%` }} />
                  </div>
                </div>
                <LaneTag lane={row.lane} />
              </li>
            ))}
          </ul>
          <p className="sa-note" style={{ marginTop: 14 }}>
            Compared with one simple rule: a payment link 30 minutes after every failure. These are
            counts of facts in last week's batch, not predictions. A real recovery product may
            already skip some of them, such as orders paid later. The tag names the lane that
            handles each case.
          </p>
        </section>

        <section className="sa-card">
          <h2 className="sa-h2">What Second Attempt read to sort them</h2>
          <div className="sa-signal">
            <div>
              <span className="sa-signal__icon" aria-hidden="true">
                <FileText size={18} />
              </span>
              <div>
                <b>The payment record.</b> Every failed payment carries <code>error_source</code>,{" "}
                <code>error_step</code>, <code>error_reason</code> and a description.
              </div>
            </div>
            <div>
              <span className="sa-signal__icon" aria-hidden="true">
                <Landmark size={18} />
              </span>
              <div>
                <b>Bank downtime, {week.downtimes.length} windows last week.</b>
                {week.downtimes.map((d) => (
                  <div className="sa-down" key={d.id}>
                    <span>{d.label}</span>
                    <span>
                      {fmtDay(d.begin)} {fmtClock(d.begin)} to {fmtClock(d.end)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <span className="sa-signal__icon" aria-hidden="true">
                <History size={18} />
              </span>
              <div>
                <b>What happened next.</b> Whether the amount is pending at the bank, and whether
                the same order was paid later.
              </div>
            </div>
          </div>

          <div className="sa-split">
            <div className="sa-split__bar" aria-hidden="true">
              <i style={{ flexGrow: cvc.code }} />
              <i className="is-ctx" style={{ flexGrow: cvc.context }} />
            </div>
            <p>
              <b>
                {cvc.code} of {cvc.total} could be sorted by the reason code alone. {cvc.context}{" "}
                needed a second fact: the downtime feed, the payment's status, or what happened
                next.
              </b>{" "}
              For example, <code>payment_timed_out</code> appeared {timedOut.all} times under one
              code. {timedOut.retry} could be retried at once, {timedOut.wait} had to wait for a
              bank to come back, and {timedOut.hold} should not be asked again because the money had
              moved or the order was already paid
              {timedOut.other > 0 ? `. ${timedOut.other} went to other lanes` : ""}. All of this is
              rules. A model is proposed only for what rules cannot read: unfamiliar error text and
              customers' replies. In a blind test on {RULE_SCORE.total} replies written by hand, a
              keyword rule missed {RULE_SCORE.missed.length} of the {RULE_SCORE.moneyMoved}{" "}
              customers who said money had left their account. A model missed{" "}
              {MODEL_SCORE.missed.length === 0 ? "none" : MODEL_SCORE.missed.length}.{" "}
              <button type="button" className="sa-linkbtn" onClick={onReplyTest}>
                See the replies
              </button>
              .
            </p>
          </div>
        </section>
      </div>

      <div className="sa-actions">
        <button type="button" className="sa-btn" onClick={onNext}>
          Review the plan
        </button>
        <span className="sa-note">Nothing is sent until you approve it.</span>
      </div>
    </div>
  );
}
