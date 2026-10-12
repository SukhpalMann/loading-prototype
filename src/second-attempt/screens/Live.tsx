import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  BadgePercent,
  BellOff,
  CalendarClock,
  CircleAlert,
  CircleCheck,
  CircleSlash,
  Hand,
  Hourglass,
  Landmark,
  MessageCircle,
  Pause,
  Play,
  Scale,
  Send,
  ShieldCheck,
  SkipForward,
  Undo2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DAY, MERCHANT, MIN, fmtClock, fmtDate, fmtDay, inr } from "../data";
import type { FailedPayment, Week } from "../data";
import { REPLY_SCRIPT, messageFor } from "../engine";
import type { Config, Item, RunEvent } from "../engine";
import { Assumed, Bubble, LaneTag } from "../ui";

const TICK_MS = 80;
const SIM_PER_TICK = 24 * MIN; // a week plays in about 34 seconds

function stamp(t: number) {
  return `${fmtDay(t)} ${fmtClock(t)}`;
}

const EVENT_ICONS: Partial<Record<RunEvent["kind"], LucideIcon>> = {
  sent: Send,
  held: Hourglass,
  status: ShieldCheck,
  suppressed: CircleSlash,
  left: BellOff,
  holdout: Scale,
  paid: CircleCheck,
  offer_wait: BadgePercent,
  offer_sent: BadgePercent,
  reply: MessageCircle,
  moved: ShieldCheck,
  captured: CircleCheck,
  refunded: Undo2,
  downtime_start: Landmark,
  downtime_end: Landmark,
  paused: Hand,
};

const MOMENT_ICONS: Record<string, LucideIcon> = {
  reply: MessageCircle,
  down: Hourglass,
  up: Send,
  offer: BadgePercent,
  end: CalendarClock,
};

function allowedBy(e: RunEvent, cfg: Config): string {
  switch (e.kind) {
    case "sent":
      return e.lane === "wait_retry"
        ? "Plan approved by Asha. Released when the downtime ended."
        : "Plan approved by Asha. Lane rule, no discount.";
    case "held":
      return "Downtime on record for this bank.";
    case "status":
      return "Plan approved by Asha. Status message, no payment link.";
    case "suppressed":
      return "Hard rule: the order is already paid.";
    case "left":
      return "Hard rule: consent or risk. Cannot be overridden.";
    case "holdout":
      return `Holdout of ${cfg.holdoutPct}%, set by Asha.`;
    case "offer_wait":
      return "Offers need Asha's approval.";
    case "offer_sent":
      return `Offer approved by Asha. ${cfg.discountCapPct}% is inside the ${MERCHANT.couponCap}% coupon cap.`;
    case "reply":
      return "Customer reply, read by the model (scripted in this prototype).";
    case "moved":
      return "Status re-checked after the reply. Link switched off.";
    case "captured":
    case "refunded":
      return "Bank outcome. No action by Second Attempt.";
    case "paused":
      return "Asha stopped all sending.";
    default:
      return "";
  }
}

