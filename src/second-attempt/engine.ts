// Second Attempt: the policy (triage and guardrails) and a simulated run.
// The triage below is deterministic rules. Rules and verified payment status decide every
// action. The role proposed for a language model is narrower: reading unfamiliar bank error
// text and customers' free-text replies, and handing structured facts to these rules. Here
// those cases are written as explicit checks so the prototype is reproducible.
// Outcomes are SIMULATED from the assumptions in ASSUMPTIONS. They are not findings.

import {
  DAY,
  HOUR,
  MIN,
  MERCHANT,
  fmtClock,
  fmtDayClock,
  inr,
  istHour,
  startOfIstDay,
} from "./data";
import type { Cause, Downtime, FailedPayment, Week } from "./data";

export type LaneId = "retry_now" | "wait_retry" | "do_not_ask" | "needs_reason" | "left_alone";
export const RECOVERY_LANES: LaneId[] = ["retry_now", "wait_retry", "needs_reason"];
export const LANE_ORDER: LaneId[] = [
  "retry_now",
  "wait_retry",
  "do_not_ask",
  "needs_reason",
  "left_alone",
];

export const LANES: Record<
  LaneId,
  { name: string; rule: string; action: string; incentive: string }
> = {
  retry_now: {
    name: "Retry now",
    rule: "The cause has passed: a wrong OTP, a timeout, a cancel, or a brief technical fault.",
    action: "One message with a payment link, ten minutes after the failure.",
    incentive: "No discount",
  },
  wait_retry: {
    name: "Wait, then retry",
    rule: "The customer's bank or UPI handle was down when they paid.",
    action: "Hold the message. Send it when the downtime ends, with working methods first.",
    incentive: "No discount",
  },
  do_not_ask: {
    name: "Do not ask again",
    rule: "Money may already have moved, or the customer has since paid another way.",
    action: "No payment link. A status message if the amount is pending at the bank.",
    incentive: "No discount",
  },
  needs_reason: {
    name: "Needs a reason",
    rule: "The same attempt would fail again: low balance, a limit, or repeated declines.",
    action: "Offer another way to pay. An offer only if that fails, and only with approval.",
    incentive: "Offer as a last resort",
  },
  left_alone: {
    name: "Left alone",
    rule: "No consent on record, opted out, or blocked by a risk check.",
    action: "No message at all.",
    incentive: "Nothing sent",
  },
};

export interface Triage {
  lane: LaneId;
  variant:
    | "slip"
    | "technical"
    | "downtime"
    | "pending"
    | "paid"
    | "funds"
    | "declined_repeat"
    | "declined_once"
    | "opted_out"
    | "no_consent"
    | "risk";
  why: string;
  basis: "code" | "context";
  confidence: "high" | "medium" | "low";
  downtime: Downtime | null;
}

export function findDowntime(p: FailedPayment, downtimes: Downtime[]): Downtime | null {
  for (const d of downtimes) {
    if (
      d.method === p.method &&
      d.instrument === p.instrument &&
      p.failedAt >= d.begin - 5 * MIN &&
      p.failedAt <= d.end + 5 * MIN
    )
      return d;
  }
  return null;
}

export function triage(p: FailedPayment, week: Week): Triage {
  const dt = findDowntime(p, week.downtimes);
  const base = { downtime: dt };
  // Hard stops come first and are never left to judgment.
  if (p.customer.optedOut)
    return {
      ...base,
      lane: "left_alone",
      variant: "opted_out",
      why: "The customer has opted out of messages.",
      basis: "code",
      confidence: "high",
    };
  if (!p.customer.whatsapp && !p.customer.sms)
    return {
      ...base,
      lane: "left_alone",
      variant: "no_consent",
      why: "No consent on record for WhatsApp or SMS.",
      basis: "code",
      confidence: "high",
    };
  if (p.riskFlag)
    return {
      ...base,
      lane: "left_alone",
      variant: "risk",
      why: "Blocked by a risk check. Chasing it would invite the payment the check stopped.",
      basis: "code",
      confidence: "high",
    };
  if (p.pendingAtBank)
    return {
      ...base,
      lane: "do_not_ask",
      variant: "pending",
      why: "The amount is marked as pending. Asking again risks a second debit.",
      basis: "context",
      confidence: "high",
    };
  if (p.paidSince !== "no")
    return {
      ...base,
      lane: "do_not_ask",
      variant: "paid",
      why:
        p.paidSince === "cod"
          ? "The customer has since placed the same order as cash on delivery."
          : "A later attempt on the same order succeeded.",
      basis: "context",
      confidence: "high",
    };

  const reason = p.error.reason;
  if (dt) {
    const sharedCode = reason === "payment_timed_out";
    return {
      ...base,
      lane: "wait_retry",
      variant: "downtime",
      why: sharedCode
        ? `Reason code payment_timed_out usually means a slow customer. Here there was a downtime on ${dt.label} at the time, so the bank failed, not the customer.`
        : `Downtime on ${dt.label} from ${fmtClock(dt.begin)} to ${fmtClock(dt.end)}. A link sent before it ends fails again.`,
      // The reason code never says a downtime is still running. The downtime feed does.
      basis: "context",
      confidence: "high",
    };
  }
  if (reason === "insufficient_funds")
    return {
      ...base,
      lane: "needs_reason",
      variant: "funds",
      why: "The bank reported low balance. The same payment would fail again today.",
      basis: "code",
      confidence: "high",
    };
  if (reason === "gateway_technical_error" || reason === "bank_technical_error")
    return {
      ...base,
      lane: "retry_now",
      variant: "technical",
      why: "A technical fault on the payment side, with no downtime on record now. A retry should work.",
      basis: "code",
      confidence: "high",
    };
  if (
    reason === "incorrect_otp" ||
    reason === "payment_cancelled" ||
    reason === "payment_collect_request_expired"
  )
    return {
      ...base,
      lane: "retry_now",
      variant: "slip",
      why: "The customer slipped at the last step. Nothing is wrong with the bank or the account.",
      basis: "code",
      confidence: "high",
    };
  if (reason === "payment_timed_out") {
    if (/downtime/i.test(p.error.description))
      return {
        ...base,
        lane: "retry_now",
        variant: "technical",
        why: "The description points to a bank-side fault, but no downtime is on record for this bank now. Treat as a brief technical fault.",
        basis: "context",
        confidence: "medium",
      };
    return {
      ...base,
      lane: "retry_now",
      variant: "slip",
      why: "Timed out with no downtime on record for this bank, so the customer ran out of time.",
      basis: "context",
      confidence: "medium",
    };
  }
  // payment_declined and payment_failed carry no cause at all.
  if (p.attempts >= 2)
    return {
      ...base,
      lane: "needs_reason",
      variant: "declined_repeat",
      why: `Declined ${p.attempts} times with no cause given. Another identical try is unlikely to work.`,
      basis: "context",
      confidence: "medium",
    };
  return {
    ...base,
    lane: "retry_now",
    variant: "declined_once",
    why: "Declined once with no cause given. The cheapest safe step is one retry with other methods shown first.",
    basis: "context",
    confidence: "low",
  };
}

