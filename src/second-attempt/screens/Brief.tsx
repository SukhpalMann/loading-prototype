import { useMemo } from "react";
import { MERCHANT, fmtClock, fmtDay, inr, inrShort } from "../data";
import type { FailedPayment, Week } from "../data";
import { LANES, LANE_ORDER, codeVsContext, oneLinkMisses, triage } from "../engine";
import type { LaneId, Triage } from "../engine";

const DOES: Record<LaneId, string> = {
  retry_now: "One link, ten minutes later. No discount.",
  wait_retry: "Held until the bank is back. No discount.",
  do_not_ask: "No payment link. A status note if money is pending.",
  needs_reason: "Another way to pay first. An offer only as a last resort.",
  left_alone: "No message.",
};

export function Brief({
  week,
  onInspect,
  onNext,
}: {
  week: Week;
  onInspect: (p: FailedPayment) => void;
  onNext: () => void;
}) {
  const sorted = useMemo(() => {
    const byLane = new Map<LaneId, { p: FailedPayment; t: Triage }[]>();
    for (const l of LANE_ORDER) byLane.set(l, []);
    for (const p of week.payments) {
      const t = triage(p, week);
      byLane.get(t.lane)!.push({ p, t });
    }
    return byLane;
  }, [week]);

  const total = week.payments.length;
  const value = week.payments.reduce((s, p) => s + p.amount, 0);
  const miss = useMemo(() => oneLinkMisses(week), [week]);
  const cvc = useMemo(() => codeVsContext(week), [week]);

  const timedOut = useMemo(() => {
    let customer = 0,
      bank = 0;
    for (const p of week.payments) {
      if (p.error.reason !== "payment_timed_out") continue;
      const t = triage(p, week);
      if (t.variant === "slip") customer++;
      else if (t.variant === "downtime" || t.variant === "technical") bank++;
    }
    return { customer, bank, all: customer + bank };
  }, [week]);

  return (
    <div>
      <h1 className="sa-h1">
        Last week {total} customers tried to pay {MERCHANT.name} and could not.
      </h1>
      <p className="sa-lede">
        That is {inrShort(value)} in carts where the customer pressed Pay, failed, and left. Today
        each of them gets the same payment link. Second Attempt reads why each payment failed and
        sorts them into four lanes.
      </p>

      <div className="sa-board">
        {LANE_ORDER.map((lane) => {
          const rows = sorted.get(lane)!;
          const laneValue = rows.reduce((s, r) => s + r.p.amount, 0);
          return (
            <section key={lane} className={`sa-lane lane--${lane}`}>
              <div className="sa-lane__head">
                <h2 className="sa-lane__name">{LANES[lane].name}</h2>
                <p className="sa-lane__rule">{LANES[lane].rule}</p>
              </div>
              <div className="sa-lane__tokens">
                {rows.map(({ p, t }) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`sa-token${lane === "left_alone" ? " sa-token--hollow" : t.basis === "context" ? " sa-token--ctx" : ""}`}
                    title={`${p.customer.label}, ${inr(p.amount)}, ${p.error.reason}`}
                    aria-label={`${p.customer.label}, ${inr(p.amount)}, ${LANES[lane].name}`}
                    onClick={() => onInspect(p)}
                  />
                ))}
              </div>
              <div className="sa-lane__sum">
                <div className="sa-lane__count">{rows.length}</div>
                <div className="sa-lane__value">{inr(laneValue)}</div>
                <div className="sa-lane__does">{DOES[lane]}</div>
              </div>
            </section>
          );
        })}
        <div className="sa-board__key">
          <span>
            <i className="sa-token" /> Sorted by the reason code alone
          </span>
          <span>
            <i className="sa-token sa-token--ctx" /> Needed context beyond the code
          </span>
          <span>
            <i className="sa-token sa-token--hollow" /> No message allowed
          </span>
          <span>Each square is one failed payment. Click one to read its record.</span>
        </div>
      </div>

      <div className="sa-two">
        <section>
          <h2 className="sa-h2">
            {miss.total} of those {total} links went to the wrong situation
          </h2>
          <ul className="sa-list">
            <li>
              <span className="sa-num">{miss.intoDowntime}</span>
              <p>
                <b>Sent while the customer's bank was still down.</b> The retry fails a second time.
              </p>
            </li>
            <li>
              <span className="sa-num">{miss.pendingAsked}</span>
              <p>
                <b>Asked for payment again after money had left the account.</b> The customer risks
                paying twice.
              </p>
            </li>
            <li>
              <span className="sa-num">{miss.alreadyPaid}</span>
              <p>
                <b>Sent after the customer had already paid</b> on a later attempt or as cash on
                delivery.
              </p>
            </li>
            <li>
              <span className="sa-num">{miss.riskChased}</span>
              <p>
                <b>Chased a payment a risk check had blocked.</b>
              </p>
            </li>
            <li>
              <span className="sa-num">{miss.wouldFailAgain}</span>
              <p>
                <b>Repeated a payment the bank had just declined</b> for low balance, a limit, or
                twice with no cause.
              </p>
            </li>
          </ul>
          <p className="sa-note" style={{ marginTop: 10 }}>
            Compared with one rule: a payment link 30 minutes after every failure. These are counts
            of facts in last week's batch, not predictions.
          </p>
        </section>

        <section>
          <h2 className="sa-h2">What Second Attempt read to sort them</h2>
          <div className="sa-signal">
            <div>
              <b>The payment record.</b> Every failed payment carries <code>error_source</code>,{" "}
              <code>error_step</code>, <code>error_reason</code> and a description.
            </div>
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
            <div>
              <b>What happened next.</b> Whether the amount is pending at the bank, and whether the
              same order was paid later.
            </div>
            <div>
              <b>
                {cvc.code} of {cvc.total} could be sorted by the reason code alone. {cvc.context}{" "}
                needed context.
              </b>{" "}
              For example, <code>payment_timed_out</code> appeared {timedOut.all} times:{" "}
              {timedOut.customer} slow customers and {timedOut.bank} bank faults, under one code.
            </div>
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
