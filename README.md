# Second Attempt

Cause-aware failed-payment recovery for D2C merchants: four lanes instead of one link.

A concept prototype by Sukhpal Singh Mann for the Razorpay x ISB AI PM Build Challenge, Track 2 (Recover and Grow with AI). It is not a Razorpay product.

- **AI build log:** [AI_BUILD_LOG.md](AI_BUILD_LOG.md)
- **Prototype code:** [`src/second-attempt/`](src/second-attempt/)

## The idea

When a customer presses Pay and the payment fails, the usual recovery is one rule: send everyone the same payment link. That link is wrong for many of them. The bank may still be down, the money may already have left the account, or the order may already be paid.

Second Attempt reads why each payment failed and sorts it into a lane.

| Lane             | When                                                                               | What happens                                                                     |
| ---------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Retry now        | The cause has passed: a wrong OTP, a timeout, a cancel, or a brief technical fault | One message with a payment link, ten minutes after the failure. No discount      |
| Wait, then retry | The customer's bank or UPI handle was down                                         | The message is held until the downtime ends. No discount                         |
| Do not ask again | Money may already have moved, or the customer has since paid another way           | No payment link. A status message if the amount is pending at the bank           |
| Needs a reason   | The same attempt would fail again: low balance, a limit, or repeated declines      | Another way to pay first. An offer only as a last resort, and only with approval |
| Left alone       | No consent on record, opted out, or blocked by a risk check                        | Nothing is sent. This lane cannot be switched off                                |

The merchant reviews every lane and message, sets a holdout and a discount cap, and approves once. The three no-discount lanes then run on their own. Any offer waits for approval, and one button stops all sending.

## The four screens

1. **Last week.** 68 failed payments sorted into lanes, what one link for everyone gets wrong, and the signals the sorting reads. Click any square to read that payment's record.
2. **The plan.** Each lane's rule and message, in English or Hinglish, with the merchant's guardrails: holdout, discount cap, minimum cart for offers and quiet hours.
3. **This week, live.** A simulated week with a bank downtime, a customer who replies that her money was already cut, an offer waiting for approval, a stop button and an audit trail.
4. **What it achieved.** Customers who got a message against a holdout who did not, with ranges, after 1, 4 and 12 weeks. The product does not claim credit until the holdout supports it.

## What is real and what is not

- **All data is synthetic.** The merchant, customers, payments and bank downtimes are invented. Field names follow Razorpay's public payment entity and Payment Downtime API, and the UPI reason codes come from Razorpay's public error documentation.
- **Outcomes are simulated** from assumed rates. Every assumption is listed in the prototype under "Assumptions and what is simulated".
- **The sorting is deterministic code,** not a live model. In production a language model would read the long tail of bank error text and customer replies. Here those cases are explicit checks, so the prototype behaves the same way every time.
- **Nothing is sent.** There is no WhatsApp, SMS or payment link behind it, and no login.

## Code map

| Path                                      | What it holds                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/second-attempt/data.ts`              | Seeded generator for the synthetic merchant, payments and downtimes                         |
| `src/second-attempt/engine.ts`            | Lane sorting, guardrails, the simulated week, results with intervals, and message templates |
| `src/second-attempt/screens/`             | The four screens                                                                            |
| `src/second-attempt/ui.tsx`, `styles.css` | Shared components and plain CSS scoped under `.sa`                                          |
| `src/routes/index.tsx`                    | Mounts the prototype at `/`                                                                 |
| `public/fonts/`                           | Self-hosted Anek Latin and Mukta                                                            |

## Run it locally

```sh
npm install
npm run dev
```

`npm run build` makes the production build and `npm test` runs the routing test.

## How it was built

Research, code and drafts were produced with Claude and directed by me. Lovable created the project scaffold and hosts the app, and pushes to `main` sync to the Lovable editor. The build log has the details, including what I overruled and what is unverified.