// ---------- guardrails the merchant controls ----------

export interface Config {
  holdoutPct: number; // share of recoverable failed payers who get no message, to measure lift
  discountCapPct: number; // ceiling for offers, never above the merchant's own coupon cap
  offerMinCart: number; // offers only above this cart value
  quietHours: boolean; // no messages between 10:30 PM and 8 AM
  lanesOn: Record<"retry_now" | "wait_retry" | "do_not_ask" | "needs_reason", boolean>;
  offersApproved: boolean; // offers always wait for this
}

export const DEFAULT_CONFIG: Config = {
  holdoutPct: 10,
  discountCapPct: MERCHANT.couponCap,
  offerMinCart: 1500,
  quietHours: true,
  lanesOn: { retry_now: true, wait_retry: true, do_not_ask: true, needs_reason: true },
  offersApproved: false,
};

// ---------- assumptions behind the simulated outcomes ----------
// None of these rates is measured. They exist so the prototype can show what a result
// screen would look like. Measuring them per lane is the first thing to test.

// A rate table lists only the causes it covers. A missing cause falls back to the next table.
type Rates = Partial<Record<Cause, number>>;
const rate = (table: Rates, cause: Cause): number | undefined => table[cause];

export const ASSUMPTIONS = {
  organicReturn: {
    customer_auth: 0.12,
    gateway_tech: 0.14,
    bank_down: 0.15,
    funds_limit: 0.05,
    unclear: 0.08,
  },
  retryNow: { customer_auth: 0.33, gateway_tech: 0.37, unclear: 0.22, funds_limit: 0.08 },
  waitRetry: { bank_down: 0.4 },
  needsReasonStep1: { funds_limit: 0.13, unclear: 0.12 },
  offerLift: 0.1, // extra share who pay once an offer is added
  lateAuthCaptured: 0.5, // share of pending amounts that clear and confirm the order
  costWhatsappUtility: 0.115, // rupees per message, Meta's India rate as quoted by a vendor
  costWhatsappMarketing: 0.8631,
  costSms: 0.25, // assumed
};

function nextAllowed(t: number, cfg: Config): number {
  if (!cfg.quietHours) return t;
  const h = istHour(t);
  const dayStart = startOfIstDay(t);
  if (h >= 22.5) return dayStart + DAY + 8 * HOUR;
  if (h < 8) return dayStart + 8 * HOUR;
  return t;
}

export type Outcome =
  | "recovered" // paid after a message
  | "recovered_offer" // paid after an offer
  | "organic" // paid with no message (holdout or lane off)
  | "unpaid"
  | "captured" // pending amount cleared, order confirmed, nobody asked twice
  | "refunded" // pending amount returned automatically
  | "already_paid"
  | "not_contacted";

export interface Item {
  p: FailedPayment;
  t: Triage;
  finalLane: LaneId; // differs from t.lane when a reply moved the customer
  holdout: boolean;
  channel: "WhatsApp" | "SMS" | "none";
  plannedAt: number | null; // when a recovery message would go out, sent or not
  sendAt: number | null;
  offerAt: number | null;
  offerState: "none" | "sent" | "waiting_approval" | "not_eligible";
  paidAt: number | null;
  outcome: Outcome;
  discount: number;
  messages: number;
  cost: number;
  movedByReply: boolean;
  blockedByPause: boolean;
}

export interface RunEvent {
  t: number;
  kind:
    | "failed"
    | "held"
    | "sent"
    | "status"
    | "suppressed"
    | "left"
    | "holdout"
    | "paid"
    | "offer_wait"
    | "offer_sent"
    | "reply"
    | "moved"
    | "captured"
    | "refunded"
    | "downtime_start"
    | "downtime_end"
    | "paused";
  lane: LaneId | null;
  id: string | null;
  text: string;
}

