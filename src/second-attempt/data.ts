// Second Attempt: synthetic data.
// Every record here is SYNTHETIC. Field names follow Razorpay's public payment entity
// (error_code, error_source, error_step, error_reason, error_description) and Payment
// Downtime entity (method, instrument, severity, begin, end). UPI reason values and
// descriptions are taken from Razorpay's public UPI error docs; card and netbanking
// values are illustrative. No real customer, merchant or payment is represented.

export type Method = "upi" | "card" | "netbanking";

export type Cause =
  | "customer_auth" // customer slipped: OTP, timeout, cancel
  | "gateway_tech" // transient technical fault, no downtime on record
  | "bank_down" // failed inside a reported downtime window
  | "funds_limit" // insufficient funds or a limit
  | "unclear" // generic decline, no cause given
  | "late_auth" // money left the customer's account, not yet confirmed
  | "risk_block"; // blocked by a risk check

export interface Downtime {
  id: string;
  method: Method;
  instrument: string;
  label: string;
  severity: "high" | "medium";
  begin: number;
  end: number;
}

export interface FailedPayment {
  id: string;
  orderId: string;
  week: number;
  customer: {
    name: string; // first name, used in messages
    label: string; // first name and an initial, unique within the week, used in lists
    phone: string;
    returning: boolean;
    whatsapp: boolean;
    sms: boolean;
    optedOut: boolean;
    hinglish: boolean;
  };
  amount: number;
  items: string;
  method: Method;
  instrument: string;
  instrumentLabel: string;
  failedAt: number;
  attempts: number;
  error: {
    code: string;
    source: string;
    step: string;
    reason: string;
    description: string;
  };
  downtimeId: string | null;
  pendingAtBank: boolean; // late authorisation signal visible at triage time
  pendingSurfacesLate: boolean; // signal arrives only after the first message
  paidSince: "no" | "another_attempt" | "cod";
  riskFlag: boolean;
  // hidden generator truth, used only by the outcome simulation
  truth: { cause: Cause; u: number; h: number; delayHrs: number; u2: number };
}

export interface Week {
  index: number;
  start: number; // Monday 00:00 IST, epoch ms
  label: string;
  paidOrders: number;
  paidValue: number;
  downtimes: Downtime[];
  payments: FailedPayment[];
}

// ---------- time helpers (all display is in IST, whatever the viewer's timezone) ----------

const IST_OFFSET = 5.5 * 3600 * 1000;
export const HOUR = 3600 * 1000;
export const MIN = 60 * 1000;
export const DAY = 24 * HOUR;