export function Live({
  week,
  cfg,
  items,
  events,
  clock,
  setClock,
  pausedAt,
  setPausedAt,
  approved,
  offersApprovedAt,
  onApproveOffers,
  onInspect,
  onGoPlan,
  onNext,
}: {
  week: Week;
  cfg: Config;
  items: Item[];
  events: RunEvent[];
  clock: number;
  setClock: Dispatch<SetStateAction<number>>;
  pausedAt: number | null;
  setPausedAt: (t: number | null) => void;
  approved: boolean;
  offersApprovedAt: number | null;
  onApproveOffers: (at: number) => void;
  onInspect: (p: FailedPayment) => void;
  onGoPlan: () => void;
  onNext: () => void;
}) {
  const start = week.start;
  const end = week.start + 7 * DAY;
  const [playing, setPlaying] = useState(false);
  const [view, setView] = useState<"feed" | "audit">("feed");
  const byId = useMemo(() => new Map(items.map((it) => [it.p.id, it])), [items]);
  const replyCase = useMemo(
    () =>
      items.find((it) => it.p.pendingSurfacesLate && it.plannedAt !== null && !it.holdout) ?? null,
    [items],
  );
  const [focusId, setFocusId] = useState<string | null>(null);
  const [offersSkipped, setOffersSkipped] = useState(false);
  const focus = (focusId ? byId.get(focusId) : null) ?? replyCase;

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setClock((c) => {
        const n = c + SIM_PER_TICK;
        if (n >= end) {
          setPlaying(false);
          return end;
        }
        return n;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [playing, end, setClock]);

  const seen = useMemo(() => events.filter((e) => e.t <= clock), [events, clock]);
  const shown = useMemo(
    () =>
      seen
        .filter((e) => e.kind !== "failed")
        .slice(-90)
        .reverse(),
    [seen],
  );

  const tally = useMemo(() => {
    let failed = 0,
      sent = 0,
      notSent = 0,
      waiting = 0;
    for (const e of seen) {
      if (e.kind === "failed") failed++;
      else if (e.kind === "sent" || e.kind === "status" || e.kind === "offer_sent") sent++;
      else if (e.kind === "suppressed" || e.kind === "left" || e.kind === "holdout") notSent++;
      else if (e.kind === "offer_wait") waiting++;
    }
    let held = 0,
      recovered = 0,
      recoveredN = 0,
      blocked = 0,
      exposure = 0;
    for (const it of items) {
      if (
        it.t.lane === "wait_retry" &&
        it.sendAt !== null &&
        it.p.failedAt + 10 * MIN <= clock &&
        it.sendAt > clock
      )
        held++;
      if (
        (it.outcome === "recovered" || it.outcome === "recovered_offer") &&
        it.paidAt !== null &&
        it.paidAt <= clock
      ) {
        recovered += it.p.amount - it.discount;
        recoveredN++;
      }
      if (it.blockedByPause && it.plannedAt !== null && it.plannedAt <= clock) blocked++;
      if (it.offerState === "waiting_approval" && it.offerAt !== null && it.offerAt <= clock)
        exposure += (it.p.amount * cfg.discountCapPct) / 100;
    }
    if (cfg.offersApproved) waiting = 0;
    return { failed, sent, notSent, waiting, held, recovered, recoveredN, blocked, exposure };
  }, [seen, items, clock, cfg]);

  const moments = useMemo(() => {
    const out: {
      key: string;
      at: number;
      label: string;
      text: string;
      focus?: string | undefined;
    }[] = [];
    // The downtime that held the most messages.
    let best: { id: string; n: number } | null = null;
    for (const d of week.downtimes) {
      // Counted from planned times, so the list of moments does not change when sending is stopped.
      const n = items.filter(
        (it) =>
          it.t.downtime?.id === d.id &&
          it.t.lane === "wait_retry" &&
          !it.holdout &&
          it.plannedAt !== null &&
          it.plannedAt > it.p.failedAt + 15 * MIN,
      ).length;
      if (!best || n > best.n) best = { id: d.id, n };
    }
    const d = week.downtimes.find((x) => x.id === best?.id);
    if (d && best && best.n > 0) {
      const lastFail = Math.max(
        ...items.filter((it) => it.t.downtime?.id === d.id).map((it) => it.p.failedAt),
      );
      const heldAt = Math.min(lastFail + 11 * MIN, d.end - MIN);
      out.push({
        key: "down",
        at: heldAt,
        label: stamp(heldAt),
        text: `${best.n} messages held during a downtime on ${d.label}`,
      });
      out.push({
        key: "up",
        at: d.end + 6 * MIN,
        label: stamp(d.end + 6 * MIN),
        text: "the downtime is over and the held messages go out",
      });
    }
    if (replyCase && replyCase.plannedAt !== null)
      out.push({
        key: "reply",
        at: replyCase.plannedAt + 8 * MIN,
        label: stamp(replyCase.plannedAt + 8 * MIN),
        text: `${replyCase.p.customer.label} says the money was already cut`,
        focus: replyCase.p.id,
      });
    const firstOffer = events.find((e) => e.kind === "offer_wait");
    if (firstOffer)
      out.push({
        key: "offer",
        at: firstOffer.t + MIN,
        label: stamp(firstOffer.t + MIN),
        text: "an offer waits for approval",
        focus: firstOffer.id ?? undefined,
      });
    out.sort((a, b) => a.at - b.at);
    out.push({ key: "end", at: end, label: "Sun 11:59 PM", text: "the week ends" });
    return out;
  }, [week, items, events, replyCase, end]);

  if (!approved) {
    return (
      <div>
        <h1 className="sa-h1">Nothing runs until you approve the plan.</h1>
        <p className="sa-lede">
          Second Attempt has sorted last week's failed payments, but it has not contacted anyone.
          Review the lanes and your rules first.
        </p>
        <div className="sa-actions">
          <button type="button" className="sa-btn" onClick={onGoPlan}>
            Go to the plan
          </button>
        </div>
      </div>
    );
  }

  const pct = (t: number) => `${Math.max(0, Math.min(100, ((t - start) / (end - start)) * 100))}%`;
  const shownClock = Math.min(clock, end - MIN);
  const showOffers = tally.waiting > 0 && !cfg.offersApproved && !offersSkipped;

  return (
    <div>
      <h1 className="sa-h1">The week of {fmtDate(start)}, as it happens.</h1>
      <p className="sa-lede">
        A simulated week on synthetic payments. Play it, or jump to a moment. The three no-discount
        lanes act on their own. Offers stop and ask.
      </p>

      <div className="sa-console">
        <div className="sa-livebar">
          <div className="sa-clock">
            {fmtDay(shownClock)} {fmtDate(shownClock)}, {fmtClock(shownClock)}
          </div>
          <button
            type="button"
            className="sa-btn sa-btn--quiet"
            onClick={() => {
              if (clock >= end) setClock(start);
              setPlaying((v) => !v);
            }}
          >
            {playing ? (
              <Pause size={16} aria-hidden="true" />
            ) : (
              <Play size={16} aria-hidden="true" />
            )}
            {playing ? "Hold time" : clock >= end ? "Play again" : "Play the week"}
          </button>
          <button
            type="button"
            className="sa-btn sa-btn--quiet"
            onClick={() => {
              setPlaying(false);
              setClock(end);
            }}
          >
            <SkipForward size={16} aria-hidden="true" />
            Skip to Sunday night
          </button>
          {clock >= end ? (
            <button type="button" className="sa-btn" onClick={onNext}>
              See what it achieved
            </button>
          ) : null}
          <span style={{ marginLeft: "auto" }} />
          {pausedAt === null ? (
            <button
              type="button"
              className="sa-btn sa-btn--stop"
              onClick={() => setPausedAt(clock)}
            >
              <Hand size={16} aria-hidden="true" />
              Stop all sending
            </button>
          ) : (
            <button type="button" className="sa-btn" onClick={() => setPausedAt(null)}>
              <Play size={16} aria-hidden="true" />
              Resume sending
            </button>
          )}
        </div>

        {pausedAt !== null ? (
          <div className="sa-banner" role="status">
            <span>
              Sending stopped at {stamp(pausedAt)}. {tally.blocked}{" "}
              {tally.blocked === 1 ? "message is" : "messages are"} being held back. Customers who
              already got a link can still pay.
            </span>
          </div>
        ) : null}

        <div className="sa-week">
          <div
            className="sa-week__track"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setPlaying(false);
              setClock(start + ((e.clientX - r.left) / r.width) * (end - start));
            }}
            role="slider"
            aria-label="Time in the week"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(((clock - start) / (end - start)) * 100)}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") setClock((c) => Math.min(end, c + 60 * MIN));
              if (e.key === "ArrowLeft") setClock((c) => Math.max(start, c - 60 * MIN));
            }}
          >
            <div className="sa-week__days">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i}>
                  {fmtDay(start + i * DAY)} {fmtDate(start + i * DAY)}
                </div>
              ))}
            </div>
            {week.downtimes.map((d) => (
              <div
                key={d.id}
                className="sa-week__down"
                style={{ left: pct(d.begin), width: `calc(${pct(d.end)} - ${pct(d.begin)})` }}
                title={`Downtime on ${d.label}, ${stamp(d.begin)} to ${fmtClock(d.end)}`}
              />
            ))}
            {items.map((it) => (
              <div
                key={it.p.id}
                className={`sa-week__dot lane--${it.t.lane}`}
                style={{ left: pct(it.p.failedAt) }}
              />
            ))}
            <div className="sa-week__done" style={{ width: pct(clock) }} />
            <div className="sa-week__head" style={{ left: pct(clock) }} />
          </div>
          <p className="sa-note" style={{ marginTop: 6 }}>
            Amber bars are bank downtimes. Each tick is a failed payment, in its lane's colour.
            Click anywhere to move time.
          </p>
        </div>
      </div>

      <div className="sa-moments">
        {moments.map((m) => (
          <button
            key={m.key}
            type="button"
            className={`sa-moment sa-moment--${m.key}`}
            aria-pressed={clock === m.at}
            onClick={() => {
              setPlaying(false);
              setClock(m.at);
              if (m.focus) setFocusId(m.focus);
            }}
          >
            <MomentIcon k={m.key} />
            <span>
              <b>{m.label}</b> {m.text}
            </span>
          </button>
        ))}
      </div>

      <div className="sa-tally">
        <div>
          <i className="sa-tally__icon" aria-hidden="true">
            <CircleAlert size={18} />
          </i>
          <span className="sa-num">{tally.failed}</span>
          <span className="sa-tally__label">payments failed so far</span>
        </div>
        <div>
          <i className="sa-tally__icon" aria-hidden="true">
            <Send size={18} />
          </i>
          <span className="sa-num">{tally.sent}</span>
          <span className="sa-tally__label">messages sent</span>
        </div>
        <div className="lane--wait_retry">
          <i className="sa-tally__icon" aria-hidden="true">
            <Hourglass size={18} />
          </i>
          <span className="sa-num">{tally.held}</span>
          <span className="sa-tally__label">held until a bank is back</span>
        </div>
        <div className="lane--left_alone">
          <i className="sa-tally__icon" aria-hidden="true">
            <BellOff size={18} />
          </i>
          <span className="sa-num">{tally.notSent}</span>
          <span className="sa-tally__label">
            not messaged on purpose: already paid, held out, no consent, or risk
          </span>
        </div>
        <div className="lane--retry_now">
          <i className="sa-tally__icon" aria-hidden="true">
            <CircleCheck size={18} />
          </i>
          <span className="sa-num">
            <Assumed>{inr(tally.recovered)}</Assumed>
          </span>
          <span className="sa-tally__label">
            paid after a message, from {tally.recoveredN}{" "}
            {tally.recoveredN === 1 ? "customer" : "customers"}
          </span>
        </div>
      </div>

      <div className="sa-live">
        <div className="sa-feed">
          <div className="sa-feed__head">
            <span className="sa-seg" role="group" aria-label="View">
              <button type="button" aria-pressed={view === "feed"} onClick={() => setView("feed")}>
                What happened
              </button>
              <button
                type="button"
                aria-pressed={view === "audit"}
                onClick={() => setView("audit")}
              >
                Audit trail
              </button>
            </span>
            <span className="sa-note">Newest first</span>
          </div>
          {shown.length === 0 ? (
            <div className="sa-empty">
              The week has not started. Press Play the week, or jump to a moment above.
            </div>
          ) : view === "feed" ? (
            shown.map((e, i) => {
              const system = e.kind === "downtime_start" || e.kind === "downtime_end";
              const cls = `sa-ev${e.lane ? ` lane--${e.lane}` : ""}${system ? " sa-ev--system" : ""}${e.kind === "paused" ? " sa-ev--stop" : ""}${e.kind === "paid" ? " sa-ev--paid" : ""}`;
              return (
                <button
                  key={`${e.t}-${e.id}-${e.kind}-${i}`}
                  type="button"
                  className={cls}
                  onClick={() => {
                    if (e.id && byId.has(e.id)) setFocusId(e.id);
                  }}
                >
                  <EventIcon kind={e.kind} />
                  <time>{stamp(e.t)}</time>
                  <span>{e.kind === "paid" ? <b>{e.text}</b> : e.text}</span>
                </button>
              );
            })
          ) : (
            <table className="sa-audit">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Allowed by</th>
                </tr>
              </thead>
              <tbody>
                {shown
                  .filter(
                    (e) =>
                      e.kind !== "paid" && e.kind !== "downtime_start" && e.kind !== "downtime_end",
                  )
                  .map((e, i) => (
                    <tr key={`${e.t}-${e.id}-${e.kind}-${i}`}>
                      <td style={{ whiteSpace: "nowrap" }}>{stamp(e.t)}</td>
                      <td>{e.text}</td>
                      <td>{allowedBy(e, cfg)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>

        <div>
          {showOffers ? (
            <div className="sa-side sa-side--ask">
              <h3 className="sa-h3">
                {tally.waiting} {tally.waiting === 1 ? "offer is" : "offers are"} waiting for you
              </h3>
              <p className="sa-note" style={{ marginTop: 6 }}>
                {tally.waiting === 1 ? "This customer" : "These customers"} did not pay after being
                shown other ways to pay. An offer of {cfg.discountCapPct}% would cost at most{" "}
                {inr(Math.round(tally.exposure))} so far.
              </p>
              <div className="sa-actions" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="sa-btn sa-btn--small"
                  onClick={() => onApproveOffers(clock)}
                >
                  Approve offers
                </button>
                <button
                  type="button"
                  className="sa-btn sa-btn--quiet sa-btn--small"
                  onClick={() => setOffersSkipped(true)}
                >
                  Not this week
                </button>
              </div>
            </div>
          ) : null}
          {cfg.offersApproved && offersApprovedAt !== null ? (
            <div className="sa-side">
              <p className="sa-note">
                Offers approved by Asha at {stamp(Math.min(offersApprovedAt, end - MIN))}. Cap{" "}
                {cfg.discountCapPct}%.
              </p>
            </div>
          ) : null}

          <div className="sa-side">
            {focus ? (
              <Thread it={focus} clock={clock} cfg={cfg} onInspect={onInspect} />
            ) : (
              <p className="sa-note">Click any line in the feed to see that customer's messages.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EventIcon({ kind }: { kind: RunEvent["kind"] }) {
  const Icon = EVENT_ICONS[kind];
  return (
    <i className="sa-ev__icon" aria-hidden="true">
      {Icon ? <Icon size={15} /> : null}
    </i>
  );
}

function MomentIcon({ k }: { k: string }) {
  const Icon = MOMENT_ICONS[k];
  return (
    <i className="sa-moment__icon" aria-hidden="true">
      {Icon ? <Icon size={16} /> : null}
    </i>
  );
}

function Thread({
  it,
  clock,
  cfg,
  onInspect,
}: {
  it: Item;
  clock: number;
  cfg: Config;
  onInspect: (p: FailedPayment) => void;
}) {
  const p = it.p;
  const sent = it.sendAt !== null && it.sendAt <= clock;
  const replyAt = it.movedByReply && it.sendAt !== null ? it.sendAt + 6 * MIN : null;
  const offerSent = it.offerState === "sent" && it.offerAt !== null && it.offerAt <= clock;
  const paid =
    (it.outcome === "recovered" || it.outcome === "recovered_offer" || it.outcome === "organic") &&
    it.paidAt !== null &&
    it.paidAt <= clock;
  const settled =
    (it.outcome === "captured" || it.outcome === "refunded") &&
    it.paidAt !== null &&
    it.paidAt <= clock;
  const lane =
    it.movedByReply && replyAt !== null && replyAt + MIN <= clock ? it.finalLane : it.t.lane;
  let quiet: string | null = null;
  if (!sent) {
    if (it.holdout) quiet = `${p.customer.label} is in the holdout group, so no message goes out.`;
    else if (it.t.lane === "left_alone" || it.t.variant === "paid")
      quiet = `No message. ${it.t.why}`;
    else if (it.blockedByPause) quiet = "Held back because sending is stopped.";
    else if (p.failedAt > clock)
      quiet = "This payment has not failed yet at this point in the week.";
    else if (it.t.lane === "wait_retry")
      quiet = `Held until the downtime on ${it.t.downtime?.label ?? "the bank"} ends.`;
    else quiet = "Nothing sent yet.";
  }
  return (
    <div>
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}
      >
        <LaneTag lane={lane} />
        <button
          type="button"
          className="sa-btn sa-btn--quiet sa-btn--small"
          onClick={() => onInspect(p)}
        >
          Open record
        </button>
      </div>
      <h3 className="sa-h3" style={{ marginTop: 10 }}>
        {p.customer.label}, {inr(p.amount)}
      </h3>
      <p className="sa-note">
        Failed {fmtDay(p.failedAt)} {fmtClock(p.failedAt)} on {p.instrumentLabel}.
      </p>
      {quiet ? (
        <p className="sa-note" style={{ marginTop: 10 }}>
          {quiet}
        </p>
      ) : (
        <div className="sa-phone">
          <Bubble text={messageFor(it, cfg, 1)} time={fmtClock(it.sendAt!)} />
          {replyAt !== null && replyAt <= clock ? (
            <Bubble incoming text={REPLY_SCRIPT.customer(p.amount)} time={fmtClock(replyAt)} />
          ) : null}
          {replyAt !== null && replyAt + MIN <= clock ? (
            <Bubble text={REPLY_SCRIPT.agent(p.amount)} time={fmtClock(replyAt + MIN)} />
          ) : null}
          {offerSent ? <Bubble text={messageFor(it, cfg, 2)} time={fmtClock(it.offerAt!)} /> : null}
        </div>
      )}
      {replyAt !== null && replyAt + MIN <= clock ? (
        <p className="sa-note" style={{ marginTop: 10 }}>
          The first sort was wrong: the debit could not be seen when the payment was sorted. The
          reply was read, the link switched off while the payment is checked, and Asha told. This
          exchange is scripted. In English: "{REPLY_SCRIPT.agentEnglish(p.amount)}"
        </p>
      ) : null}
      {paid ? (
        <p className="sa-approved" style={{ marginTop: 10 }}>
          Paid {inr(p.amount - it.discount)} at {fmtDay(it.paidAt!)} {fmtClock(it.paidAt!)}.
        </p>
      ) : null}
      {settled ? (
        <p className="sa-note" style={{ marginTop: 10 }}>
          {it.outcome === "captured"
            ? "The pending amount cleared and the order was confirmed. Nobody paid twice."
            : "The pending amount did not clear and returns automatically."}
        </p>
      ) : null}
    </div>
  );
}
