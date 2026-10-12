import { useState } from "react";
import type { ReactNode } from "react";
import { fmtClock, fmtDate, fmtDay, inr } from "./data";
import type { FailedPayment, Week } from "./data";
import { LANES, messageFor, triage } from "./engine";
import type { Config, LaneId } from "./engine";

export function LaneTag({ lane }: { lane: LaneId }) {
  return <span className={`sa-tag lane--${lane}`}>{LANES[lane].name}</span>;
}

export function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className="sa-switch"
      onClick={() => onChange(!on)}
    >
      <i aria-hidden="true" />
      {label}
    </button>
  );
}

export function Assumed({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span
      className="sa-assumed"
      title={
        title ??
        "Simulated from stated assumptions, not measured. See Assumptions at the foot of the page."
      }
    >
      {children}
    </span>
  );
}

export function Bubble({
  text,
  incoming,
  time,
}: {
  text: string;
  incoming?: boolean;
  time?: string;
}) {
  return (
    <div className={`sa-bubble${incoming ? " sa-bubble--in" : ""}`}>
      {text}
      {time ? <small>{time}</small> : null}
    </div>
  );
}

export function LanguageToggle({
  hinglish,
  onChange,
}: {
  hinglish: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <span className="sa-seg" role="group" aria-label="Message language">
      <button type="button" aria-pressed={!hinglish} onClick={() => onChange(false)}>
        English
      </button>
      <button type="button" aria-pressed={hinglish} onClick={() => onChange(true)}>
        Hinglish
      </button>
    </span>
  );
}

const CONFIDENCE: Record<string, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence, so it takes the cheapest safe step",
};

export function Inspector({
  payment,
  week,
  cfg,
  onClose,
}: {
  payment: FailedPayment;
  week: Week;
  cfg: Config;
  onClose: () => void;
}) {
  const p = payment;
  const t = triage(p, week);
  const [hinglish, setHinglish] = useState(p.customer.hinglish);
  const sends =
    t.lane === "retry_now" ||
    t.lane === "wait_retry" ||
    t.lane === "needs_reason" ||
    t.variant === "pending";
  const consent = p.customer.optedOut
    ? "Opted out"
    : [p.customer.whatsapp ? "WhatsApp" : null, p.customer.sms ? "SMS" : null]
        .filter(Boolean)
        .join(" and ") || "None on record";
  return (
    <>
      <div className="sa-scrim" onClick={onClose} />
      <aside
        className={`sa-drawer lane--${t.lane}`}
        role="dialog"
        aria-label="Failed payment record"
      >
        <button type="button" className="sa-drawer__close" onClick={onClose}>
          Close
        </button>
        <LaneTag lane={t.lane} />
        <h2 className="sa-h2" style={{ marginTop: 10 }}>
          {p.customer.label}, {inr(p.amount)}
        </h2>
        <p className="sa-note">
          {p.items}. Failed {fmtDay(p.failedAt)} {fmtDate(p.failedAt)}, {fmtClock(p.failedAt)}.
        </p>

        <div className="sa-why">
          <b>Why this lane.</b> {t.why}
          <div className="sa-note" style={{ marginTop: 6 }}>
            {t.basis === "code"
              ? "Sorted by the reason code alone."
              : "The reason code was not enough. Context decided it."}{" "}
            {CONFIDENCE[t.confidence]}.
          </div>
        </div>

        <h3 className="sa-h3" style={{ marginTop: 22 }}>
          What the payment record says
        </h3>
        <div className="sa-kv">
          <div>
            <span>payment id</span>
            <code>{p.id}</code>
          </div>
          <div>
            <span>method</span>
            <span>{p.instrumentLabel}</span>
          </div>
          <div>
            <span>error_source</span>
            <code>{p.error.source}</code>
          </div>
          <div>
            <span>error_step</span>
            <code>{p.error.step}</code>
          </div>
          <div>
            <span>error_reason</span>
            <code>{p.error.reason}</code>
          </div>
          <div>
            <span>error_description</span>
            <span>{p.error.description}</span>
          </div>
          <div>
            <span>failed attempts</span>
            <span>{p.attempts}</span>
          </div>
          <div>
            <span>downtime on record</span>
            <span>
              {t.downtime
                ? `${t.downtime.label}, ${fmtClock(t.downtime.begin)} to ${fmtClock(t.downtime.end)}`
                : "None for this method at that time"}
            </span>
          </div>
          <div>
            <span>status at bank</span>
            <span>
              {p.pendingAtBank ? "Pending: amount debited, not confirmed" : "No debit reported"}
            </span>
          </div>
          <div>
            <span>paid since</span>
            <span>
              {p.paidSince === "no"
                ? "No"
                : p.paidSince === "cod"
                  ? "Yes, as cash on delivery"
                  : "Yes, on a later attempt"}
            </span>
          </div>
          <div>
            <span>consent</span>
            <span>{consent}</span>
          </div>
          <div>
            <span>customer</span>
            <span>
              {p.customer.returning ? "Has bought before" : "First order"}, {p.customer.phone}
            </span>
          </div>
        </div>

        <h3
          className="sa-h3"
          style={{
            marginTop: 22,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          What the customer receives
          {sends ? <LanguageToggle hinglish={hinglish} onChange={setHinglish} /> : null}
        </h3>
        {sends ? (
          <div className="sa-phone">
            <Bubble text={messageFor({ p, t }, cfg, 1, hinglish)} />
            {t.lane === "needs_reason" && p.amount >= cfg.offerMinCart && cfg.discountCapPct > 0 ? (
              <>
                <p className="sa-note" style={{ margin: "10px 2px 6px" }}>
                  A day later, only if still unpaid and only once you approve offers:
                </p>
                <Bubble text={messageFor({ p, t }, cfg, 2, hinglish)} />
              </>
            ) : null}
          </div>
        ) : (
          <p className="sa-note" style={{ marginTop: 8 }}>
            Nothing. {LANES[t.lane].action}
          </p>
        )}
      </aside>
    </>
  );
}
