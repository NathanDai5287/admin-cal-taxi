import type { ComponentProps } from "react";
import { navigate } from "./navigation";
export default function Link({ href, children, prefetch: _prefetch, ...props }: ComponentProps<"a"> & { prefetch?: unknown }) {
  return <a {...props} href={href} onClick={event => {
    props.onClick?.(event);
    if (!event.defaultPrevented && href?.startsWith("/host") && !event.ctrlKey && !event.metaKey && !event.shiftKey) { event.preventDefault(); navigate(href); }
  }}>{children}</a>;
}
