# Second Attempt

Cause-aware failed-payment recovery for D2C merchants: four lanes instead of one link.

A concept prototype by Sukhpal Singh Mann for the Razorpay x ISB AI PM Build Challenge, Track 2 (Recover and Grow with AI). It is not a Razorpay product.

- **Live prototype:** https://second-attempt-recovery.lovable.app/
- **AI build log:** [AI_BUILD_LOG.md](AI_BUILD_LOG.md)
- **Prototype code:** [`src/second-attempt/`](src/second-attempt/)

## The idea

Razorpay already helps a customer retry inside checkout. Once the customer has left, the simplest recovery rule sends everyone the same payment link. How Razorpay's own recovery product decides is not public. For many customers that link is the wrong next step. The bank may still be down, the money may already have left the account, or the order may already be paid.

Second Attempt reads why each payment failed and sorts it into a lane.

| Lane             | When                                                                               | What happens                                                                     |
| ---------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Retry now        | The cause has passed: a wrong OTP, a timeout, a cancel, or a brief technical fault | One message with a payment link, ten minutes after the failure. No discount      |
| Wait, then retry | The customer's bank or UPI handle was down                                         | The message is held until the downtime ends. No discount                         |
| Do not ask again | Money may already have moved, or the customer has since paid another way           | No payment link. A status message if the amount is pending                       |
| Needs a reason   | The same attempt would fail again: low balance, a limit, or repeated declines      | Another way to pay first. An offer only as a last resort, and only with approval |
| Left alone       | No consent on record, opted out, or blocked by a risk check                        | Nothing is sent. This lane cannot be switched off                                |

The merchant reviews every lane and message, sets a holdout and a discount cap, and approves once. The three no-discount lanes then run on their own. Any offer waits for approval, and one button stops all sending.

## What exists already, and what is different here

| Product                            | What its public material says                                                                                                                                   | What Second Attempt adds                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Razorpay Intelligent Payment Retry | Suggests a next step from the error and from instrument downtimes, while the customer is still in checkout                                                      | The same idea for the time after the customer has left                                   |
| Razorpay Failed Payment Recovery   | Sends payment links to customers whose payment failed. The posts do not say how it decides                                                                      | A decision per payment: now, later, not at all, or another way to pay                    |
| Razorpay Agent Studio              | Lists a Payment Retry agent for insurance and SIP failure recovery for investments. For e-commerce it lists cart recovery, COD confirmation, feedback, disputes | The e-commerce member of that family                                                     |
| Cashfree Resolve                   | An AI voice call within 60 seconds of a failed payment, which opens with the likely failure reason                                                              | Messages, not calls. Deciding when not to contact a customer. A holdout that measures it |

Links to each source are in the build log.

## The four screens

1. **Last week.** 68 failed payments, one square each. The page opens on the simplest rule, one link for all, with the 30 misdirected links in red. The squares then sort into the lanes. Click any square to read that payment's record.
2. **The plan.** Each lane's rule and message, in English or Hinglish, with the merchant's guardrails: holdout, discount cap, minimum cart for offers and quiet hours.
3. **This week, live.** A simulated week with a bank downtime, a customer who replies that her money was already cut, an offer waiting for approval, a stop button and an audit trail.
4. **What it achieved.** Customers who got a message against a holdout who did not, after 1, 4 and 12 weeks. The length of the test is fixed in advance and the result is read once, at the end. A card compares the four lanes with one link for everyone under the same assumed rates.

Two panels open from the foot of every screen. **Assumptions and what is simulated** lists every assumed rate and limit. **The reply test** shows 30 customer replies with a keyword rule's answer and a model's answer to each.

## What is real and what is not

- **All data is synthetic.** The merchant, customers, payments and bank downtimes are invented. Field names follow Razorpay's public payment entity and Payment Downtime API, and the UPI reason codes come from Razorpay's public error documentation.
- **Outcomes are simulated** from assumed rates. Every assumption is listed in the prototype under "Assumptions and what is simulated".
- **The sorting is rules, not a model.** No model is called anywhere. The role proposed for a language model is narrow: reading unfamiliar bank error text and customers' free-text replies, and handing structured facts to the rules. Verified payment status and rules would decide every action. The reply exchange on the live screen is scripted.
- **One part of the model's role has been tested.** I wrote 30 customer replies by hand, 15 of which say that money left the account. A keyword rule, fixed before the replies existed, missed 5 of those 15 and raised 8 false alarms. A model missed none. The set is small and was built to include hard cases, and the model's answers came from Claude in the build session, not from a call made by the prototype. The protocol and files are in [`checks/replies/`](src/second-attempt/checks/replies/).
- **Nothing is sent.** There is no WhatsApp, SMS or payment link behind it, and no login.