// RBI's rule for a debit with no confirmation at the merchant: circular RBI/2019-20/67 of
// 20 September 2019 sets auto-reversal within T + 5 days for UPI payments to merchants.
const REVERSAL_NOTE = "By RBI's rule the bank returns it within five days.";

export interface RunOptions {
  pausedAt?: number | null; // no message leaves at or after this time
  offersApprovedAt?: number | null; // offers approved mid-week go out from this moment, never earlier
}

function recoveryProbability(lane: LaneId, cause: Cause): number {
  const A = ASSUMPTIONS;
  if (lane === "retry_now") return rate(A.retryNow, cause) ?? rate(A.organicReturn, cause) ?? 0;
  if (lane === "wait_retry") return rate(A.waitRetry, cause) ?? rate(A.organicReturn, cause) ?? 0;
  if (lane === "needs_reason")
    return rate(A.needsReasonStep1, cause) ?? rate(A.organicReturn, cause) ?? 0;
  return 0;
}

export function runWeek(
  week: Week,
  cfg: Config,
  opts: RunOptions = {},
): { items: Item[]; events: RunEvent[] } {
  const A = ASSUMPTIONS;
  const pausedAt = opts.pausedAt ?? null;
  const offersApprovedAt = opts.offersApprovedAt ?? null;
  const items: Item[] = [];
  const events: RunEvent[] = [];
  const first = (p: FailedPayment) => p.customer.label;

  for (const d of week.downtimes) {
    events.push({
      t: d.begin,
      kind: "downtime_start",
      lane: null,
      id: d.id,
      text: `Downtime starts on ${d.label}.`,
    });
    events.push({
      t: d.end,
      kind: "downtime_end",
      lane: null,
      id: d.id,
      text: `Downtime ends on ${d.label}.`,
    });
  }

  for (const p of week.payments) {
    const t = triage(p, week);
    const cause = p.truth.cause;
    const channel: Item["channel"] = p.customer.whatsapp
      ? "WhatsApp"
      : p.customer.sms
        ? "SMS"
        : "none";
    const msgCost = channel === "WhatsApp" ? A.costWhatsappUtility : A.costSms;
    const it: Item = {
      p,
      t,
      finalLane: t.lane,
      holdout: false,
      channel,
      plannedAt: null,
      sendAt: null,
      offerAt: null,
      offerState: "none",
      paidAt: null,
      outcome: "unpaid",
      discount: 0,
      messages: 0,
      cost: 0,
      movedByReply: false,
      blockedByPause: false,
    };
    items.push(it);
    events.push({
      t: p.failedAt,
      kind: "failed",
      lane: t.lane,
      id: p.id,
      text: `${first(p)}'s payment of ${inr(p.amount)} fails on ${p.instrumentLabel}.`,
    });

    const organicP = rate(A.organicReturn, cause) ?? 0;
    const organicAt = p.failedAt + (3 + p.truth.delayHrs * 3) * HOUR;

    if (t.lane === "left_alone") {
      it.outcome = "not_contacted";
      events.push({
        t: p.failedAt + 10 * MIN,
        kind: "left",
        lane: t.lane,
        id: p.id,
        text: `${first(p)} gets no message. ${t.why}`,
      });
      continue;
    }

    if (t.lane === "do_not_ask") {
      if (t.variant === "paid") {
        it.outcome = "already_paid";
        events.push({
          t: p.failedAt + 10 * MIN,
          kind: "suppressed",
          lane: t.lane,
          id: p.id,
          text: `${first(p)} gets no link. ${t.why}`,
        });
        continue;
      }
      // Pending at the bank: a status message, never a payment link. Sent to everyone, holdout included.
      const at = nextAllowed(p.failedAt + 10 * MIN, cfg);
      if (cfg.lanesOn.do_not_ask && !(pausedAt !== null && at >= pausedAt)) {
        it.sendAt = at;
        it.messages = 1;
        it.cost = msgCost;
        events.push({
          t: at,
          kind: "status",
          lane: t.lane,
          id: p.id,
          text: `Status message to ${first(p)}: ${inr(p.amount)} may still be processing, do not pay again.`,
        });
      }
      const resolveAt = p.failedAt + (2 + p.truth.delayHrs) * HOUR;
      if (p.truth.u2 < A.lateAuthCaptured) {
        it.outcome = "captured";
        it.paidAt = resolveAt;
        events.push({
          t: resolveAt,
          kind: "captured",
          lane: t.lane,
          id: p.id,
          text: `${first(p)}'s pending ${inr(p.amount)} clears. Order confirmed without a second payment.`,
        });
      } else {
        it.outcome = "refunded";
        events.push({
          t: resolveAt,
          kind: "refunded",
          lane: t.lane,
          id: p.id,
          text: `${first(p)}'s pending ${inr(p.amount)} did not clear. ${REVERSAL_NOTE}`,
        });
      }
      continue;
    }

    // Recovery lanes from here.
    const laneOn = cfg.lanesOn[t.lane as "retry_now" | "wait_retry" | "needs_reason"];
    it.holdout = p.truth.h < cfg.holdoutPct / 100;

    let sendAt: number;
    if (t.lane === "retry_now") sendAt = nextAllowed(p.failedAt + 10 * MIN, cfg);
    else if (t.lane === "wait_retry")
      sendAt = nextAllowed(
        Math.max((t.downtime?.end ?? p.failedAt) + 5 * MIN, p.failedAt + 10 * MIN),
        cfg,
      );
    else sendAt = nextAllowed(p.failedAt + 60 * MIN, cfg);

    it.plannedAt = sendAt;
    const paused = pausedAt !== null && sendAt >= pausedAt;

    if (it.holdout || !laneOn || paused) {
      it.blockedByPause = paused && !it.holdout && laneOn;
      if (it.holdout)
        events.push({
          t: p.failedAt + 10 * MIN,
          kind: "holdout",
          lane: t.lane,
          id: p.id,
          text: `${first(p)} is in the holdout group. No message, so the lift can be measured.`,
        });
      if (p.truth.u < organicP) {
        it.outcome = "organic";
        it.paidAt = organicAt;
        events.push({
          t: organicAt,
          kind: "paid",
          lane: t.lane,
          id: p.id,
          text: `${first(p)} comes back unprompted and pays ${inr(p.amount)}.`,
        });
      }
      continue;
    }

    if (t.lane === "wait_retry" && t.downtime && sendAt > p.failedAt + 15 * MIN) {
      events.push({
        t: p.failedAt + 10 * MIN,
        kind: "held",
        lane: t.lane,
        id: p.id,
        text: `Message to ${first(p)} held until the downtime on ${t.downtime.label} ends.`,
      });
    }

    it.sendAt = sendAt;
    it.messages = 1;
    it.cost = msgCost;
    events.push({ t: sendAt, kind: "sent", lane: t.lane, id: p.id, text: sentText(it) });

    // A pending amount that was not visible at triage: the customer tells us, and we stop.
    if (p.pendingSurfacesLate) {
      const replyAt = sendAt + 6 * MIN;
      it.movedByReply = true;
      it.finalLane = "do_not_ask";
      events.push({
        t: replyAt,
        kind: "reply",
        lane: "retry_now",
        id: p.id,
        text: `${first(p)} replies that ${inr(p.amount)} was already cut from the account.`,
      });
      events.push({
        t: replyAt + 1 * MIN,
        kind: "moved",
        lane: "do_not_ask",
        id: p.id,
        text: `Link switched off while the payment is checked. ${first(p)} moved to Do not ask again.`,
      });
      const resolveAt = replyAt + (2 + p.truth.delayHrs) * HOUR;
      if (p.truth.u2 < A.lateAuthCaptured) {
        it.outcome = "captured";
        it.paidAt = resolveAt;
        events.push({
          t: resolveAt,
          kind: "captured",
          lane: "do_not_ask",
          id: p.id,
          text: `${first(p)}'s pending ${inr(p.amount)} clears. Order confirmed without a second payment.`,
        });
      } else {
        it.outcome = "refunded";
        events.push({
          t: resolveAt,
          kind: "refunded",
          lane: "do_not_ask",
          id: p.id,
          text: `${first(p)}'s pending ${inr(p.amount)} did not clear. ${REVERSAL_NOTE}`,
        });
      }
      continue;
    }

    const p1 = Math.max(recoveryProbability(t.lane, cause), organicP);
    if (p.truth.u < p1) {
      it.outcome = "recovered";
      it.paidAt = sendAt + (0.08 + p.truth.delayHrs * 0.5) * HOUR;
      events.push({
        t: it.paidAt,
        kind: "paid",
        lane: t.lane,
        id: p.id,
        text: `${first(p)} pays ${inr(p.amount)}.`,
      });
      continue;
    }

    if (t.lane === "needs_reason") {
      const eligible = p.amount >= cfg.offerMinCart && cfg.discountCapPct > 0;
      let offerAt = nextAllowed(sendAt + 24 * HOUR, cfg);
      if (!eligible) {
        it.offerState = "not_eligible";
        continue;
      }
      if (cfg.offersApproved && offersApprovedAt !== null && offerAt < offersApprovedAt) {
        // It waited for approval first, and the wait stays in the record.
        events.push({
          t: offerAt,
          kind: "offer_wait",
          lane: t.lane,
          id: p.id,
          text: `An offer for ${first(p)} (up to ${inr((p.amount * cfg.discountCapPct) / 100)} off) is waiting for approval.`,
        });
        offerAt = nextAllowed(offersApprovedAt, cfg);
      }
      it.offerAt = offerAt;
      if (!cfg.offersApproved) {
        it.offerState = "waiting_approval";
        events.push({
          t: offerAt,
          kind: "offer_wait",
          lane: t.lane,
          id: p.id,
          text: `An offer for ${first(p)} (up to ${inr((p.amount * cfg.discountCapPct) / 100)} off) is waiting for approval.`,
        });
        continue;
      }
      if (pausedAt !== null && offerAt >= pausedAt) {
        it.blockedByPause = true;
        continue;
      }
      it.offerState = "sent";
      it.messages = 2;
      it.cost += channel === "WhatsApp" ? A.costWhatsappMarketing : A.costSms;
      events.push({
        t: offerAt,
        kind: "offer_sent",
        lane: t.lane,
        id: p.id,
        text: `Offer sent to ${first(p)}: ${cfg.discountCapPct}% off, inside the ${MERCHANT.couponCap}% coupon cap.`,
      });
      if (p.truth.u < p1 + A.offerLift) {
        it.outcome = "recovered_offer";
        it.discount = Math.round((p.amount * cfg.discountCapPct) / 100);
        it.paidAt = offerAt + (0.2 + p.truth.delayHrs * 0.5) * HOUR;
        events.push({
          t: it.paidAt,
          kind: "paid",
          lane: t.lane,
          id: p.id,
          text: `${first(p)} pays ${inr(p.amount - it.discount)} with the offer.`,
        });
      }
    }
  }

  if (pausedAt !== null)
    events.push({
      t: pausedAt,
      kind: "paused",
      lane: null,
      id: null,
      text: "Sending paused by the merchant. Nothing leaves until it is resumed.",
    });
  events.sort((a, b) => a.t - b.t);
  return { items, events };
}

