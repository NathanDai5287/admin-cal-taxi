import type { ComponentProps } from "react";
export default function Image({ unoptimized: _unoptimized, ...props }: ComponentProps<"img"> & { unoptimized?: boolean }) { return <img {...props} />; }
