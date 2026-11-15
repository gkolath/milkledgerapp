import { createFileRoute } from "@tanstack/react-router";
import { MilkLedger } from "@/components/MilkLedger";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Milk Ledger — track daily milk delivery and pay by UPI" },
      { name: "description", content: "Tap the days your milk arrives, see the month's bill, and pay your milk seller by UPI." },
      { property: "og:title", content: "Milk Ledger" },
      { property: "og:description", content: "Track daily milk delivery, see the monthly bill, and pay by UPI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MilkLedger,
});
