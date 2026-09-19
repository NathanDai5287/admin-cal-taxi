const PUBLIC_PATHS = new Map([
  ["/", "/public-site"],
  ["/events", "/public-site/events"],
  ["/host", "/public-site/host"],
  ["/rush", "/public-site/rush"],
]);

export function publicSitePath(pathname: string) {
  return PUBLIC_PATHS.get(pathname);
}
