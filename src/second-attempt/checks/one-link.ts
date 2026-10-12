// A check on the prototype's own headline number. It is not part of the app.
//
// The results screen measures Second Attempt against customers who got no message.
// This asks a different question: under the same assumed rates, what would one payment
// link for everyone, 30 minutes after the failure, recover from the same customers?
//
// Assumptions added for the one-link rule, on top of ASSUMPTIONS in engine.ts:
// - It respects consent, and holds out the same customers as the lanes do.
// - A link that arrives while the customer's bank is still down fails again, so that
//   customer returns only at the unprompted rate. After the downtime it works as well
//   as the Wait, then retry message.
// - Everyone else pays at the Retry now rate for their cause.
// - It also goes to customers whose money is pending, who have already paid, or whose
//   payment a risk check blocked. Those links recover nothing and are counted as wrong.

import { MIN, generateWeek } from "../data";
import type { Cause, Week } from "../data";
import { ASSUMPTIONS, DEFAULT_CONFIG, results, runWeek, triage } from "../engine";

type Rates = Partial<Record<Cause, number>>;
const rate = (table: Rates, cause: Cause): number | undefined => table[cause];

export interface OneLinkTally {
  messaged: number;
  paid: number;
  value: number;
  intoDowntime: number;
  pendingAsked: number;
  alreadyPaid: number;
  riskChased: number;
}

export function oneLinkWeek(week: Week, holdoutPct: number): OneLinkTally {
  const A = ASSUMPTIONS;
  const out: OneLinkTally = {
    messaged: 0,
    paid: 0,
    value: 0,
    intoDowntime: 0,
    pendingAsked: 0,
    alreadyPaid: 0,
    riskChased: 0,
  };
  for (const p of week.payments) {
    if (p.customer.optedOut || (!p.customer.whatsapp && !p.customer.sms)) continue;
    if (p.riskFlag) {
      out.riskChased++;
      continue;
    }
    if (p.pendingAtBank || p.pendingSurfacesLate) {
      out.pendingAsked++;
      continue;
    }
    if (p.paidSince !== "no") {
      out.alreadyPaid++;
      continue;
    }
    if (p.truth.h < holdoutPct / 100) continue;

    const cause = p.truth.cause;
    const unprompted = rate(A.organicReturn, cause) ?? 0;
    let chance: number;
    if (cause === "bank_down") {
      const downtime = triage(p, week).downtime;
      const stillDown = downtime !== null && p.failedAt + 30 * MIN < downtime.end;
      if (stillDown) out.intoDowntime++;
      chance = stillDown ? unprompted : A.waitRetry.bank_down;
    } else {
      chance = Math.max(rate(A.retryNow, cause) ?? unprompted, unprompted);
    }
    out.messaged++;
    if (p.truth.u < chance) {
      out.paid++;
      out.value += p.amount;
    }
  }
  return out;
}

// Twelve weeks of the same synthetic store, default plan: 10% holdout, no offers.
export function oneLinkAgainstLanes(weeks = 12) {
  const cfg = DEFAULT_CONFIG;
  const oneLink: OneLinkTally = {
    messaged: 0,
    paid: 0,
    value: 0,
    intoDowntime: 0,
    pendingAsked: 0,
    alreadyPaid: 0,
    riskChased: 0,
  };
  const runs = [];
  for (let i = 1; i <= weeks; i++) {
    const week = generateWeek(i);
    const w = oneLinkWeek(week, cfg.holdoutPct);
    oneLink.messaged += w.messaged;
    oneLink.paid += w.paid;
    oneLink.value += w.value;
    oneLink.intoDowntime += w.intoDowntime;
    oneLink.pendingAsked += w.pendingAsked;
    oneLink.alreadyPaid += w.alreadyPaid;
    oneLink.riskChased += w.riskChased;
    runs.push(runWeek(week, cfg).items);
  }
  const lanes = results(runs);
  return {
    oneLink,
    lanes: {
      messaged: lanes.treatedN,
      paid: lanes.treatedPaidN,
      value: Math.round(lanes.treatedPaidValue),
      caused: Math.round(lanes.incremental),
    },
    extraPayments: lanes.treatedPaidN - oneLink.paid,
    extraValue: Math.round(lanes.treatedPaidValue) - oneLink.value,
  };
}