## What the result shows, and what it does not

- **Against no message.** The merchant's screen measures money collected per customer, with every customer kept in the group they were assigned to. The test ends when 60 customers have been held out, which is week 12 at a 10% holdout for this store, and is read once. The read: about ₹1.21 lakh more than no message, in a range of ₹6,212 to ₹2,35,697. The range is wide because only 63 customers were held out.
- **Why it is not read earlier.** On the default plan the range is above zero in week 8 and back across it in week 10.
- **Against one link for everyone.** Under the same assumed rates, one link recovers ₹2,36,888 over 12 weeks and the four lanes, with no offers, ₹2,51,521. The lanes add ₹14,633.
- **Where that edge comes from.** ₹13,836 of it comes from waiting out bank downtimes. The synthetic data puts 16% of failed payments inside a downtime. NPCI's chief put UPI technical declines at 0.7 to 0.8% of all transactions in 2024, so on an ordinary day the share is probably lower. At 5% of failures the edge is about ₹5,000.
- **Badly timed links.** One link would go out 52 times while the customer's bank was still down and 30 times to a customer whose money was pending: 82 in all. The lanes send 13, each to a pending debit that could not be seen, and each switched off after the customer's reply.
- **What cannot be measured in one store.** The two rules differ by about two points in payment rate: 164 against 177 payments from the same 586 customers. Telling them apart needs about 6,600 customers in each group, and this store has about 600 in a quarter. That test has to be pooled across merchants.

The comparison is in [`checks/one-link.ts`](src/second-attempt/checks/one-link.ts) and on the last screen.

## Where each signal would come from

| Signal                                       | Source                                                                                                  | Status                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Why the payment failed                       | The failed payment's `error_code`, `error_source`, `error_step`, `error_reason` and `error_description` | Fields read in Razorpay's docs                                      |
| Bank or UPI handle downtime                  | Payment Downtime API and its `payment.downtime.started`, `updated` and `resolved` webhooks              | Read in the docs                                                    |
| The order was paid since                     | `order.paid` webhook: "Once a payment is captured, the order is marked paid."                           | Read in the docs                                                    |
| Money debited, payment not confirmed         | A later `payment.authorized` on the failed payment (late authorisation), or the customer's reply        | Docs read. Whether a pending state is visible earlier: not verified |
| The same order re-placed as cash on delivery | The store's order feed, matched on customer and cart                                                    | Assumed                                                             |
| Consent and opt-out                          | The merchant's WhatsApp opt-in records                                                                  | Assumed                                                             |
| Switching a link off                         | Payment Links cancel API                                                                                | Not verified: the docs page could not be opened on the build day    |
| Who sends the message                        | The merchant's WhatsApp Business number, through a provider                                             | Open question                                                       |

## Code map

| Path                                      | What it holds                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| `src/second-attempt/data.ts`              | Seeded generator for the synthetic merchant, payments and downtimes                      |
| `src/second-attempt/engine.ts`            | Lane sorting, guardrails, the simulated week, results with ranges, and message templates |
| `src/second-attempt/screens/`             | The four screens                                                                         |
| `src/second-attempt/ui.tsx`, `styles.css` | Shared components and plain CSS scoped under `.sa`                                       |
| `src/second-attempt/checks/`              | The comparison with one link, and tests that pin every quoted number to the code         |
| `src/second-attempt/checks/replies/`      | A small blind test of the one job proposed for a model: reading customers' replies       |
| `src/routes/index.tsx`                    | Mounts the prototype at `/`                                                              |
| `public/fonts/`                           | Self-hosted Anek Latin and Mukta                                                         |

## Run it locally

```sh
npm install
npm run dev
```

`npm run build` makes the production build. `npm test` runs the routing test and the checks that pin the quoted numbers.

## How it was built

Research, code and drafts were produced with Claude and directed by me. Lovable created the project scaffold and hosts the app, and pushes to `main` sync to the Lovable editor. A second model, GPT-6.1 Sol, reviewed the finished pack. The build log has the details, including what I overruled and what is unverified.
