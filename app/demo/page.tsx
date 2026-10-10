import type { Metadata } from "next";
import { DemoWorkspace } from "./workspace";

export const metadata: Metadata = {
  title: "cal.taxi — Interactive demo",
  description: "Explore chapter operations: finances, venue bookings, members, and policy. Fictional data, no account required.",
};

export default function DemoPage() {
  return <DemoWorkspace />;
}