function sentText(it: Item): string {
  const p = it.p;
  const via = it.channel;
  if (it.t.lane === "wait_retry" && it.t.downtime)
    return `Downtime over on ${it.t.downtime.label}. Held message released to ${p.customer.label} on ${via}.`;
  if (it.t.lane === "needs_reason")
    return `Other ways to pay sent to ${p.customer.label} on ${via}. No discount.`;
  return `Payment link sent to ${p.customer.label} on ${via}. No discount.`;
}

// ---------- summaries ----------

export interface LaneSummary {
  lane: LaneId;
  count: number;
  value: number;
  byContext: number;
  lowConfidence: number;
}

export function summariseLanes(week: Week): LaneSummary[] {
  const map = new Map<LaneId, LaneSummary>();
  for (const l of LANE_ORDER)
    map.set(l, { lane: l, count: 0, value: 0, byContext: 0, lowConfidence: 0 });
  for (const p of week.payments) {
    const t = triage(p, week);
    const s = map.get(t.lane)!;
    s.count++;
    s.value += p.amount;
    if (t.basis === "context") s.byContext++;
    if (t.confidence === "low") s.lowConfidence++;
  }
  return LANE_ORDER.map((l) => map.get(l)!);
}

// What a single rule (payment failed, send one link 30 minutes later) gets wrong on this batch.
// These are counts of facts about the batch, not predicted outcomes.
export type MissKind = "downtime" | "pending" | "paid" | "risk" | "fail_again";

