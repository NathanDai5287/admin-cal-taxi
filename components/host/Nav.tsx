import { AppNav } from "@/components/brand/app-nav";

const tabs = [
  { href: "/host",           label: "Create"    },
  { href: "/host/orders",    label: "Orders"    },
  { href: "/host/inquiries", label: "Inquiries" },
  { href: "/email-activity", label: "Email activity" },
];

export default function Nav() {
  return (
    <AppNav
      homeHref="/host"
      title="Theta Xi"
      subtitle="Rental Tools"
      prefetchTabContent
      tabs={tabs}
    />
  );
}
