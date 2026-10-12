import { useMemo, useState } from "react";
import { MERCHANT, generateWeek } from "./data";
import type { FailedPayment, Week } from "./data";
import { ASSUMPTIONS, DEFAULT_CONFIG, runWeek } from "./engine";
import type { Config } from "./engine";
import { Inspector } from "./ui";
import { Brief } from "./screens/Brief";
import { Plan } from "./screens/Plan";
import { Live } from "./screens/Live";
import { Results } from "./screens/Results";

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

  const run = useMemo(
    () => runWeek(thisWeek, cfg, { pausedAt, offersApprovedAt }),
    [thisWeek, cfg, pausedAt, offersApprovedAt],
  );

  const go = (s: Step) => {
    setStep(s);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="sa">
      <header className="sa-top">
        <div className="sa-top__in">
          <div className="sa-mark" aria-label="Second Attempt">
            <span style={{ background: "#3fbf85" }} />
            <span style={{ background: "#f0b445" }} />
            <span style={{ background: "#8aa5e6" }} />
            <span style={{ background: "#e481b4", marginRight: 10 }} />
            Second Attempt
          </div>
          <div className="sa-store">
            <b>{MERCHANT.name}</b>, a fictional {MERCHANT.what}, {MERCHANT.monthly}
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
        </div>
      </header>

      <main className="sa-main">
        {step === "brief" ? (
          <Brief
            week={lastWeek}
            onInspect={(p) => setInspect({ p, week: lastWeek })}
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
          All data is synthetic and the model's judgments are scripted. Nothing is sent to anyone.
        </span>
        <button type="button" onClick={() => setAbout(true)}>
          Assumptions and what is simulated
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
      {about ? <About onClose={() => setAbout(false)} /> : null}
    </div>
  );
}

function About({ onClose }: { onClose: () => void }) {
  const A = ASSUMPTIONS;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
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
          <b>The sorting is real logic, not a live model.</b> Lanes are assigned by code that reads
          the same fields a model would. In production, a language model reads the long tail of bank
          error text and customer replies. Here those cases are written as explicit checks so the
          prototype behaves the same way every time.
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
          payment failed. I could not verify how that product treats downtime or pending amounts, so
          the comparison is with the rule, not with the product.
        </p>
        <p>
          <b>What Razorpay already does inside checkout.</b> Its Intelligent Payment Retry weighs
          error messages and instrument downtimes to suggest a next step while the customer is still
          in checkout. Second Attempt starts after the customer has left, where the public material
          shows one link for everyone.
        </p>
        <p>
          <b>Not built.</b> No message is sent, no payment link is real, and there is no login.
          Learning is shown as proposed adjustments computed from the simulated outcomes.
        </p>
      </div>
    </div>
  );
}
