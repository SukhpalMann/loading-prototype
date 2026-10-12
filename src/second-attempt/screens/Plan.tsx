import { useMemo, useState } from "react";
import { MERCHANT, generateWeek, inr } from "../data";
import type { FailedPayment, Week } from "../data";
import {
  LANES,
  TEST_HOLDOUT_TARGET,
  messageFor,
  project,
  runWeek,
  testEndWeek,
  triage,
} from "../engine";
import type { Config, LaneId, Triage } from "../engine";
import { Lock } from "lucide-react";
import { Assumed, Bubble, LaneIcon, LanguageToggle, Switch } from "../ui";

type ActiveLane = "retry_now" | "wait_retry" | "do_not_ask" | "needs_reason";
const ACTIVE: ActiveLane[] = ["retry_now", "wait_retry", "do_not_ask", "needs_reason"];

const WHEN: Record<ActiveLane, string> = {
  retry_now: "Ten minutes after the failure, so the customer can still retry on their own first.",
  wait_retry: "Five minutes after the bank's downtime ends. Never while it is still down.",
  do_not_ask: "Ten minutes after the failure, and only when the amount is pending at the bank.",
  needs_reason:
    "An hour after the failure. The offer follows a day later, if you have approved it.",
};

function findExample(
  week: Week,
  lane: LaneId,
  test: (p: FailedPayment, t: Triage) => boolean,
): { p: FailedPayment; t: Triage } | null {
  for (const p of week.payments) {
    const t = triage(p, week);
    if (t.lane === lane && test(p, t)) return { p, t };
  }
  return null;
}

