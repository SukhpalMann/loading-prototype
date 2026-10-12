// A rules-and-keywords reader for customer replies. This is the baseline a language model
// has to beat. It was written and committed BEFORE the test replies existed: compare this
// file's first commit time with the commit that adds replies.txt.
//
// The question it answers: does this reply say that money has left the customer's account,
// or that the order is already paid? If yes, the payment link must be switched off.
//
// It is meant to be a fair baseline, not a strawman: the list a careful engineer would
// write in half an hour, in English, romanised Hindi and Devanagari, with a guard for
// plain negations. When in doubt it leans towards "money moved", because the costly
// mistake is leaving a link on for a customer who has already been debited.

const GONE = "(?:gaya|gya|gyaa|gaye|gye|gae|gayi|gyi|gai|gay|gyaa)";
const DONE_VERB = `(?:ho\\s*${GONE}|ho\\s*chuk[aei]|hogaya|hogya|hogyi|hogaye|kar\\s*di(?:ya|ye|a)?|kr\\s*di(?:ya|ye|a)?|kardiya|krdiya|kardi|krdi|chuk[aei])`;
const MONEY =
  "(?:paisa|paise|paisay|pese|paese|amount|amt|money|balance|rupees?|rupay|rupaye|rs|inr|₹)";

// Each pattern is one way of saying that money moved or the order is paid.
const PATTERNS: RegExp[] = [
  // English
  /\bpaid\b/,
  /\bpayed\b/,
  /\bdedu?c[a-z]*t[a-z]*\b/, // deducted, deduct, deduction, common misspellings
  /\bdeb+i?t+[a-z]*\b/, // debit, debited, debitted
  /\bcharged\b/,
  /\b(?:money|amount|amt|balance|rs|rupees?)\b.{0,25}\b(?:gone|left|taken|cut|went)\b/,
  /\b(?:cut|taken|gone)\b.{0,25}\b(?:from|frm)\b.{0,15}\b(?:account|acct|a\/c|bank|upi|card)\b/,
  /\balready\b.{0,25}\b(?:pay|payment|paid|done|ordered|purchased|bought)\b/,
  /\b(?:payment|pay|transaction|txn|trxn)\b.{0,20}\b(?:done|success|successful|sucessful|succesful|completed|complete|went through)\b/,
  /\b(?:success|successful|sucessful|succesful)\b/,
  /\brefund\b/,
  /\b(?:sent|transferred|transfered)\b.{0,20}\b(?:money|amount|payment|rs|rupees?)\b/,
  // Romanised Hindi
  new RegExp(`\\b(?:kat|katt|kt|cut|kaat|kut)\\s*${GONE}\\b`),
  new RegExp(
    `\\b(?:kat|katt|cut|kaat)\\s*(?:chuk[aei]|ho\\s*${GONE}|liya|liye|lia|diya|diye|dia)\\b`,
  ),
  /\bkaat\s*(?:l|d)i(?:ya|ye|a)?\b/,
  new RegExp(`\\b${MONEY}\\b.{0,25}\\b(?:chala|chale|chle|chali|nikal|nikl)\\s*${GONE}\\b`),
  new RegExp(`\\b${MONEY}\\b.{0,12}\\b${GONE}\\b`),
  new RegExp(`\\b(?:payment|pement|pymnt|pay|pe|transaction|txn)\\s*${DONE_VERB}\\b`),
  new RegExp(`\\b(?:deduct|debit|charge)\\s*${DONE_VERB}\\b`),
  new RegExp(`\\b(?:bhej|de|send)\\s*di(?:ya|ye|a)?\\b`),
  /\bpehle\s*(?:hi|se)?\b.{0,20}\b(?:pay|payment|de|kar|kr)\b/,
  // Devanagari
  /कट\s*(?:गया|गए|गये|गई|गयी|चुका|चुके|चुकी)/,
  /काट\s*(?:लिया|लिए|लिये|दिया|दिए|दिये)/,
  /डेबिट|डिडक्ट|डिडक्शन/,
  /(?:पैसा|पैसे|रुपये|रुपए|रूपये|अमाउंट|रकम).{0,25}(?:चला गया|चले गए|चले गये|निकल गया|निकल गए|निकल गये|गया|गए|गये)/,
  /(?:पेमेंट|भुगतान|पे|ट्रांजैक्शन)\s*(?:हो गया|हो गई|हो चुका|हो चुकी|कर दिया|कर दी|कर चुका|कर चुकी)/,
  /पहले\s*(?:ही|से)?.{0,20}(?:पे|पेमेंट|भुगतान)/,
  /रिफंड/,
];

// A very short reply that only says "done" or "it happened" is read as "paid", because it
// answers a message about a payment.
const SHORT_DONE = new RegExp(
  `^(?:haan?\\s*)?(?:done|${DONE_VERB}|हो गया|कर दिया)(?:\\s*(?:hai|h|tha|thi|bhai|sir|ji|yaar))*$`,
);

const NEGATIONS = [
  "not",
  "no",
  "never",
  "didnt",
  "didn't",
  "dont",
  "don't",
  "hasnt",
  "hasn't",
  "havent",
  "haven't",
  "wasnt",
  "wasn't",
  "isnt",
  "isn't",
  "without",
  "nahi",
  "nahin",
  "nhi",
  "nai",
  "nahi̇",
  "nahee",
  "mat",
  "नहीं",
  "नही",
  "नहि",
  "मत",
];

function clean(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”"'`]/g, "")
    .replace(/[.,!;:()[\]{}|/\\*_~<>-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// True when a negation word sits in the three words before the matched phrase, or is the word
// right after it. English negates before the verb ("not deducted"). Hindi does both
// ("nahi kata", "kata nahi"). Looking further ahead would wrongly cancel "deducted but order
// not placed".
function negated(words: string[], start: number, end: number): boolean {
  const isNegation = (w: string | undefined) =>
    w !== undefined && NEGATIONS.includes(w.replace(/\?/g, ""));
  for (let i = Math.max(0, start - 3); i < start; i++) if (isNegation(words[i])) return true;
  return isNegation(words[end]);
}

export function ruleSaysMoneyMoved(text: string): boolean {
  const t = clean(text);
  if (t === "") return false;
  if (SHORT_DONE.test(t.replace(/\?/g, "").trim())) return true;
  const words = t.split(" ");
  for (const pattern of PATTERNS) {
    const m = pattern.exec(t);
    if (!m) continue;
    // Word positions of the match, to look for a negation next to it.
    const before = t.slice(0, m.index).split(" ").filter(Boolean).length;
    const span = m[0].split(" ").filter(Boolean).length;
    if (!negated(words, before, before + span)) return true;
  }
  return false;
}
