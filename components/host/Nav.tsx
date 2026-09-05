import { AppNav } from "@/components/brand/app-nav";

const tabs = [
  { href: "/host/pricing",   label: "Pricing"   },
  { href: "/host/contract",  label: "Contract"  },
  { href: "/host/documents", label: "Documents" },
  { href: "/host/orders",    label: "Orders"    },
];

export default function Nav() {
  return (
    <AppNav
      homeHref="/host"
      title="Theta Xi"
      subtitle="Rental Tools"
      tabs={tabs}
    />
  );
}