// The ways one link, 30 minutes after the failure, would be wrong for this payment.
export function oneLinkMissKinds(p: FailedPayment, week: Week): MissKind[] {
  const t = triage(p, week);
  if (t.variant === "opted_out" || t.variant === "no_consent") return []; // assume the rule also respects consent
  const kinds: MissKind[] = [];
  const linkAt = p.failedAt + 30 * MIN;
  if (t.downtime && linkAt < t.downtime.end && p.paidSince === "no" && !p.riskFlag)
    kinds.push("downtime");
  if (p.pendingAtBank || p.pendingSurfacesLate) kinds.push("pending");
  if (p.paidSince !== "no") kinds.push("paid");
  if (p.riskFlag) kinds.push("risk");
  if (t.lane === "needs_reason") kinds.push("fail_again");
  return kinds;
}

export function oneLinkMisses(week: Week) {
  let intoDowntime = 0,
    pendingAsked = 0,
    alreadyPaid = 0,
    riskChased = 0,
    wouldFailAgain = 0;
  for (const p of week.payments) {
    for (const k of oneLinkMissKinds(p, week)) {
      if (k === "downtime") intoDowntime++;
      else if (k === "pending") pendingAsked++;
      else if (k === "paid") alreadyPaid++;
      else if (k === "risk") riskChased++;
      else wouldFailAgain++;
    }
  }
  return {
    intoDowntime,
    pendingAsked,
    alreadyPaid,
    riskChased,
    wouldFailAgain,
    total: intoDowntime + pendingAsked + alreadyPaid + riskChased + wouldFailAgain,
  };
}

export function codeVsContext(week: Week) {
  let code = 0,
    context = 0,
    low = 0;
  for (const p of week.payments) {
    const t = triage(p, week);
    if (t.basis === "code") code++;
    else context++;
    if (t.confidence === "low") low++;
  }
  return { code, context, low, total: week.payments.length };
}

export function wilson(k: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.96,
    ph = k / n;
  const denom = 1 + (z * z) / n;
  const centre = ph + (z * z) / (2 * n);
  const half = z * Math.sqrt((ph * (1 - ph)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (centre - half) / denom), Math.min(1, (centre + half) / denom)];
}

export interface Results {
  treatedN: number;
  treatedValue: number;
  treatedPaidN: number;
  treatedPaidValue: number;
  holdoutN: number;
  holdoutValue: number;
  holdoutPaidN: number;
  treatedRate: number;
  holdoutRate: number;
  holdoutLow: number;
  holdoutHigh: number;
  lift: number;
  liftLow: number;
  liftHigh: number;
  // Money collected per customer, with every customer kept in the group they were assigned to.
  holdoutPaidValue: number;
  treatedMean: number;
  holdoutMean: number;
  perCustomer: number; // treatedMean minus holdoutMean
  perCustomerLow: number; // NaN while the held-out group is too small for a range
  perCustomerHigh: number;
  hasRange: boolean;
  // perCustomer times the number of customers messaged
  incremental: number;
  incrementalLow: number;
  incrementalHigh: number;
  messageCost: number;
  discountCost: number;
  net: number;
  messages: number;
  offersSent: number;
  offersWaiting: number;
  offerPaid: number;
  capturedN: number;
  capturedValue: number;
  refundedN: number;
  movedByReply: number;
  heldForDowntime: number;
  suppressedPaid: number;
  leftAlone: number;
  pendingProtected: number;
  blockedByPause: number;
  byLane: Record<
    string,
    {
      treated: number;
      paid: number;
      value: number;
      paidValue: number;
      holdout: number;
      holdoutPaid: number;
    }
  >;
  aboveZero: boolean; // the whole range for money per customer sits above zero
}

