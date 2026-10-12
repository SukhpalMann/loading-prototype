import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Prototype loading" },
      { name: "description", content: "Prototype loading" },
      { property: "og:title", content: "Prototype loading" },
      { property: "og:description", content: "Prototype loading" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <h1 className="text-4xl font-bold tracking-tight text-foreground">
        Prototype loading
      </h1>
    </div>
  );
}
