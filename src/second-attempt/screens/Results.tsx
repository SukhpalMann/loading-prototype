import { useMemo, useState } from "react";
import { DAY, MERCHANT, MIN, generateWeek, inr, inrShort } from "../data";
import {
  LANES,
  RECOVERY_LANES,
  TEST_HOLDOUT_TARGET,
  heldOut,
  results,
  runWeek,
  wilson,
} from "../engine";
import type { Config, Item } from "../engine";
import { CircleAlert, CircleCheck, Hourglass } from "lucide-react";
import { Assumed, LaneIcon } from "../ui";
import { oneLinkWeek } from "../checks/one-link";

const SCALE = 0.6; // bars run from 0% to 60%
const w = (rate: number) => `${Math.min(100, (rate / SCALE) * 100)}%`;
const pc = (rate: number, digits = 0) => `${(rate * 100).toFixed(digits)}%`;
const pts = (x: number) => `${(x * 100).toFixed(1)}`;

interface WeekPoint {
  week: number;
  est: number;
  low: number;
  high: number;
  measured: boolean; // false while the holdout group is still empty
}

// Compact rupee labels for the axis: 0, ₹50K, ₹1L, ₹1.5L.
function axisInr(v: number): string {
  if (v === 0) return "0";
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (a >= 100000) return `${sign}₹${Number((a / 100000).toFixed(1))}L`;
  return `${sign}₹${Number((a / 1000).toFixed(0))}K`;
}

function niceStep(raw: number): number {
  const base = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  const f = raw / base;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * base;
}