// How many customers are held out before the result is read. Fixed before the test starts, so
// that a lucky week cannot end it early.
export const TEST_HOLDOUT_TARGET = 60;
const MIN_GROUP_FOR_RANGE = 5;

// Two-sided 95% critical value of Student's t, by a Cornish-Fisher expansion. It is within about
// 2% of the tables from four degrees of freedom up, the smallest case this is used for.
function tCritical(df: number): number {
  const z = 1.959964;
  return z + (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df * df);
}

export function results(itemsList: Item[][]): Results {
  const items = itemsList.flat();
  const byLane: Results["byLane"] = {};
  for (const l of RECOVERY_LANES)
    byLane[l] = { treated: 0, paid: 0, value: 0, paidValue: 0, holdout: 0, holdoutPaid: 0 };
  const r = {
    treatedN: 0,
    treatedValue: 0,
    treatedPaidN: 0,
    treatedPaidValue: 0,
    holdoutN: 0,
    holdoutValue: 0,
    holdoutPaidN: 0,
    messageCost: 0,
    discountCost: 0,
    messages: 0,
    offersSent: 0,
    offersWaiting: 0,
    offerPaid: 0,
    capturedN: 0,
    capturedValue: 0,
    refundedN: 0,
    movedByReply: 0,
    heldForDowntime: 0,
    suppressedPaid: 0,
    leftAlone: 0,
    pendingProtected: 0,
    blockedByPause: 0,
  };
  // Sums of squares of what each customer paid (zero for those who did not), for the range.
  let treatedSq = 0,
    holdoutPaidValue = 0,
    holdoutSq = 0;
  for (const it of items) {
    r.messageCost += it.cost;
    r.messages += it.messages;
    r.discountCost += it.discount;
    if (it.offerState === "sent") r.offersSent++;
    if (it.offerState === "waiting_approval") r.offersWaiting++;
    if (it.outcome === "recovered_offer") r.offerPaid++;
    if (it.outcome === "captured") {
      r.capturedN++;
      r.capturedValue += it.p.amount;
    }
    if (it.outcome === "refunded") r.refundedN++;
    if (it.movedByReply) r.movedByReply++;
    if (it.blockedByPause) r.blockedByPause++;
    if (it.t.lane === "left_alone") r.leftAlone++;
    if (it.t.variant === "paid") r.suppressedPaid++;
    if (it.t.variant === "pending" || it.movedByReply) r.pendingProtected++;
    if (
      it.t.lane === "wait_retry" &&
      it.sendAt !== null &&
      it.t.downtime &&
      it.sendAt > it.p.failedAt + 15 * MIN
    )
      r.heldForDowntime++;
    // Everyone stays in the group they were assigned to. A customer who reported a debit after a
    // message still counts as messaged, and as not recovered by it.
    if (!RECOVERY_LANES.includes(it.t.lane)) continue;
    const L = byLane[it.t.lane]!; // present: the line above keeps only recovery lanes
    if (it.holdout) {
      r.holdoutN++;
      r.holdoutValue += it.p.amount;
      L.holdout++;
      if (it.outcome === "organic") {
        r.holdoutPaidN++;
        L.holdoutPaid++;
        holdoutPaidValue += it.p.amount;
        holdoutSq += it.p.amount ** 2;
      }
    } else if (it.sendAt !== null) {
      r.treatedN++;
      r.treatedValue += it.p.amount;
      L.treated++;
      L.value += it.p.amount;
      if (it.outcome === "recovered" || it.outcome === "recovered_offer") {
        const paid = it.p.amount - it.discount;
        r.treatedPaidN++;
        r.treatedPaidValue += paid;
        treatedSq += paid ** 2;
        L.paid++;
        L.paidValue += paid;
      }
    }
  }
  const treatedRate = r.treatedN ? r.treatedPaidN / r.treatedN : 0;
  const holdoutRate = r.holdoutN ? r.holdoutPaidN / r.holdoutN : 0;
  const [lo, hi] = wilson(r.holdoutPaidN, r.holdoutN);
  const [tLo, tHi] = wilson(r.treatedPaidN, r.treatedN);
  // Lift = treated rate minus holdout rate, with a Newcombe interval for the difference of two proportions.
  const lift = treatedRate - holdoutRate;
  const liftLow = r.holdoutN
    ? lift - Math.sqrt((treatedRate - tLo) ** 2 + (hi - holdoutRate) ** 2)
    : 0;
  const liftHigh = r.holdoutN
    ? lift + Math.sqrt((tHi - treatedRate) ** 2 + (holdoutRate - lo) ** 2)
    : 0;
  // What the messages caused: money collected per customer in each group, non-payers counted as
  // zero, and the difference applied to everyone who was messaged. The range is a Welch interval
  // on that difference, which allows the two groups to differ in size and in spread.
  const treatedMean = r.treatedN ? r.treatedPaidValue / r.treatedN : 0;
  const holdoutMean = r.holdoutN ? holdoutPaidValue / r.holdoutN : 0;
  const spread = (sum: number, sumSq: number, n: number) =>
    n > 1 ? Math.max(0, (sumSq - (sum * sum) / n) / (n - 1)) : 0;
  const avgPaid = r.treatedPaidN ? r.treatedPaidValue / r.treatedPaidN : 0;
  const treatedVar = spread(r.treatedPaidValue, treatedSq, r.treatedN);
  // With no payer in the held-out group its spread would read as zero. The range then assumes
  // that one of them could have paid an average amount.
  const holdoutVar =
    r.holdoutPaidN > 0
      ? spread(holdoutPaidValue, holdoutSq, r.holdoutN)
      : r.holdoutN > 0
        ? avgPaid ** 2 / r.holdoutN
        : 0;
  const hasRange = r.holdoutN >= MIN_GROUP_FOR_RANGE && r.treatedN >= MIN_GROUP_FOR_RANGE;
  const perCustomer = r.holdoutN ? treatedMean - holdoutMean : 0;
  let perCustomerLow = NaN,
    perCustomerHigh = NaN;
  if (hasRange) {
    const a = treatedVar / r.treatedN,
      b = holdoutVar / r.holdoutN;
    const se = Math.sqrt(a + b);
    const df =
      se > 0
        ? (a + b) ** 2 / ((a * a) / (r.treatedN - 1) + (b * b) / (r.holdoutN - 1))
        : r.holdoutN - 1;
    const t = tCritical(Math.max(4, df));
    perCustomerLow = perCustomer - t * se;
    perCustomerHigh = perCustomer + t * se;
  }
  const incremental = perCustomer * r.treatedN;
  const incrementalLow = perCustomerLow * r.treatedN;
  const incrementalHigh = perCustomerHigh * r.treatedN;
  const net = incremental - r.messageCost; // discounts are already netted out of what customers paid
  return {
    ...r,
    treatedRate,
    holdoutRate,
    holdoutLow: lo,
    holdoutHigh: hi,
    lift,
    liftLow,
    liftHigh,
    holdoutPaidValue,
    treatedMean,
    holdoutMean,
    perCustomer,
    perCustomerLow,
    perCustomerHigh,
    hasRange,
    incremental,
    incrementalLow,
    incrementalHigh,
    net,
    byLane,
    aboveZero: hasRange && perCustomerLow > 0,
  };
}

