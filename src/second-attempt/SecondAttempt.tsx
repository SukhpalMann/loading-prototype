import { useMemo, useState } from "react";
import { MERCHANT, generateWeek, inr } from "./data";
import type { FailedPayment, Week } from "./data";
import { ASSUMPTIONS, DEFAULT_CONFIG, TEST_HOLDOUT_TARGET, runWeek } from "./engine";
import type { Config } from "./engine";
import { Inspector } from "./ui";
import { oneLinkAgainstLanes } from "./checks/one-link";
import { MODEL_SCORE, RULE_SCORE } from "./checks/replies/score";
import { Brief } from "./screens/Brief";
import { Plan } from "./screens/Plan";
import { Live } from "./screens/Live";
import { Results } from "./screens/Results";
import { ReplyTest } from "./screens/ReplyTest";

type Step = "brief" | "plan" | "live" | "results";
const STEPS: { id: Step; label: string }[] = [
  { id: "brief", label: "Last week" },
  { id: "plan", label: "The plan" },
  { id: "live", label: "This week, live" },
  { id: "results", label: "What it achieved" },
];

export default function SecondAttempt() {
  const lastWeek = useMemo(() => generateWeek(0), []);
  const thisWeek = useMemo(() => generateWeek(1), []);
  const [step, setStep] = useState<Step>("brief");
  const [cfg, setCfg] = useState<Config>(DEFAULT_CONFIG);
  const [approved, setApproved] = useState(false);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [offersApprovedAt, setOffersApprovedAt] = useState<number | null>(null);
  const [clock, setClock] = useState(thisWeek.start);
  const [inspect, setInspect] = useState<{ p: FailedPayment; week: Week } | null>(null);
  const [about, setAbout] = useState(false);
  const [replyTest, setReplyTest] = useState(false);

  const run = useMemo(
    () => runWeek(thisWeek, cfg, { pausedAt, offersApprovedAt }),
    [thisWeek, cfg, pausedAt, offersApprovedAt],
  );

  const go = (s: Step) => {
    setStep(s);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="sa" data-step={step}>
      <header className="sa-top">
        <div className="sa-top__in">
          <div className="sa-mark" aria-label="Second Attempt">
            <span className="sa-mark__lanes" aria-hidden="true">
              <i className="lane--retry_now" />
              <i className="lane--wait_retry" />
              <i className="lane--do_not_ask" />
              <i className="lane--needs_reason" />
            </span>
            Second Attempt
          </div>
          <nav className="sa-steps" aria-label="Steps">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className="sa-step"
                aria-current={step === s.id ? "step" : undefined}
                onClick={() => go(s.id)}
              >
                <i>{i + 1}</i>
                {s.label}
              </button>
            ))}
          </nav>
          <div className="sa-store">
            <b>{MERCHANT.name}</b>
            <span>
              A fictional {MERCHANT.what}, {MERCHANT.monthly}
            </span>
          </div>
        </div>
      </header>

      <main className="sa-main">
        {step === "brief" ? (
          <Brief
            week={lastWeek}
            onInspect={(p) => setInspect({ p, week: lastWeek })}
            onReplyTest={() => setReplyTest(true)}
            onNext={() => go("plan")}
          />
        ) : null}
        {step === "plan" ? (
          <Plan
            week={lastWeek}
            cfg={cfg}
            setCfg={(c) => {
              // Approving offers on the plan covers the whole week. Withdrawing approval clears any mid-week approval too.
              if (!c.offersApproved) setOffersApprovedAt(null);
              setCfg(c);
            }}
            approved={approved}
            onApprove={() => setApproved(true)}
            onNext={() => go("live")}
          />
        ) : null}
        {step === "live" ? (
          <Live
            week={thisWeek}
            cfg={cfg}
            items={run.items}
            events={run.events}
            clock={clock}
            setClock={setClock}
            pausedAt={pausedAt}
            setPausedAt={setPausedAt}
            approved={approved}
            offersApprovedAt={offersApprovedAt}
            onApproveOffers={(at) => {
              setOffersApprovedAt(at);
              setCfg({ ...cfg, offersApproved: true });
            }}
            onInspect={(p) => setInspect({ p, week: thisWeek })}
            onReplyTest={() => setReplyTest(true)}
            onGoPlan={() => go("plan")}
            onNext={() => go("results")}
          />
        ) : null}
        {step === "results" ? (
          <Results cfg={cfg} weekOne={run.items} approved={approved} onGoPlan={() => go("plan")} />
        ) : null}
      </main>

      <footer className="sa-foot">
        <span>
          Concept prototype for the Razorpay x ISB AI PM Build Challenge. Not a Razorpay product.
        </span>
        <span>
          All data is synthetic. The sorting is rules and the replies are scripted. Nothing is sent
          to anyone.
        </span>
        <button type="button" onClick={() => setAbout(true)}>
          Assumptions and what is simulated
        </button>
        <button type="button" onClick={() => setReplyTest(true)}>
          The reply test
        </button>
      </footer>

      {inspect ? (
        <Inspector
          payment={inspect.p}
          week={inspect.week}
          cfg={cfg}
          onClose={() => setInspect(null)}
        />
      ) : null}
      {about ? (
        <About
          onClose={() => setAbout(false)}
          onReplyTest={() => {
            setAbout(false);
            setReplyTest(true);
          }}
        />
      ) : null}
      {replyTest ? <ReplyTest onClose={() => setReplyTest(false)} /> : null}
    </div>
  );
}

