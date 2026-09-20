import Image, { type StaticImageData } from "next/image";

export type LogoItem = {
  name: string;
  src: StaticImageData;
  /** The logo already contains the name, so no caption is shown. */
  wordmark?: boolean;
};

export function LogoGrid({ items, variant }: { items: LogoItem[]; variant: "careers" | "clubs" }) {
  return (
    <ul className={`logo-grid logo-grid-${variant}`}>
      {items.map((item) => (
        <li key={item.name}>
          <Image alt={item.wordmark ? item.name : ""} src={item.src} />
          {item.wordmark ? null : <span>{item.name}</span>}
        </li>
      ))}
    </ul>
  );
}
