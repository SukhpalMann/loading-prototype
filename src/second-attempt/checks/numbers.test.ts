// Pins the numbers quoted in the one-pager, the video script and the build log to the code.
// If the seed, the generator or an assumed rate changes, this fails before a document goes stale.

import { describe, expect, it } from "vitest";
import { MIN, generateWeek } from "../data";
import {
  DEFAULT_CONFIG,
  codeVsContext,
  oneLinkMisses,
  results,
  runWeek,
  summariseLanes,
  triage,
} from "../engine";
import { oneLinkAgainstLanes } from "./one-link";

describe("the sample week on the first screen", () => {
  const week = generateWeek(0);

  it("has 68 failed payments worth ₹95,595 in five lanes", () => {
    expect(week.payments.length).toBe(68);
    expect(week.payments.reduce((s, p) => s + p.amount, 0)).toBe(95595);
    expect(summariseLanes(week).map((l) => l.count)).toEqual([31, 10, 11, 9, 7]);
  });

  it("counts 30 links that one rule for everyone would misdirect", () => {
    expect(oneLinkMisses(week)).toEqual({
      intoDowntime: 4,
      pendingAsked: 2,
      alreadyPaid: 10,
      riskChased: 5,
      wouldFailAgain: 9,
      total: 30,
    });
  });

  it("sorts 35 by the reason code alone and 33 with a second fact", () => {
    const c = codeVsContext(week);
    expect([c.code, c.context]).toEqual([35, 33]);
  });

  it("sends payment_timed_out to three lanes: 5, 2 and 4", () => {
    const lanes: Record<string, number> = {};
    for (const p of week.payments) {
      if (p.error.reason !== "payment_timed_out") continue;
      const lane = triage(p, week).lane;
      lanes[lane] = (lanes[lane] ?? 0) + 1;
    }
    expect(lanes).toEqual({ retry_now: 5, wait_retry: 2, do_not_ask: 4 });
  });
});

describe("twelve weeks on the default plan, the path the video follows: 10% holdout, no offers", () => {
  const runs = Array.from(
    { length: 12 },
    (_, i) => runWeek(generateWeek(i + 1), DEFAULT_CONFIG).items,
  );
  const r = results(runs);

  it("measures 177 of 586 messaged against 7 of 63 held out", () => {
    expect([r.treatedPaidN, r.treatedN, r.holdoutPaidN, r.holdoutN]).toEqual([177, 586, 7, 63]);
    expect(Math.round(r.incremental)).toBe(158997);
    expect([Math.round(r.incrementalLow), Math.round(r.incrementalHigh)]).toEqual([69817, 215686]);
    expect(r.proven).toBe(true);
  });

  it("keeps customers who reported a debit in the messaged group", () => {
    expect(r.movedByReply).toBe(13);
    expect(r.pendingProtected - r.movedByReply).toBe(16);
  });

  it("spends ₹76 on 602 messages and gives no discount", () => {
    expect([r.messages, Math.round(r.messageCost), r.discountCost]).toEqual([602, 76, 0]);
  });

  it("is first proven after week 6", () => {
    const proven = runs.map((_, i) => results(runs.slice(0, i + 1)).proven);
    expect(proven.indexOf(true) + 1).toBe(6);
  });
});

describe("twelve weeks with the cap at 5% and offers approved", () => {
  const capped = { ...DEFAULT_CONFIG, discountCapPct: 5 };
  const approved = { ...capped, offersApproved: true };
  const weekOne = generateWeek(1);
  // The merchant approves offers a minute after the first one starts waiting, on Saturday.
  const firstWait = runWeek(weekOne, capped).events.find((e) => e.kind === "offer_wait");
  const runs = Array.from({ length: 12 }, (_, i) =>
    i === 0
      ? runWeek(weekOne, approved, { offersApprovedAt: (firstWait?.t ?? 0) + MIN }).items
      : runWeek(generateWeek(i + 1), approved).items,
  );

  it("shows ₹25,114 back after week 1 and does not call it proven", () => {
    const r = results(runs.slice(0, 1));
    expect([r.treatedPaidN, r.treatedN, r.holdoutPaidN, r.holdoutN]).toEqual([18, 48, 1, 5]);
    expect(Math.round(r.treatedPaidValue)).toBe(25114);
    expect(r.proven).toBe(false);
  });

  it("shows ₹1,70,592 caused after 12 weeks, in a range of ₹78,903 to ₹2,28,925", () => {
    const r = results(runs);
    expect([r.treatedPaidN, r.treatedN, r.holdoutPaidN, r.holdoutN]).toEqual([182, 586, 7, 63]);
    expect(Math.round(r.incremental)).toBe(170592);
    expect([Math.round(r.incrementalLow), Math.round(r.incrementalHigh)]).toEqual([78903, 228925]);
    expect(r.proven).toBe(true);
  });

  it("spends ₹133 on 671 messages and ₹742 on 5 discounted orders", () => {
    const r = results(runs);
    expect([r.messages, Math.round(r.messageCost), r.discountCost, r.offerPaid]).toEqual([
      671, 133, 742, 5,
    ]);
  });
});

describe("one link for everyone, under the same assumed rates", () => {
  const c = oneLinkAgainstLanes(12);

  it("recovers 164 payments worth ₹2,36,888 from 573 customers", () => {
    expect([c.oneLink.messaged, c.oneLink.paid, c.oneLink.value]).toEqual([573, 164, 236888]);
  });

  it("leaves the four lanes 13 payments and ₹14,633 ahead", () => {
    expect([c.lanes.paid, c.lanes.value]).toEqual([177, 251521]);
    expect([c.extraPayments, c.extraValue]).toEqual([13, 14633]);
  });

  it("sends 244 links into a wrong situation", () => {
    const o = c.oneLink;
    expect([o.intoDowntime, o.pendingAsked, o.alreadyPaid, o.riskChased]).toEqual([
      52, 30, 102, 60,
    ]);
  });
});