function About({ onClose, onReplyTest }: { onClose: () => void; onReplyTest: () => void }) {
  const A = ASSUMPTIONS;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const edge = useMemo(() => oneLinkAgainstLanes(12), []);
  return (
    <div className="sa-modal" role="dialog" aria-label="Assumptions" onClick={onClose}>
      <div className="sa-modal__box" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="sa-drawer__close" onClick={onClose}>
          Close
        </button>
        <h2 className="sa-h2">What is real, what is assumed, what is simulated</h2>
        <p>
          <b>Synthetic data.</b> {MERCHANT.name} and every customer, payment and downtime here are
          invented. The fields follow Razorpay's public payment entity and Payment Downtime API. The
          UPI reason codes and their descriptions come from Razorpay's public UPI error
          documentation. Card and netbanking values are illustrative.
        </p>
        <p>
          <b>The mix of causes</b> follows the split Razorpay has published: about 40% bank side,
          30% customer drop-off, 20% gateway side and 10% risk rules. The finer split is my
          assumption.
        </p>
        <p>
          <b>The sorting is rules, not a model.</b> Lanes are assigned by code, and no model is
          called anywhere in this prototype. The role proposed for a language model is narrow:
          reading unfamiliar bank error text and customers' free-text replies, and handing
          structured facts to the rules. Verified payment status and rules would still decide every
          action, and the model would have to beat a rules-and-keywords baseline before it shipped.
          The reply exchange on the live screen is scripted.
        </p>
        <p>
          <b>One part of that has been tested.</b> I wrote {RULE_SCORE.total} customer replies by
          hand, {RULE_SCORE.moneyMoved} of which say that money left the account or the order is
          paid. A keyword rule, fixed before the replies existed, got {RULE_SCORE.correct} right: it
          caught {RULE_SCORE.caught}, missed {RULE_SCORE.missed.length} and raised{" "}
          {RULE_SCORE.falseAlarms.length} false alarms. A model got {MODEL_SCORE.correct} right.
          Both sets of answers were committed before the answer key was opened. The model's answers
          came from Claude in the build session, working from a fixed prompt, not from a call made
          by this prototype. The set is small and was built to include hard cases, so it shows that
          a gap exists, not how large it is.{" "}
          <button type="button" className="sa-linkbtn" onClick={onReplyTest}>
            See all {RULE_SCORE.total} replies
          </button>
          .
        </p>
        <p>
          <b>Outcomes are simulated</b> from these assumed rates. None of them is measured, and
          measuring them is the first test to run.
        </p>
        <ul>
          <li>
            Comes back with no message: {pct(A.organicReturn.customer_auth)} after a customer slip,{" "}
            {pct(A.organicReturn.bank_down)} after a bank downtime,{" "}
            {pct(A.organicReturn.funds_limit)} after a funds or limit decline.
          </li>
          <li>
            Pays after a Retry now message: {pct(A.retryNow.customer_auth)} after a slip,{" "}
            {pct(A.retryNow.gateway_tech)} after a technical fault, {pct(A.retryNow.unclear)} after
            an unexplained decline.
          </li>
          <li>Pays after Wait, then retry: {pct(A.waitRetry.bank_down)}.</li>
          <li>
            Pays after being shown other ways to pay: {pct(A.needsReasonStep1.funds_limit)}. An
            offer adds {pct(A.offerLift)}.
          </li>
          <li>Pending amounts that clear and confirm the order: {pct(A.lateAuthCaptured)}.</li>
          <li>
            Message cost: ₹{A.costWhatsappUtility} for a WhatsApp utility message and ₹
            {A.costWhatsappMarketing} for an offer, the India rates a vendor quotes from Meta. ₹
            {A.costSms} per SMS is assumed.
          </li>
        </ul>
        <p>
          <b>The comparison rule</b> is one payment link 30 minutes after every failure. Razorpay's
          public material describes its Failed Payment Recovery as sending a link to customers whose
          payment failed. I could not verify how that product treats downtime, pending amounts,
          orders paid later or risk blocks, so the comparison is with the simple rule, not with the
          product. If the product already skips paid orders and risk blocks, 15 of last week's 68
          links are misdirected, not 30.
        </p>
        <p>
          <b>What exists already.</b> Razorpay's Intelligent Payment Retry weighs error messages and
          instrument downtimes to suggest a next step while the customer is still in checkout.
          Cashfree Resolve, described by Cashfree in September 2026, places an AI voice call within
          60 seconds of a failed payment and opens with the likely failure reason. Second Attempt is
          the message-based version of that idea for the time after checkout, and it adds two
          things: deciding when not to contact a customer at all, and a holdout that measures the
          result.
        </p>
        <p>
          <b>How the result is measured, and its limits.</b> Money collected per customer, with
          every customer kept in the group they were assigned to and non-payers counted as zero. The
          range is a Welch interval on the difference between the two groups. The test length is
          fixed in advance at {TEST_HOLDOUT_TARGET} held-out customers and the result is read once,
          at the end. On the default plan the range is above zero in week 8 and back across it in
          week 10, which is why it is not read early.
        </p>
        <p>
          <b>Where the lanes' edge over one link comes from.</b> Over 12 weeks the lanes bring back{" "}
          {inr(edge.extraValue)} more than one link for everyone. {inr(edge.edgeByLane.wait_retry)}{" "}
          of that comes from waiting out bank downtimes. The synthetic data puts 16% of failed
          payments inside a downtime. NPCI's chief put UPI technical declines at 0.7 to 0.8% of all
          transactions in 2024, so on an ordinary day the share is probably lower, and the edge with
          it: about {inr(edge.edgeIfDowntimeShareIs(0.05))} if downtimes account for 5% of failures.
          Telling the two rules apart needs about{" "}
          {(Math.round(edge.groupSizeNeeded / 100) * 100).toLocaleString("en-IN")} customers in each
          group. One store of this size has about {Math.round(edge.lanes.messaged / 100) * 100} in a
          quarter, so that test has to be pooled across merchants.
        </p>
        <p>
          <b>A debit with no order.</b> RBI's 2019 rule on failed transactions requires
          auto-reversal within five days when a UPI payment to a merchant is debited but not
          confirmed. The status message cites that rule for UPI payments only. Whether a pending
          debit can be seen when a payment is sorted is not verified: I found no such field in
          Razorpay's public payment record. In the simulation every customer whose debit could not
          be seen replies to the message. Real customers may not.
        </p>
        <p>
          <b>Not built.</b> No message is sent, no payment link is real, and there is no login.
          Learning is shown as proposed adjustments computed from the simulated outcomes.
        </p>
      </div>
    </div>
  );
}
