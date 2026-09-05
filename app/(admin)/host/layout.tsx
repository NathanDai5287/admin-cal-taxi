import type { Metadata } from "next";
import Nav from "@/components/host/Nav";
import { SharedDataProvider } from "@/lib/host-shared-state";

export const metadata: Metadata = {
  title: "Host — cal.taxi admin",
  description: "Generate contracts, price estimates, and invoices for Theta Xi Fraternity rentals.",
};

export default function HostLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div data-brand>
      <SharedDataProvider>
        <Nav />
        <main className="max-w-[1080px] mx-auto px-6 py-8">
          {children}
        </main>
      </SharedDataProvider>
    </div>
  );
}