export function ist(y: number, m: number, d: number, h = 0, min = 0): number {
  return Date.UTC(y, m - 1, d, h, min) - IST_OFFSET;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtClock(ms: number): string {
  const d = new Date(ms + IST_OFFSET);
  let h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m < 10 ? "0" : ""}${m} ${ap}`;
}

export function fmtDay(ms: number): string {
  const d = new Date(ms + IST_OFFSET);
  return DAYS[d.getUTCDay()]!;
}

export function fmtDate(ms: number): string {
  const d = new Date(ms + IST_OFFSET);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function fmtDayClock(ms: number): string {
  return `${fmtDay(ms)} ${fmtClock(ms)}`;
}

export function istHour(ms: number): number {
  const d = new Date(ms + IST_OFFSET);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
}

export function startOfIstDay(ms: number): number {
  const shifted = ms + IST_OFFSET;
  return shifted - (shifted % DAY) - IST_OFFSET;
}

// ---------- money ----------

export function inr(n: number): string {
  const v = Math.round(n);
  const s = Math.abs(v).toString();
  let out: string;
  if (s.length <= 3) out = s;
  else {
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    out = `${rest},${last3}`;
  }
  return `${v < 0 ? "−" : ""}₹${out}`;
}

export function inrShort(n: number): string {
  const v = Math.abs(n);
  if (v >= 100000) return `${n < 0 ? "−" : ""}₹${(v / 100000).toFixed(v >= 1000000 ? 1 : 2)} lakh`;
  return inr(n);
}

// ---------- seeded randomness ----------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(r: () => number, arr: readonly T[]): T {
  return arr[Math.floor(r() * arr.length)]!;
}

function weighted<T>(r: () => number, items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [v, w] of items) {
    x -= w;
    if (x <= 0) return v;
  }
  return items[items.length - 1]![0];
}

// ---------- reference lists ----------

const NAMES = [
  "Aarav",
  "Riya",
  "Kabir",
  "Meera",
  "Arjun",
  "Ananya",
  "Vikram",
  "Sneha",
  "Rohan",
  "Priya",
  "Ishaan",
  "Kavya",
  "Aditya",
  "Neha",
  "Karan",
  "Pooja",
  "Siddharth",
  "Divya",
  "Rahul",
  "Shreya",
  "Nikhil",
  "Tanvi",
  "Varun",
  "Aisha",
  "Manish",
  "Simran",
  "Harsh",
  "Nandini",
  "Yash",
  "Lakshmi",
  "Imran",
  "Fatima",
  "Joseph",
  "Gurpreet",
  "Deepa",
  "Farhan",
  "Swati",
  "Tarun",
  "Jasleen",
  "Mohit",
  "Zoya",
  "Abhishek",
  "Ritika",
  "Sameer",
  "Payal",
  "Naveen",
  "Aparna",
  "Kunal",
  "Bhavna",
  "Suresh",
];

const PRODUCTS: readonly (readonly [string, number])[] = [
  ["Neem face wash", 349],
  ["Rose water toner", 449],
  ["Vitamin C serum", 749],
  ["Kumkumadi night oil", 1299],
  ["SPF 50 sunscreen", 599],
  ["Clay mask", 549],
  ["Under-eye cream", 899],
  ["Hair growth oil", 699],
  ["Daily moisturiser", 499],
  ["Festive gift box", 2499],
];

const UPI_HANDLES: readonly (readonly [string, string, number])[] = [
  ["oksbi", "UPI @oksbi", 22],
  ["okhdfcbank", "UPI @okhdfcbank", 18],
  ["ybl", "UPI @ybl", 20],
  ["okaxis", "UPI @okaxis", 12],
  ["paytm", "UPI @paytm", 14],
  ["okicici", "UPI @okicici", 14],
];

const CARDS: readonly (readonly [string, string, number])[] = [
  ["HDFC credit", "HDFC Bank credit card", 26],
  ["ICIC debit", "ICICI Bank debit card", 22],
  ["SBIN debit", "SBI debit card", 24],
  ["UTIB credit", "Axis Bank credit card", 14],
  ["KKBK debit", "Kotak debit card", 14],
];

const BANKS: readonly (readonly [string, string, number])[] = [
  ["HDFC", "HDFC Bank netbanking", 30],
  ["SBIN", "SBI netbanking", 30],
  ["ICIC", "ICICI Bank netbanking", 20],
  ["UTIB", "Axis Bank netbanking", 10],
  ["KKBK", "Kotak netbanking", 10],
];

function instrumentsFor(method: Method) {
  return method === "upi" ? UPI_HANDLES : method === "card" ? CARDS : BANKS;
}

// Downtime template: [method, instrument, label, severity, dayOffset, startHour, durationMinutes]
const DOWNTIME_TEMPLATES: readonly (readonly [
  Method,
  string,
  string,
  "high" | "medium",
  number,
  number,
  number,
])[] = [
  ["netbanking", "HDFC", "HDFC Bank netbanking", "high", 1, 19.7, 88],
  ["upi", "oksbi", "UPI handle @oksbi", "medium", 5, 20.08, 85],
  ["card", "ICIC debit", "ICICI Bank debit cards", "medium", 3, 13.17, 45],
  ["upi", "ybl", "UPI handle @ybl", "medium", 6, 19.25, 70],
  ["netbanking", "SBIN", "SBI netbanking", "high", 4, 21.0, 95],
  ["upi", "okhdfcbank", "UPI handle @okhdfcbank", "medium", 2, 12.5, 50],
];

// Cause mix of failed payments that are still unpaid after a ten-minute grace period.
// Modelled on Razorpay's published split of failure causes (roughly 40% bank side,
// 30% customer drop-off, 20% gateway side, 10% risk rules). The finer split is an assumption.
const CAUSE_MIX: readonly (readonly [Cause, number])[] = [
  ["customer_auth", 34],
  ["gateway_tech", 15],
  ["bank_down", 16],
  ["funds_limit", 15],
  ["unclear", 9],
  ["late_auth", 4],
  ["risk_block", 7],
];

interface ErrorShape {
  code: string;
  source: string;
  step: string;
  reason: string;
  description: string;
}

function errorFor(r: () => number, cause: Cause, method: Method): ErrorShape {
  const upi = method === "upi";
  switch (cause) {
    case "customer_auth":
      if (upi) {
        return weighted(r, [
          [
            {
              code: "BAD_REQUEST_ERROR",
              source: "customer",
              step: "payment_authentication",
              reason: "payment_timed_out",
              description:
                "The payment could not be completed as the customer exceeded the time limit for payment processing.",
            },
            5,
          ],
          [
            {
              code: "BAD_REQUEST_ERROR",
              source: "customer",
              step: "payment_authentication",
              reason: "payment_cancelled",
              description:
                "The payment could not be completed because the customer cancelled the transaction or pressed the back button.",
            },
            4,
          ],
          [
            {
              code: "BAD_REQUEST_ERROR",
              source: "customer",
              step: "payment_authentication",
              reason: "payment_collect_request_expired",
              description:
                "The payment could not be completed as the customer exceeded the time limit for payment processing.",
            },
            2,
          ],
        ]);
      }
      return weighted(r, [
        [
          {
            code: "BAD_REQUEST_ERROR",
            source: "customer",
            step: "payment_authentication",
            reason: "incorrect_otp",
            description: "Payment failed because the OTP entered was incorrect.",
          },
          4,
        ],
        [
          {
            code: "BAD_REQUEST_ERROR",
            source: "customer",
            step: "payment_authentication",
            reason: "payment_cancelled",
            description:
              "Your payment has been cancelled. Try again or complete the payment later.",
          },
          4,
        ],
        [
          {
            code: "BAD_REQUEST_ERROR",
            source: "customer",
            step: "payment_authentication",
            reason: "payment_timed_out",
            description: "Payment was not completed in time.",
          },
          3,
        ],
      ]);
    case "gateway_tech":
      return {
        code: "GATEWAY_ERROR",
        source: "gateway",
        step: "payment_authorization",
        reason: "gateway_technical_error",
        description:
          "The payment could not be completed due to technical issues from the partner bank.",
      };
    case "bank_down":
      if (upi) {
        return weighted(r, [
          [
            {
              code: "GATEWAY_ERROR",
              source: "bank",
              step: "payment_authorization",
              reason: "bank_technical_error",
              description: "The payment failed due to a downtime on the UPI provider.",
            },
            5,
          ],
          // Same reason code as a slow customer. Only the description and the downtime record tell them apart.
          [
            {
              code: "GATEWAY_ERROR",
              source: "bank",
              step: "payment_authorization",
              reason: "payment_timed_out",
              description: "The payment failed due to a downtime at our partner bank.",
            },
            4,
          ],
        ]);
      }
      return {
        code: "GATEWAY_ERROR",
        source: "bank",
        step: "payment_authorization",
        reason: "bank_technical_error",
        description: "Payment failed because the bank's systems were not available.",
      };
    case "funds_limit":
      if (upi) {
        return weighted(r, [
          [
            {
              code: "BAD_REQUEST_ERROR",
              source: "customer",
              step: "payment_authorization",
              reason: "insufficient_funds",
              description:
                "The payment did not go through because the customer's bank account did not have enough funds to complete the transaction.",
            },
            6,
          ],
          [
            {
              code: "BAD_REQUEST_ERROR",
              source: "bank",
              step: "payment_authorization",
              reason: "payment_declined",
              description:
                "The payment did not go through because the funds could not be debited from the customer's bank account.",
            },
            4,
          ],
        ]);
      }
      return weighted(r, [
        [
          {
            code: "BAD_REQUEST_ERROR",
            source: "customer",
            step: "payment_authorization",
            reason: "insufficient_funds",
            description: "Payment failed because of insufficient balance or credit limit.",
          },
          5,
        ],
        [
          {
            code: "BAD_REQUEST_ERROR",
            source: "bank",
            step: "payment_authorization",
            reason: "payment_failed",
            description:
              "Payment was declined by the bank. Try another payment method or contact your bank.",
          },
          5,
        ],
      ]);
    case "unclear":
      if (upi) {
        return {
          code: "BAD_REQUEST_ERROR",
          source: "bank",
          step: "payment_authorization",
          reason: "payment_declined",
          description:
            "The payment did not go through because the funds could not be debited from the customer's bank account.",
        };
      }
      return {
        code: "BAD_REQUEST_ERROR",
        source: "bank",
        step: "payment_authorization",
        reason: "payment_failed",
        description:
          "Payment was declined by the bank. Try another payment method or contact your bank.",
      };
    case "late_auth":
      return upi
        ? {
            code: "GATEWAY_ERROR",
            source: "bank",
            step: "payment_authorization",
            reason: "payment_timed_out",
            description: "The payment failed due to a downtime at our partner bank.",
          }
        : {
            code: "GATEWAY_ERROR",
            source: "gateway",
            step: "payment_authorization",
            reason: "gateway_technical_error",
            description:
              "The payment could not be completed due to technical issues from the partner bank.",
          };
    case "risk_block":
      return {
        code: "BAD_REQUEST_ERROR",
        source: "business",
        step: "payment_initiation",
        reason: "payment_risk_check_failed",
        description: "Payment blocked by risk checks.",
      };
  }
}

function sampleHour(r: () => number): number {
  // Evening-heavy, as Razorpay's own guide describes peak failures between 7 and 10 PM.
  const bucket = weighted(r, [
    [[8, 12] as const, 14],
    [[12, 16] as const, 18],
    [[16, 19] as const, 18],
    [[19, 22.5] as const, 38],
    [[22.5, 24] as const, 9],
    [[0, 2] as const, 3],
  ]);
  return bucket[0] + r() * (bucket[1] - bucket[0]);
}

function sampleCart(r: () => number): { amount: number; items: string } {
  const n = weighted(r, [
    [1, 56],
    [2, 31],
    [3, 10],
    [4, 3],
  ]);
  const chosen: (readonly [string, number])[] = [];
  for (let i = 0; i < n; i++) chosen.push(pick(r, PRODUCTS));
  const amount = chosen.reduce((s, [, p]) => s + p, 0);
  const first = chosen[0]![0];
  return { amount, items: n === 1 ? first : `${first} and ${n - 1} more` };
}

function maskPhone(r: () => number): string {
  const start = pick(r, ["98", "97", "99", "96", "88", "70", "81", "90"]);
  const end = Math.floor(100 + r() * 900);
  return `${start}•••••${end}`;
}

const ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function makeId(r: () => number, prefix: string): string {
  let s = "";
  for (let i = 0; i < 14; i++) s += ID_CHARS[Math.floor(r() * ID_CHARS.length)];
  return `${prefix}_${s}`;
}

export const WEEK0_START = ist(2026, 10, 5); // Monday 5 Oct 2026, the week before the live run

// One fixed seed, chosen so that the simulated sample sits close to the stated assumptions:
// neither a lucky week nor an unlucky one. Changing it changes every number in the prototype.
export const SEED = { value: 118581 };

export function generateWeek(index: number): Week {
  const r = mulberry32(SEED.value + index * 7919);
  const start = WEEK0_START + index * 7 * DAY;

  // Downtimes: four to five windows a week, drawn from the templates.
  // Fisher-Yates with the seeded generator, so every browser produces the same week.
  const order = [0, 1, 2, 3, 4, 5];
  for (let k = order.length - 1; k > 0; k--) {
    const j = Math.floor(r() * (k + 1));
    [order[k], order[j]] = [order[j]!, order[k]!];
  }
  const count = 4 + (r() < 0.5 ? 1 : 0);
  const downtimes: Downtime[] = order.slice(0, count).map((ti, k) => {
    const [method, instrument, label, severity, dayOff, startHr, durMin] = DOWNTIME_TEMPLATES[ti]!;
    const day = index === 0 ? dayOff : (dayOff + index * 2 + k) % 7;
    const begin =
      start + day * DAY + Math.round((startHr + (index === 0 ? 0 : (r() - 0.5) * 1.5)) * 60) * MIN;
    const end = begin + Math.round(durMin * (index === 0 ? 1 : 0.8 + r() * 0.5)) * MIN;
    return { id: `down_${index}_${k}`, method, instrument, label, severity, begin, end };
  });

  // Volume follows Razorpay's own statement for its Failed Payment Recovery product: 20 to 25% of
  // payments fail and half of those customers do not return without a nudge. For a store with about
  // 590 paid orders a week, that is roughly 75 failed payments a week that stay unpaid.
  const total = 68 + Math.floor(r() * 16);
  const payments: FailedPayment[] = [];

  for (let i = 0; i < total; i++) {
    const cause = weighted(r, CAUSE_MIX);
    let method: Method = weighted(r, [
      ["upi", 66],
      ["card", 23],
      ["netbanking", 11],
    ] as const);
    let instrument: string;
    let instrumentLabel: string;
    let failedAt: number;
    let downtimeId: string | null = null;

    if (cause === "bank_down") {
      const dt = pick(r, downtimes);
      method = dt.method;
      instrument = dt.instrument;
      instrumentLabel = instrumentsFor(method).find((x) => x[0] === instrument)?.[1] ?? dt.label;
      failedAt = dt.begin + Math.floor(r() * (dt.end - dt.begin - 4 * MIN)) + 2 * MIN;
      downtimeId = dt.id;
    } else {
      const ins = weighted(
        r,
        instrumentsFor(method).map((x) => [x, x[2]] as const),
      );
      instrument = ins[0];
      instrumentLabel = ins[1];
      const day = weighted(r, [
        [0, 12],
        [1, 12],
        [2, 13],
        [3, 13],
        [4, 15],
        [5, 18],
        [6, 17],
      ]);
      failedAt = start + day * DAY + Math.round(sampleHour(r) * 60) * MIN;
      // A customer slip can also happen to fall inside a downtime on a different instrument: that is not a bank failure.
    }

    // Balance and limit declines happen more on larger carts: take the larger of two draws.
    let cart = sampleCart(r);
    if (cause === "funds_limit") {
      const other = sampleCart(r);
      const third = sampleCart(r);
      for (const c of [other, third]) if (c.amount > cart.amount) cart = c;
    }
    const attempts =
      cause === "funds_limit"
        ? weighted(r, [
            [1, 30],
            [2, 45],
            [3, 25],
          ])
        : cause === "unclear"
          ? weighted(r, [
              [1, 55],
              [2, 35],
              [3, 10],
            ])
          : weighted(r, [
              [1, 78],
              [2, 18],
              [3, 4],
            ]);
    const optedOut = r() < 0.03;
    const whatsapp = !optedOut && r() < 0.9;
    const sms = !optedOut && (whatsapp ? r() < 0.9 : r() < 0.7);
    const paidRoll = r();
    const paidSince: FailedPayment["paidSince"] =
      cause === "late_auth" || cause === "risk_block"
        ? "no"
        : paidRoll < 0.085
          ? "another_attempt"
          : paidRoll < 0.125
            ? "cod"
            : "no";
    const lateSurface = cause === "late_auth" && r() < 0.34;

    payments.push({
      id: makeId(r, "pay"),
      orderId: makeId(r, "order"),
      week: index,
      customer: {
        name: pick(r, NAMES),
        label: "",
        phone: maskPhone(r),
        returning: r() < 0.36,
        whatsapp,
        sms,
        optedOut,
        hinglish: r() < 0.45,
      },
      amount: cart.amount,
      items: cart.items,
      method,
      instrument,
      instrumentLabel,
      failedAt,
      attempts,
      error: errorFor(r, cause, method),
      downtimeId,
      pendingAtBank: cause === "late_auth" && !lateSurface,
      pendingSurfacesLate: lateSurface,
      paidSince,
      riskFlag: cause === "risk_block",
      truth: { cause, u: r(), h: r(), delayHrs: 0.1 + r() * r() * 30, u2: r() },
    });
  }

  payments.sort((a, b) => a.failedAt - b.failedAt);

  // Unique display labels, derived from the payment id so the random stream is untouched.
  const INITIALS = "KSRMPGNDBVTJACHL";
  const used = new Set<string>();
  for (const p of payments) {
    let k = (p.id.charCodeAt(5) + p.id.charCodeAt(9)) % INITIALS.length;
    let label = `${p.customer.name} ${INITIALS[k]}.`;
    while (used.has(label)) {
      k = (k + 1) % INITIALS.length;
      label = `${p.customer.name} ${INITIALS[k]}.`;
    }
    used.add(label);
    p.customer.label = label;
  }

  // Paid orders for context: about Rs 30 lakh a month at a Rs 1,200 average order.
  const paidOrders = 560 + Math.floor(r() * 50);
  const paidValue = paidOrders * (1180 + Math.floor(r() * 60));

  return {
    index,
    start,
    label: `${fmtDate(start)} to ${fmtDate(start + 6 * DAY)}`,
    paidOrders,
    paidValue,
    downtimes: downtimes.sort((a, b) => a.begin - b.begin),
    payments,
  };
}

export const MERCHANT = {
  name: "Mitti & Moss",
  what: "skincare brand, sells on its own Shopify store",
  monthly: "about ₹30 lakh a month",
  owner: "Asha",
  couponCap: 10, // the ceiling already configured in the merchant's coupon settings
};