// Customers held out of the recovery lanes in one week's run.
export function heldOut(items: Item[]): number {
  let n = 0;
  for (const it of items) if (it.holdout && RECOVERY_LANES.includes(it.t.lane)) n++;
  return n;
}

// The week in which the planned number of held-out customers is reached. The result is read
// once, in that week. Simulated on the same synthetic weeks the results screen uses.
export function testEndWeek(
  cfg: Config,
  weekly: (index: number) => Item[],
  maxWeeks = 16,
): number | null {
  if (cfg.holdoutPct === 0) return null;
  let held = 0;
  for (let n = 1; n <= maxWeeks; n++) {
    held += heldOut(weekly(n));
    if (held >= TEST_HOLDOUT_TARGET) return n;
  }
  return null;
}

// Projection shown on the plan screen before anything runs. A range, because the rates are assumed.
export function project(week: Week, cfg: Config) {
  const A = ASSUMPTIONS;
  let toMessage = 0,
    holdout = 0,
    statusMsgs = 0,
    offerEligible = 0,
    offerExposure = 0,
    cost = 0,
    expected = 0,
    expectedValue = 0;
  const perLane = {} as Record<LaneId, { n: number; value: number }>;
  for (const l of LANE_ORDER) perLane[l] = { n: 0, value: 0 };
  for (const p of week.payments) {
    const t = triage(p, week);
    perLane[t.lane].n++;
    perLane[t.lane].value += p.amount;
    const msgCost = p.customer.whatsapp ? A.costWhatsappUtility : A.costSms;
    if (t.variant === "pending" && cfg.lanesOn.do_not_ask) {
      statusMsgs++;
      cost += msgCost;
    }
    if (!RECOVERY_LANES.includes(t.lane)) continue;
    if (!cfg.lanesOn[t.lane as "retry_now"]) continue;
    if (p.truth.h < cfg.holdoutPct / 100) {
      holdout++;
      continue;
    }
    toMessage++;
    cost += msgCost;
    // Lane-level average rates, not this customer's hidden cause.
    const rate = t.lane === "retry_now" ? 0.31 : t.lane === "wait_retry" ? 0.4 : 0.13;
    expected += rate;
    expectedValue += rate * p.amount;
    if (t.lane === "needs_reason" && p.amount >= cfg.offerMinCart && cfg.discountCapPct > 0) {
      offerEligible++;
      offerExposure += (p.amount * cfg.discountCapPct) / 100;
      if (cfg.offersApproved) {
        expected += A.offerLift * 0.87;
        expectedValue += A.offerLift * 0.87 * p.amount * (1 - cfg.discountCapPct / 100);
        cost += p.customer.whatsapp ? A.costWhatsappMarketing : A.costSms;
      }
    }
  }
  return {
    toMessage,
    holdout,
    statusMsgs,
    offerEligible,
    offerExposure,
    cost,
    lowN: Math.round(expected * 0.75),
    highN: Math.round(expected * 1.25),
    lowValue: expectedValue * 0.75,
    highValue: expectedValue * 1.25,
    perLane,
  };
}

// ---------- messages ----------

