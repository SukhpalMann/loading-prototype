// Pins the numbers quoted in the one-pager, the video script and the build log to the code.
// If the seed, the generator or an assumed rate changes, this fails before a document goes stale.

import { describe, expect, it } from "vitest";
import { MIN, generateWeek } from "../data";
import {
  DEFAULT_CONFIG,
  TEST_HOLDOUT_TARGET,
  codeVsContext,
  oneLinkMisses,
  results,
  runWeek,
  summariseLanes,
  testEndWeek,
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

describe("the default plan, the path the video follows: 10% holdout, no offers", () => {
  const runs = Array.from(
    { length: 12 },
    (_, i) => runWeek(generateWeek(i + 1), DEFAULT_CONFIG).items,
  );
  const upTo = (week: number) => results(runs.slice(0, week));
  const r = upTo(12);

  it("plans to read the test in week 12, when 60 customers have been held out", () => {
    expect(TEST_HOLDOUT_TARGET).toBe(60);
    expect(testEndWeek(DEFAULT_CONFIG, (i) => runs[i - 1] ?? [])).toBe(12);
    expect(upTo(11).holdoutN).toBeLessThan(60);
  });

  it("collects ₹429 a customer from 586 messaged and ₹223 from 63 held out", () => {
    expect([r.treatedPaidN, r.treatedN, r.holdoutPaidN, r.holdoutN]).toEqual([177, 586, 7, 63]);
    expect([Math.round(r.treatedPaidValue), r.holdoutPaidValue]).toEqual([251521, 14037]);
    expect([Math.round(r.treatedMean), Math.round(r.holdoutMean)]).toEqual([429, 223]);
  });

  it("reads ₹1,20,955 caused, in a range of ₹6,212 to ₹2,35,697", () => {
    expect(Math.round(r.incremental)).toBe(120955);
    expect([Math.round(r.incrementalLow), Math.round(r.incrementalHigh)]).toEqual([6212, 235697]);
    expect([
      Math.round(r.perCustomer),
      Math.round(r.perCustomerLow),
      Math.round(r.perCustomerHigh),
    ]).toEqual([206, 11, 402]);
    expect(r.aboveZero).toBe(true);
  });

  it("shows why the test is not read early: above zero in week 8, not in week 10", () => {
    expect(upTo(1).aboveZero).toBe(false);
    expect(Math.round(upTo(1).incremental)).toBe(-10055);
    expect(upTo(8).aboveZero).toBe(true);
    expect(upTo(10).aboveZero).toBe(false);
  });

  it("keeps customers who reported a debit in the messaged group", () => {
    expect(r.movedByReply).toBe(13);
    expect(r.pendingProtected - r.movedByReply).toBe(16);
  });

  it("spends ₹76 on 602 messages and gives no discount", () => {
    expect([r.messages, Math.round(r.messageCost), r.discountCost]).toEqual([602, 76, 0]);
  });
});

describe("other plans", () => {
  it("reads a 20% holdout in week 7", () => {
    const cfg = { ...DEFAULT_CONFIG, holdoutPct: 20 };
    const weekly = (i: number) => runWeek(generateWeek(i), cfg).items;
    expect(testEndWeek(cfg, weekly)).toBe(7);
    const read = results(Array.from({ length: 7 }, (_, i) => weekly(i + 1)));
    expect(read.aboveZero).toBe(true);
    expect(Math.round(read.incremental)).toBe(101386);
  });

  it("with offers approved at a 5% cap, reads ₹1,35,051 after 12 weeks", () => {
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
    const r = results(runs);
    expect([r.treatedPaidN, r.treatedN]).toEqual([182, 586]);
    expect(Math.round(r.incremental)).toBe(135051);
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

  it("owes nearly all of that edge to waiting out bank downtimes", () => {
    expect(c.edgeByLane).toEqual({ retry_now: 0, wait_retry: 13836, needs_reason: 797 });
    // If downtime failures were 5% of failures, not the 16% assumed, the edge would be about ₹5,000.
    expect(c.edgeIfDowntimeShareIs(0.05)).toBe(5121);
  });

  it("needs about 6,600 customers in each group to tell the two rules apart", () => {
    // 164 of 586 against 177 of 586, at 5% significance and 80% power.
    expect(c.groupSizeNeeded).toBe(6577);
  });

  it("sends 244 links into a wrong situation", () => {
    const o = c.oneLink;
    expect([o.intoDowntime, o.pendingAsked, o.alreadyPaid, o.riskChased]).toEqual([
      52, 30, 102, 60,
    ]);
  });
});
