import Image, { type StaticImageData } from "next/image";

export type LogoItem = {
  name: string;
  src: StaticImageData;
};

export function LogoGrid({ items, variant }: { items: LogoItem[]; variant: "careers" | "clubs" }) {
  return (
    <ul className={`logo-grid logo-grid-${variant}`}>
      {items.map((item) => (
        <li key={item.name}>
          <Image alt="" src={item.src} />
          <span>{item.name}</span>
        </li>
      ))}
    </ul>
  );
}
