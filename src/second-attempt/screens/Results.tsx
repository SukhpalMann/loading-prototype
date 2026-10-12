import { useMemo, useState } from "react";
import { MERCHANT, generateWeek, inr, inrShort } from "../data";
import { LANES, RECOVERY_LANES, results, runWeek, wilson } from "../engine";
import type { Config, Item } from "../engine";
import { CircleAlert, CircleCheck, Hourglass } from "lucide-react";
import { Assumed, LaneIcon } from "../ui";

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
  proofWeek,
}: {
  series: WeekPoint[];
  shown: number;
  proofWeek: number | null;
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
  const proof = proofWeek !== null && proofWeek <= shown ? proofWeek : null;
  const h = hover === null ? null : (data.find((d) => d.week === hover) ?? null);
  const tipShift = h === null ? "-50%" : h.week <= 2 ? "0%" : h.week >= 10 ? "-100%" : "-50%";

  return (
    <div className="sa-chart">
      <h3 className="sa-h3">What Second Attempt caused, added up week by week</h3>
      <p className="sa-note">
        The line is the best estimate. The band is the range it could sit in. While the band touches
        zero, nothing is proven.
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
          {proof !== null ? (
            <g>
              <line
                className="sa-chart__mark"
                x1={x(proof)}
                x2={x(proof)}
                y1={m.t - 4}
                y2={H - m.b}
              />
              <text
                className="sa-chart__note"
                x={x(proof) + (proof <= 7 ? 7 : -7)}
                y={m.t - 12}
                textAnchor={proof <= 7 ? "start" : "end"}
              >
                Week {proof}: the range clears zero
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
            <span>Best estimate {inr(h.est)}</span>
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
          measured: upTo.holdoutN > 0,
        };
      }),
    [all],
  );

  const weeksToProof = useMemo(() => {
    if (cfg.holdoutPct === 0) return null;
    for (let n = 1; n <= all.length; n++) if (results(all.slice(0, n)).proven) return n;
    return null;
  }, [all, cfg.holdoutPct]);

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
      ) : r.proven ? (
        <h1 className="sa-h1">
          After {span}, {inrShort(r.incremental)} came back that would not have on its own.
        </h1>
      ) : (
        <h1 className="sa-h1">
          After {span}, {inrShort(r.treatedPaidValue)} came back. It is too early to say how much
          Second Attempt caused.
        </h1>
      )}

      <div className="sa-res">
        <section className="sa-proof">
          <h2 className="sa-h2">Did the messages cause it?</h2>
          <div className="sa-bar">
            <div className="sa-bar__label">
              <span>Got a message</span>
              <span>
                <b className="sa-num">{pc(r.treatedRate, 1)}</b> paid, {r.treatedPaidN} of{" "}
                {r.treatedN}
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
                    {r.holdoutN}
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
            in the group.
          </p>

          {noHoldout ? (
            <div className="sa-verdict sa-verdict--no">
              <CircleAlert size={20} aria-hidden="true" />
              <div>
                <b>No proof is possible.</b> Without a holdout, every payment after a message looks
                like a win, including customers who were coming back anyway. Set a holdout on the
                plan to measure the lift.
              </div>
            </div>
          ) : r.proven ? (
            <div className="sa-verdict sa-verdict--yes">
              <CircleCheck size={20} aria-hidden="true" />
              <div>
                <b>The gap is real.</b> Customers who got a message paid {pts(r.lift)} points more
                often. Even at the cautious end of the range the gap is {pts(r.liftLow)} points.
              </div>
            </div>
          ) : (
            <div className="sa-verdict sa-verdict--no">
              <Hourglass size={20} aria-hidden="true" />
              <div>
                <b>Not proven yet.</b> The held-out group is only {r.holdoutN} customers, so the
                true gap could be anywhere from {pts(r.liftLow)} to {pts(r.liftHigh)} points.{" "}
                {weeksToProof
                  ? `At a ${cfg.holdoutPct}% holdout this store needs about ${weeksToProof} weeks. A larger holdout proves it sooner and messages fewer customers.`
                  : "A larger holdout would prove it sooner."}
              </div>
            </div>
          )}

          {noHoldout ? null : (
            <CausedChart series={series} shown={weeks} proofWeek={weeksToProof} />
          )}

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
                  <span>Would have come back anyway, at the holdout's rate</span>
                  <span className="sa-num">{inr(-anyway)}</span>
                </div>
                <div>
                  <span>Caused by Second Attempt{r.proven ? "" : ", best estimate"}</span>
                  <span className="sa-num">{inr(r.incremental)}</span>
                </div>
                <div>
                  <span>Range for that figure</span>
                  <span className="sa-num">
                    {inr(r.incrementalLow)} to {inr(r.incrementalHigh)}
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
                <span>Net gain{r.proven ? "" : ", not yet proven"}</span>
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
        </section>

        <div>
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
            <h2 className="sa-h2">What the sorting prevented</h2>
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
                  <b>Customers not asked to pay twice</b> while their money was pending.{" "}
                  {r.movedByReply} of them told us in a reply.
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
                  <b>Declines with no cause move lanes.</b>
                  Customers declined once with no cause given paid {pc(once.paid / once.n)} of the
                  time in Retry now, against {pc(slip.paid / Math.max(1, slip.n))} for customer
                  slips. From next week they are shown other ways to pay first.
                </li>
              ) : (
                <li>
                  <b>No lane changes yet.</b>
                  No group is large enough to tell a real difference from noise. Lanes change only
                  when the gap is clear.
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
                    : r.proven
                      ? "The holdout can shrink."
                      : "The holdout stays."}
                </b>
                {noHoldout
                  ? "Without one, nothing above can be checked."
                  : r.proven
                    ? `The lift is proven at ${cfg.holdoutPct}%. Dropping to 5% messages more customers and keeps the check running.`
                    : `${cfg.holdoutPct}% stays until the lift is proven${weeksToProof ? `, about week ${weeksToProof}` : ""}.`}
              </li>
            </ul>
            <p className="sa-note" style={{ marginTop: 8 }}>
              These adjustments are computed from the simulated outcomes above. You approve each one
              before it applies.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