// Cumulative revenue caused, week by week, with the range it could sit in.
// The x axis always runs to week 12, so a short period shows how little is known yet.
function CausedChart({
  series,
  shown,
  endWeek,
}: {
  series: WeekPoint[];
  shown: number;
  endWeek: number | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const data = series.slice(0, shown).filter((d) => d.measured);
  const first = data[0];
  const last = data[data.length - 1];
  if (!first || !last) return null;

  const W = 620;
  const H = 250;
  const m = { l: 56, r: 92, t: 30, b: 32 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const top = Math.max(...data.map((d) => d.high), 1);
  const bottom = Math.min(0, ...data.map((d) => d.low));
  const step = niceStep((top - bottom) / 4);
  const yMax = Math.ceil(top / step) * step;
  const yMin = Math.floor(bottom / step) * step;
  const x = (week: number) => m.l + ((week - 1) / 11) * iw;
  const y = (v: number) => m.t + (1 - (v - yMin) / (yMax - yMin)) * ih;
  const ticks: number[] = [];
  for (let v = yMin; v <= yMax + step / 2; v += step) ticks.push(Math.round(v));

  const path = (pick: (d: WeekPoint) => number, rows: WeekPoint[], start: "M" | "L") =>
    rows
      .map((d, i) => `${i === 0 ? start : "L"}${x(d.week).toFixed(1)},${y(pick(d)).toFixed(1)}`)
      .join(" ");
  const line = path((d) => d.est, data, "M");
  const band =
    data.length > 1
      ? `${path((d) => d.high, data, "M")} ${path((d) => d.low, [...data].reverse(), "L")} Z`
      : null;
  const end = endWeek !== null && endWeek <= 12 ? endWeek : null;
  const h = hover === null ? null : (data.find((d) => d.week === hover) ?? null);
  const tipShift = h === null ? "-50%" : h.week <= 2 ? "0%" : h.week >= 10 ? "-100%" : "-50%";

  return (
    <div className="sa-chart">
      <h3 className="sa-h3">What the messages caused, added up week by week</h3>
      <p className="sa-note">
        The line is the running estimate. The band is the range it could sit in. The length of the
        test was fixed in advance
        {end !== null ? `, so nothing is declared before week ${end}` : ""}: a range that clears
        zero one week can fall back the next.
      </p>
      <div className="sa-chart__plot">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Revenue caused by Second Attempt after ${last.week} ${last.week === 1 ? "week" : "weeks"}: best estimate ${inr(last.est)}, range ${inr(last.low)} to ${inr(last.high)}.`}
          onMouseMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - box.left) / box.width) * W;
            const want = ((px - m.l) / iw) * 11 + 1;
            let near = first;
            for (const d of data)
              if (Math.abs(d.week - want) < Math.abs(near.week - want)) near = d;
            setHover(near.week);
          }}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line
                className={v === 0 ? "sa-chart__zero" : "sa-chart__grid"}
                x1={m.l}
                x2={W - m.r}
                y1={y(v)}
                y2={y(v)}
              />
              <text className="sa-chart__tick" x={m.l - 8} y={y(v) + 4} textAnchor="end">
                {axisInr(v)}
              </text>
            </g>
          ))}
          {[1, 4, 8, 12].map((wk) => (
            <text key={wk} className="sa-chart__tick" x={x(wk)} y={H - 9} textAnchor="middle">
              Week {wk}
            </text>
          ))}
          {end !== null ? (
            <g>
              <line className="sa-chart__mark" x1={x(end)} x2={x(end)} y1={m.t - 4} y2={H - m.b} />
              <text
                className="sa-chart__note"
                x={x(end) + (end <= 7 ? 7 : -7)}
                y={m.t - 12}
                textAnchor={end <= 7 ? "start" : "end"}
              >
                Week {end}: the test ends and is read
              </text>
            </g>
          ) : null}
          {band ? <path className="sa-chart__band" d={band} /> : null}
          <line
            className="sa-chart__whisker"
            x1={x(last.week)}
            x2={x(last.week)}
            y1={y(last.high)}
            y2={y(last.low)}
          />
          <path className="sa-chart__line" d={line} />
          {h !== null && h.week !== last.week ? (
            <circle className="sa-chart__dot" cx={x(h.week)} cy={y(h.est)} r={4.5} />
          ) : null}
          <circle className="sa-chart__dot" cx={x(last.week)} cy={y(last.est)} r={5} />
          <text className="sa-chart__end" x={x(last.week) + 11} y={y(last.est) + 5}>
            {inrShort(last.est)}
          </text>
          {h !== null ? (
            <line className="sa-chart__cross" x1={x(h.week)} x2={x(h.week)} y1={m.t} y2={H - m.b} />
          ) : null}
        </svg>
        {h !== null ? (
          <div
            className="sa-chart__tip"
            style={{
              left: `${(x(h.week) / W) * 100}%`,
              top: `${(y(h.high) / H) * 100}%`,
              transform: `translate(${tipShift}, calc(-100% - 10px))`,
            }}
          >
            <b>After week {h.week}</b>
            <span>Running estimate {inr(h.est)}</span>
            <span>
              Range {inr(h.low)} to {inr(h.high)}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Results({
  cfg,
  weekOne,
  approved,
  onGoPlan,
}: {
  cfg: Config;
  weekOne: Item[];
  approved: boolean;
  onGoPlan: () => void;
}) {
  const [weeks, setWeeks] = useState<1 | 4 | 12>(1);

  const later = useMemo(
    () =>
      [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map(
        (i) => runWeek(generateWeek(i), cfg).items,
      ),
    [cfg],
  );
  const all = useMemo(() => [weekOne, ...later], [weekOne, later]);
  const items = useMemo(() => all.slice(0, weeks), [all, weeks]);
  const r = useMemo(() => results(items), [items]);

  const series = useMemo<WeekPoint[]>(
    () =>
      all.slice(0, 12).map((_, i) => {
        const upTo = results(all.slice(0, i + 1));
        return {
          week: i + 1,
          est: upTo.incremental,
          low: upTo.incrementalLow,
          high: upTo.incrementalHigh,
          measured: upTo.hasRange,
        };
      }),
    [all],
  );

  // The live screen stops counting at Sunday 11:59 PM. This screen follows each of the week's
  // failed payments to its end, so a few messages and payments land after that moment.
  const afterSunday = useMemo(() => {
    const first = weekOne[0];
    if (!first) return { messages: 0, paid: 0 };
    const end = generateWeek(first.p.week).start + 7 * DAY - MIN;
    let messages = 0,
      paid = 0;
    for (const it of weekOne) {
      if (it.sendAt !== null && it.sendAt > end) messages++;
      if (it.offerState === "sent" && it.offerAt !== null && it.offerAt > end) messages++;
      if (
        (it.outcome === "recovered" || it.outcome === "recovered_offer") &&
        it.paidAt !== null &&
        it.paidAt > end
      )
        paid++;
    }
    return { messages, paid };
  }, [weekOne]);

  // What one payment link for everyone would have done with the same customers, under the same
  // assumed rates. A bad moment is a link sent into a live downtime or to a pending debit.
  const oneLink = useMemo(() => {
    const t = { paid: 0, value: 0, badMoment: 0, waitValue: 0 };
    for (let i = 1; i <= weeks; i++) {
      const w = oneLinkWeek(generateWeek(i), cfg.holdoutPct);
      t.paid += w.paid;
      t.value += w.value;
      t.badMoment += w.intoDowntime + w.pendingAsked;
      t.waitValue += w.valueByLane.wait_retry;
    }
    return t;
  }, [weeks, cfg.holdoutPct]);

  // The test ends in the week the planned number of held-out customers is reached. The result is
  // read once, on the data up to that week, and never earlier.
  const endWeek = useMemo(() => {
    if (cfg.holdoutPct === 0) return null;
    let held = 0;
    for (let n = 1; n <= all.length; n++) {
      held += heldOut(all[n - 1] ?? []);
      if (held >= TEST_HOLDOUT_TARGET) return n;
    }
    return null;
  }, [all, cfg.holdoutPct]);
  const read = useMemo(
    () => (endWeek !== null && weeks >= endWeek ? results(all.slice(0, endWeek)) : null),
    [all, endWeek, weeks],
  );

  const variants = useMemo(() => {
    const tally: Record<string, { n: number; paid: number }> = {};
    for (const it of items.flat()) {
      if (
        it.holdout ||
        it.sendAt === null ||
        it.movedByReply ||
        !RECOVERY_LANES.includes(it.t.lane)
      )
        continue;
      const k = it.t.variant;
      tally[k] = tally[k] ?? { n: 0, paid: 0 };
      tally[k].n++;
      if (it.outcome === "recovered" || it.outcome === "recovered_offer") tally[k].paid++;
    }
    return tally;
  }, [items]);

  if (!approved) {
    return (
      <div>
        <h1 className="sa-h1">There is nothing to measure yet.</h1>
        <p className="sa-lede">Results appear once the plan is approved and a week has run.</p>
        <div className="sa-actions">
          <button type="button" className="sa-btn" onClick={onGoPlan}>
            Go to the plan
          </button>
        </div>
      </div>
    );
  }

  const [tLo, tHi] = wilson(r.treatedPaidN, r.treatedN);
  const waitEdge = (r.byLane["wait_retry"]?.paidValue ?? 0) - oneLink.waitValue;
  const anyway = r.treatedPaidValue - r.incremental;
  const span = weeks === 1 ? "one week" : `${weeks} weeks`;
  const noHoldout = cfg.holdoutPct === 0 || r.holdoutN === 0;
  const slip = variants["slip"],
    once = variants["declined_once"],
    down = variants["downtime"];

  return (
    <div>
      <div className="sa-res__bar">
        <span className="sa-seg" role="group" aria-label="Period">
          {([1, 4, 12] as const).map((n) => (
            <button key={n} type="button" aria-pressed={weeks === n} onClick={() => setWeeks(n)}>
              {n === 1 ? "Week 1" : `${n} weeks`}
            </button>
          ))}
        </span>
        <span className="sa-tag sa-tag--sim">
          Simulated on synthetic data. Recovery rates are assumptions to be tested.
        </span>
      </div>

      {noHoldout ? (
        <h1 className="sa-h1">
          After {span}, {inrShort(r.treatedPaidValue)} came back. Nobody can say how much of it
          Second Attempt caused.
        </h1>
      ) : read === null ? (
        <h1 className="sa-h1">
          After {span}, {inrShort(r.treatedPaidValue)} came back. It is too early to say how much
          the messages caused.
        </h1>
      ) : read.aboveZero ? (
        <h1 className="sa-h1">
          After {span}, {inrShort(r.incremental)} came back that would not have on its own.
        </h1>
      ) : (
        <h1 className="sa-h1">
          After {span}, {inrShort(r.treatedPaidValue)} came back. The test ended without a clear
          answer.
        </h1>
      )}

      <p className="sa-lede">
        This is measured against customers who got no message. It does not show that four lanes beat
        one link. The first card on the right makes that comparison.
      </p>

      <div className="sa-res">
        <section className="sa-proof">
          <h2 className="sa-h2">Did the messages cause it?</h2>
          <div className="sa-bar">
            <div className="sa-bar__label">
              <span>Got a message</span>
              <span>
                <b className="sa-num">{pc(r.treatedRate, 1)}</b> paid, {r.treatedPaidN} of{" "}
                {r.treatedN}, {inr(r.treatedMean)} a customer
              </span>
            </div>
            <div className="sa-bar__track">
              <div className="sa-bar__fill" style={{ width: w(r.treatedRate) }} />
              <div
                className="sa-bar__range"
                style={{ left: w(tLo), width: `calc(${w(tHi)} - ${w(tLo)})` }}
              />
            </div>
          </div>
          <div className="sa-bar">
            <div className="sa-bar__label">
              <span>Held out, no message</span>
              <span>
                {noHoldout ? (
                  "No holdout group"
                ) : (
                  <>
                    <b className="sa-num">{pc(r.holdoutRate, 1)}</b> paid, {r.holdoutPaidN} of{" "}
                    {r.holdoutN}, {inr(r.holdoutMean)} a customer
                  </>
                )}
              </span>
            </div>
            <div className="sa-bar__track">
              {noHoldout ? null : (
                <>
                  <div
                    className="sa-bar__fill sa-bar__fill--hold"
                    style={{ width: w(r.holdoutRate) }}
                  />
                  <div
                    className="sa-bar__range"
                    style={{
                      left: w(r.holdoutLow),
                      width: `calc(${w(r.holdoutHigh)} - ${w(r.holdoutLow)})`,
                    }}
                  />
                </>
              )}
            </div>
          </div>
          <p className="sa-note" style={{ marginTop: 8 }}>
            The black lines show the range each true rate could sit in, given how few customers are
            in the group. Money a customer counts everyone in the group, payers or not.
          </p>

          {noHoldout ? (
            <div className="sa-verdict sa-verdict--no">
              <CircleAlert size={20} aria-hidden="true" />
              <div>
                <b>Nothing can be measured.</b> Without a holdout, every payment after a message
                looks like a win, including customers who were coming back anyway. Set a holdout on
                the plan.
              </div>
            </div>
          ) : read === null ? (
            <div className="sa-verdict sa-verdict--no">
              <Hourglass size={20} aria-hidden="true" />
              <div>
                <b>Too early to read.</b> The test ends when {TEST_HOLDOUT_TARGET} customers have
                been held out{endWeek !== null ? `, in about week ${endWeek}` : ""}. So far{" "}
                {r.holdoutN} {r.holdoutN === 1 ? "has" : "have"}. Customers who got a message have
                paid {inr(r.treatedMean)} each and those held out {inr(r.holdoutMean)}, a gap that
                means nothing at this size.
              </div>
            </div>
          ) : read.aboveZero ? (
            <div className="sa-verdict sa-verdict--yes">
              <CircleCheck size={20} aria-hidden="true" />
              <div>
                <b>The planned test has ended.</b> Customers who got a message paid{" "}
                {inr(read.perCustomer)} more each than those held out, in a range of{" "}
                {inr(read.perCustomerLow)} to {inr(read.perCustomerHigh)}. They also paid{" "}
                {pts(read.lift)} points more often.
              </div>
            </div>
          ) : (
            <div className="sa-verdict sa-verdict--no">
              <CircleAlert size={20} aria-hidden="true" />
              <div>
                <b>The planned test has ended without a clear answer.</b> The gap could be anywhere
                from {inr(read.perCustomerLow)} to {inr(read.perCustomerHigh)} a customer, which
                includes zero. A larger holdout or a longer test would narrow it.
              </div>
            </div>
          )}

          {noHoldout ? null : <CausedChart series={series} shown={weeks} endWeek={endWeek} />}

          <div className="sa-money">
            <div>
              <span>Paid after a message</span>
              <span className="sa-num">
                <Assumed>{inr(r.treatedPaidValue)}</Assumed>
              </span>
            </div>
            {noHoldout ? null : (
              <>
                <div>
                  <span>Would have come back anyway, at the held-out customers' pace</span>
                  <span className="sa-num">{inr(-anyway)}</span>
                </div>
                <div>
                  <span>Caused by the messages{read?.aboveZero ? "" : ", running estimate"}</span>
                  <span className="sa-num">{inr(r.incremental)}</span>
                </div>
                <div>
                  <span>Range for that figure</span>
                  <span className="sa-num">
                    {r.hasRange
                      ? `${inr(r.incrementalLow)} to ${inr(r.incrementalHigh)}`
                      : "Too few held out to say"}
                  </span>
                </div>
              </>
            )}
            <div>
              <span>Cost of {r.messages} messages</span>
              <span className="sa-num">{inr(-Math.max(1, Math.round(r.messageCost)))}</span>
            </div>
            {noHoldout ? null : (
              <div className="is-total">
                <span>Net gain{read?.aboveZero ? "" : ", running estimate"}</span>
                <span className="sa-num">{inr(r.net)}</span>
              </div>
            )}
          </div>
          <p className="sa-note" style={{ marginTop: 10 }}>
            Discounts given: {inr(r.discountCost)} on {r.offerPaid}{" "}
            {r.offerPaid === 1 ? "order" : "orders"}, already taken out of the figures above. A{" "}
            {MERCHANT.couponCap}% coupon on every recovered order would have cost{" "}
            {inr(Math.round((r.treatedPaidValue + r.discountCost) * (MERCHANT.couponCap / 100)))}.
          </p>
          {weeks === 1 && afterSunday.messages + afterSunday.paid > 0 ? (
            <p className="sa-note" style={{ marginTop: 6 }}>
              This screen follows each of the week's failed payments to its end.{" "}
              {afterSunday.messages} {afterSunday.messages === 1 ? "message" : "messages"} and{" "}
              {afterSunday.paid} {afterSunday.paid === 1 ? "payment" : "payments"} came after Sunday
              midnight, so these totals are above the live screen's last count.
            </p>
          ) : null}
        </section>

        <div>
          <section className="sa-card">
            <h2 className="sa-h2">Against one link for everyone</h2>
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Paid</th>
                  <th>Came back</th>
                  <th>Links at a bad moment</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>One link for all</td>
                  <td>{oneLink.paid}</td>
                  <td>{inr(oneLink.value)}</td>
                  <td>{oneLink.badMoment}</td>
                </tr>
                <tr>
                  <td>Four lanes</td>
                  <td>{r.treatedPaidN}</td>
                  <td>{inr(r.treatedPaidValue)}</td>
                  <td>{r.movedByReply}</td>
                </tr>
              </tbody>
            </table>
            <p className="sa-note" style={{ marginTop: 10 }}>
              The same customers under the same assumed rates. The lanes bring back{" "}
              {inr(Math.abs(r.treatedPaidValue - oneLink.value))}{" "}
              {r.treatedPaidValue >= oneLink.value ? "more" : "less"}. A bad moment is a link sent
              while the customer's bank was still down, or while money was pending. The lanes' count
              is pending debits that could not be seen when the payment was sorted. Each of those
              links was switched off after a reply.
            </p>
            <p className="sa-note" style={{ marginTop: 6 }}>
              {waitEdge > 0 && r.treatedPaidValue > oneLink.value
                ? `${inr(waitEdge)} of the extra money comes from waiting out bank downtimes, which this synthetic data may make more common than they are. `
                : ""}
              One store is too small to measure a gap this size. A real test needs thousands of
              customers in each group.
            </p>
          </section>

          <section className="sa-card">
            <h2 className="sa-h2">By lane</h2>
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Lane</th>
                  <th>Messaged</th>
                  <th>Paid</th>
                  <th>Rate</th>
                  <th>Came back</th>
                </tr>
              </thead>
              <tbody>
                {RECOVERY_LANES.map((lane) => {
                  const L = r.byLane[lane]!;
                  return (
                    <tr key={lane}>
                      <td>
                        <span className={`sa-tag lane--${lane}`}>{LANES[lane].name}</span>
                      </td>
                      <td>{L.treated}</td>
                      <td>{L.paid}</td>
                      <td>
                        <span className={`sa-meter lane--${lane}`} aria-hidden="true">
                          <i style={{ width: w(L.treated ? L.paid / L.treated : 0) }} />
                        </span>
                        {L.treated ? pc(L.paid / L.treated) : "0%"}
                      </td>
                      <td>{inr(L.paidValue)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="sa-card">
            <h2 className="sa-h2">What the lanes did differently</h2>
            <ul className="sa-prev">
              <li>
                <LaneIcon lane="wait_retry" />
                <span className="sa-num">{r.heldForDowntime}</span>
                <p>
                  <b>Messages held</b> until the customer's bank was working again.
                </p>
              </li>
              <li>
                <LaneIcon lane="do_not_ask" />
                <span className="sa-num">{r.pendingProtected}</span>
                <p>
                  <b>Customers with money in limbo.</b> {r.pendingProtected - r.movedByReply} got no
                  link because the amount was pending. {r.movedByReply} got a link, reported a
                  debit, and had it switched off. The simulation assumes each of them replied.
                </p>
              </li>
              <li>
                <LaneIcon lane="do_not_ask" />
                <span className="sa-num">{r.suppressedPaid}</span>
                <p>
                  <b>Links not sent</b> to customers who had already paid.
                </p>
              </li>
              <li>
                <LaneIcon lane="left_alone" />
                <span className="sa-num">{r.leftAlone}</span>
                <p>
                  <b>Customers left alone</b> for consent or risk.
                </p>
              </li>
            </ul>
          </section>

          <section className="sa-card">
            <h2 className="sa-h2">What changes next week</h2>
            <ul className="sa-learn">
              {once &&
              slip &&
              once.n >= 20 &&
              slip.paid / Math.max(1, slip.n) - once.paid / once.n >= 0.08 ? (
                <li>
                  <b>A test is proposed for declines with no cause.</b>
                  They paid {pc(once.paid / once.n)} of the time after a retry link, against{" "}
                  {pc(slip.paid / Math.max(1, slip.n))} for customer slips. That gap does not show
                  another message would do better, so half of them would be shown other ways to pay
                  first, and the two compared.
                </li>
              ) : (
                <li>
                  <b>No lane changes yet.</b>
                  No group is large enough to tell a real difference from noise. A lane changes only
                  after a test inside that group.
                </li>
              )}
              {down && down.n >= 20 ? (
                <li>
                  <b>Waiting for the bank is kept.</b>
                  {down.paid} of {down.n} customers paid once their bank was back. The hold stays as
                  it is.
                </li>
              ) : null}
              <li>
                <b>
                  {noHoldout
                    ? "A holdout is recommended."
                    : read?.aboveZero
                      ? "The holdout can shrink."
                      : "The holdout stays."}
                </b>
                {noHoldout
                  ? "Without one, nothing above can be checked."
                  : read === null
                    ? `${cfg.holdoutPct}% stays until the test ends${endWeek !== null ? `, in about week ${endWeek}` : ""}.`
                    : read.aboveZero
                      ? `The planned test ended with its range above zero. Dropping to 5% messages more customers and keeps a check running.`
                      : `The test ended without a clear answer, so ${cfg.holdoutPct}% stays for another round. A larger share would shorten it.`}
              </li>
            </ul>
            <p className="sa-note" style={{ marginTop: 8 }}>
              These proposals are computed from the simulated outcomes above. In the product none
              would apply until you approve it. This prototype only lists them.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