function downPhrase(d: Downtime | null): string {
  if (!d) return "the bank";
  if (d.method === "upi") return `UPI (${d.label.replace("UPI handle ", "")})`;
  return d.label;
}

export function messageFor(
  it: Pick<Item, "p" | "t">,
  cfg: Config,
  step: 1 | 2 = 1,
  forceHinglish?: boolean,
): string {
  const p = it.p,
    t = it.t;
  const hi = forceHinglish ?? p.customer.hinglish;
  const n = p.customer.name,
    amt = inr(p.amount),
    shop = MERCHANT.name;
  const link = "mittimoss.example/pay";
  if (t.lane === "needs_reason" && step === 2) {
    return hi
      ? `Hi ${n}, aapka ${shop} cart abhi bhi saved hai. Agle 48 ghante mein order complete karne par ${cfg.discountCapPct}% off: ${link}\nSTOP bhejkar messages band karein.`
      : `Hi ${n}, your ${shop} cart is still saved. Here is ${cfg.discountCapPct}% off if you complete it in the next 48 hours: ${link}\nReply STOP to opt out.`;
  }
  if (t.lane === "retry_now" && t.variant === "technical") {
    return hi
      ? `Hi ${n}, ${shop} par aapka ${amt} ka payment ek technical dikkat ki wajah se nahi ho paya. Aapki galti nahi thi. Cart saved hai: ${link}\nAgar paisa kat gaya ho to PAID reply karein, hum pehle check karenge.`
      : `Hi ${n}, your payment of ${amt} to ${shop} did not go through because of a technical problem on the payment side, not a mistake on your side. Your cart is saved: ${link}\nIf money left your account, reply PAID and we will check before you pay again.`;
  }
  if (t.lane === "retry_now") {
    return hi
      ? `Hi ${n}, ${shop} par aapka ${amt} ka payment complete nahi hua, isliye order abhi place nahi hua hai. Cart saved hai, yahan se complete karein: ${link}\nAgar paisa kat gaya ho to PAID reply karein, hum pehle check karenge.`
      : `Hi ${n}, your payment of ${amt} to ${shop} did not go through, so your order is not placed yet. Your cart is saved. Complete it here: ${link}\nIf money left your account, reply PAID and we will check before you pay again.`;
  }
  if (t.lane === "wait_retry") {
    const at = fmtDayClock(p.failedAt);
    return hi
      ? `Hi ${n}, ${at} ko jab aapne ${shop} ko ${amt} pay kiya, tab ${downPhrase(t.downtime)} mein outage tha. Aapki galti nahi thi, ab theek ho gaya hai. Cart saved hai: ${link}\nBaaki UPI apps aur cards bhi chal rahe hain.`
      : `Hi ${n}, there was an outage on ${downPhrase(t.downtime)} when you paid ${shop} ${amt} on ${at}. It was not your fault, and it is fixed now. Your cart is saved: ${link}\nOther UPI apps and cards are working too.`;
  }
  if (t.lane === "do_not_ask" && t.variant === "pending") {
    return hi
      ? `Hi ${n}, ${shop} par aapka ${amt} ka payment shayad abhi process ho raha hai. Please abhi dobara pay na karein. Payment ho gaya to order confirm kar denge. ${ifNot(p.method === "upi", true)}`
      : `Hi ${n}, your payment of ${amt} to ${shop} may still be processing. Please do not pay again for now. We will confirm your order if it goes through. ${ifNot(p.method === "upi", false)}`;
  }
  if (t.lane === "needs_reason") {
    const emi = p.amount >= 3000;
    const each = inr(Math.ceil(p.amount / 3));
    return hi
      ? `Hi ${n}, ${shop} par aapka ${amt} ka payment us account se nahi ho paya. Aap doosre tareeke se pay kar sakte hain: doosra bank account ya card, pay later${emi ? `, ya ${each} ki 3 monthly instalments` : ""}. Cart saved hai: ${link}`
      : `Hi ${n}, your payment of ${amt} to ${shop} could not be completed with that account. You can pay another way: a different bank account or card, pay later${emi ? `, or 3 monthly instalments of ${each}` : ""}. Your cart is saved: ${link}`;
  }
  return "";
}

// What a customer is told about money that was debited for a payment that did not complete.
// For UPI it can cite RBI's rule (auto-reversal within T + 5 days for a debit with no confirmation
// at the merchant). For other methods the circular gives no such line, so the message promises
// only to report back.
function ifNot(upi: boolean, hinglish: boolean): string {
  if (hinglish)
    return upi
      ? "Nahi hua to bank ko paisa 5 din ke andar wapas karna hota hai."
      : "Nahi hua to hum aapko bata denge.";
  return upi
    ? "If it does not, your bank has to return the amount within five days."
    : "If it does not, we will tell you.";
}

export const REPLY_SCRIPT = {
  customer: (amount: number) =>
    `Mere account se ${inr(amount)} kat gaye the. Dobara pay karna hai kya?`,
  agent: (amount: number, upi: boolean) =>
    `Batane ke liye thank you. Jab tak hum ${inr(amount)} ka payment check kar rahe hain, link band kar diya hai. Please dobara pay na karein. Payment ho gaya to order confirm kar denge. ${ifNot(upi, true)}`,
  agentEnglish: (amount: number, upi: boolean) =>
    `Thank you for telling us. We have switched off the link while we check the payment of ${inr(amount)}. Please do not pay again. We will confirm your order if the payment goes through. ${ifNot(upi, false)}`,
};