export function Plan({
  week,
  cfg,
  setCfg,
  approved,
  onApprove,
  onNext,
}: {
  week: Week;
  cfg: Config;
  setCfg: (c: Config) => void;
  approved: boolean;
  onApprove: () => void;
  onNext: () => void;
}) {
  const [hinglish, setHinglish] = useState(false);
  const proj = useMemo(() => project(week, cfg), [week, cfg]);
  const examples = useMemo(
    () => ({
      retry_now: findExample(week, "retry_now", (_p, t) => t.variant === "slip"),
      wait_retry: findExample(week, "wait_retry", () => true),
      do_not_ask: findExample(week, "do_not_ask", (_p, t) => t.variant === "pending"),
      needs_reason:
        findExample(week, "needs_reason", (p) => p.amount >= cfg.offerMinCart) ??
        findExample(week, "needs_reason", () => true),
    }),
    [week, cfg.offerMinCart],
  );
  const recoverable = proj.toMessage + proj.holdout;
  const endWeek = useMemo(
    () => testEndWeek(cfg, (i) => runWeek(generateWeek(i), cfg).items),
    [cfg],
  );
  const set = (patch: Partial<Config>) => setCfg({ ...cfg, ...patch });

  return (
    <div>
      <h1 className="sa-h1">Here is what runs next week, and what waits for you.</h1>
      <p className="sa-lede">
        Three lanes send one message each and give nothing away, so they run on their own once you
        approve the plan. Any offer waits for your approval. You can change the limits on the right,
        switch a lane off, and stop everything at any time.
      </p>

      <div className="sa-plan">
        <div>
          <div className="sa-plan__bar">
            <h2 className="sa-h2">The four lanes</h2>
            <span className="sa-plan__lang">
              Messages in <LanguageToggle hinglish={hinglish} onChange={setHinglish} />
            </span>
          </div>

          {ACTIVE.map((lane) => {
            const ex = examples[lane];
            const on = cfg.lanesOn[lane];
            const n = proj.perLane[lane];
            return (
              <section key={lane} className={`sa-rule lane--${lane}${on ? "" : " sa-rule--off"}`}>
                <div className="sa-rule__top">
                  <LaneIcon lane={lane} size={20} />
                  <div className="sa-rule__title">
                    <h3 className="sa-lane__name">{LANES[lane].name}</h3>
                    <p className="sa-lane__rule">{LANES[lane].rule}</p>
                  </div>
                  <Switch
                    on={on}
                    onChange={(v) => set({ lanesOn: { ...cfg.lanesOn, [lane]: v } })}
                    label={on ? "On" : "Off"}
                  />
                </div>
                <div className="sa-rule__grid">
                  <dl className="sa-facts">
                    <div>
                      <dt>What it does</dt>
                      <dd>{LANES[lane].action}</dd>
                    </div>
                    <div>
                      <dt>When</dt>
                      <dd>{WHEN[lane]}</dd>
                    </div>
                    <div>
                      <dt>Discount</dt>
                      <dd>
                        {lane === "needs_reason"
                          ? cfg.discountCapPct > 0
                            ? `None in the first message. Up to ${cfg.discountCapPct}% in the second, on carts above ${inr(cfg.offerMinCart)}, and only with your approval.`
                            : "None. Offers are switched off."
                          : "None."}
                      </dd>
                    </div>
                    <div>
                      <dt>Last week</dt>
                      <dd>
                        {n.n} payments, {inr(n.value)}.
                      </dd>
                    </div>
                  </dl>
                  <div>
                    {ex ? (
                      <div className="sa-phone" style={{ marginTop: 0 }}>
                        <Bubble text={messageFor(ex, cfg, 1, hinglish)} />
                        {lane === "needs_reason" &&
                        cfg.discountCapPct > 0 &&
                        ex.p.amount >= cfg.offerMinCart ? (
                          <>
                            <p className="sa-phone__gap">
                              A day later, if still unpaid and you have approved offers:
                            </p>
                            <Bubble text={messageFor(ex, cfg, 2, hinglish)} />
                          </>
                        ) : null}
                      </div>
                    ) : (
                      <p className="sa-note">No example in last week's batch.</p>
                    )}
                  </div>
                </div>
              </section>
            );
          })}

          <section className="sa-rule sa-rule--locked lane--left_alone">
            <div className="sa-rule__top">
              <LaneIcon lane="left_alone" size={20} />
              <div className="sa-rule__title">
                <h3 className="sa-lane__name">{LANES.left_alone.name}</h3>
                <p className="sa-lane__rule">
                  {LANES.left_alone.rule} {LANES.left_alone.action} Last week:{" "}
                  {proj.perLane.left_alone.n} payments.
                </p>
              </div>
              <span className="sa-locked">
                <Lock size={14} aria-hidden="true" /> Cannot be switched off
              </span>
            </div>
          </section>
        </div>

        <aside className="sa-guard">
          <h2 className="sa-h2">Your rules</h2>

          <div className="sa-field">
            <label htmlFor="sa-holdout">
              Holdout <span className="sa-num">{cfg.holdoutPct}%</span>
            </label>
            <input
              id="sa-holdout"
              type="range"
              min={0}
              max={30}
              step={5}
              value={cfg.holdoutPct}
              onChange={(e) => set({ holdoutPct: Number(e.target.value) })}
            />
            <p>
              {cfg.holdoutPct > 0
                ? `${proj.holdout} of ${recoverable} recoverable customers get no message. Comparing them with the rest shows what Second Attempt caused.`
                : "With no holdout, results show what came back, not what Second Attempt caused."}
            </p>
            {cfg.holdoutPct > 0 ? (
              <p style={{ marginTop: 6 }}>
                The test ends once {TEST_HOLDOUT_TARGET} customers have been held out,{" "}
                <Assumed>
                  <b>{endWeek ? `in about week ${endWeek}` : "after week 16"}</b>
                </Assumed>{" "}
                at this simulated store. The result is read once, then. A larger holdout ends sooner
                and messages fewer customers.
              </p>
            ) : null}
          </div>

          <div className="sa-field">
            <label htmlFor="sa-cap">
              Discount cap <span className="sa-num">{cfg.discountCapPct}%</span>
            </label>
            <input
              id="sa-cap"
              type="range"
              min={0}
              max={MERCHANT.couponCap}
              step={1}
              value={cfg.discountCapPct}
              onChange={(e) => set({ discountCapPct: Number(e.target.value) })}
            />
            <p>
              Your coupon cap on Razorpay is {MERCHANT.couponCap}%. Second Attempt cannot go above
              it.
            </p>
          </div>

          <div className="sa-field">
            <div className="sa-field__label">
              <label htmlFor="sa-min">Offers only on carts above</label>
              <select
                id="sa-min"
                value={cfg.offerMinCart}
                onChange={(e) => set({ offerMinCart: Number(e.target.value) })}
              >
                <option value={1000}>₹1,000</option>
                <option value={1500}>₹1,500</option>
                <option value={2500}>₹2,500</option>
              </select>
            </div>
          </div>

          <div className="sa-field">
            <Switch
              on={cfg.quietHours}
              onChange={(v) => set({ quietHours: v })}
              label="No messages between 10:30 PM and 8 AM"
            />
          </div>

          <div className="sa-proj">
            <p>
              <b>If next week looks like last week</b>
            </p>
            <p>
              {proj.toMessage} customers get a message. {proj.holdout} are held out.{" "}
              {proj.perLane.do_not_ask.n + proj.perLane.left_alone.n} get no payment link at all.
            </p>
            <p>
              Likely to come back:{" "}
              <Assumed>
                <b>
                  {proj.lowN} to {proj.highN} payments, {inr(Math.round(proj.lowValue / 100) * 100)}{" "}
                  to {inr(Math.round(proj.highValue / 100) * 100)}
                </b>
              </Assumed>
              .
            </p>
            <p>
              Message cost: about <b>{inr(Math.max(1, Math.round(proj.cost)))}</b>. Most you could
              give away in offers: <b>{inr(Math.round(proj.offerExposure))}</b> across{" "}
              {proj.offerEligible} customers.
            </p>
          </div>

          <label className="sa-check">
            <input
              type="checkbox"
              checked={cfg.offersApproved}
              disabled={cfg.discountCapPct === 0}
              onChange={(e) => set({ offersApproved: e.target.checked })}
            />
            <span>
              Also approve offers for this week, up to {cfg.discountCapPct}% on carts above{" "}
              {inr(cfg.offerMinCart)}. Leave this off and each offer waits for you.
            </span>
          </label>

          {approved ? (
            <>
              <div className="sa-approved">
                Approved. The lanes that are on now run on their own.{" "}
                {cfg.offersApproved ? "Offers are approved for this week." : "Offers wait for you."}
              </div>
              <div className="sa-actions" style={{ marginTop: 14 }}>
                <button type="button" className="sa-btn" onClick={onNext}>
                  Watch the week
                </button>
              </div>
            </>
          ) : (
            <div className="sa-actions" style={{ marginTop: 18 }}>
              <button type="button" className="sa-btn" onClick={onApprove}>
                Approve and start
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
