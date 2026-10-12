import { createFileRoute } from "@tanstack/react-router";

import SecondAttempt from "../second-attempt/SecondAttempt";
// The prototype's stylesheet is linked from the document head, the same way the
// app stylesheet is in __root.tsx, so the server-rendered page arrives styled.
import secondAttemptCss from "../second-attempt/styles.css?url";

const TITLE = "Second Attempt: cause-aware failed-payment recovery";
const DESCRIPTION =
  "Concept prototype. Sorts failed payments into four lanes by cause, so each customer gets the right second attempt instead of the same payment link. Synthetic data. Not a Razorpay product.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: secondAttemptCss },
      {
        rel: "preload",
        href: "/fonts/anek-latin.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      {
        rel: "preload",
        href: "/fonts/mukta-400.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      {
        rel: "preload",
        href: "/fonts/mukta-600.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return <SecondAttempt />;
}
