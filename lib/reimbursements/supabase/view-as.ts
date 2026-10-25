import "server-only";

import { cookies } from "next/headers";

import { VIEW_AS_COOKIE } from "@/lib/app-access";

const READ_METHODS = ["GET", "HEAD"];
const DATABASE_ENFORCED_PATHS = ["/rest/v1/", "/auth/v1/", "/storage/v1/object/sign/"];

export async function viewAsRole() {
  return (await cookies()).get(VIEW_AS_COOKIE)?.value;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  return (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
}

function requestPath(input: RequestInfo | URL) {
  return new URL(input instanceof Request ? input.url : input).pathname;
}

function readOnlyFetch(allowedPaths: string[]): typeof fetch {
  return async (input, init) => {
    const allowed = READ_METHODS.includes(requestMethod(input, init))
      || allowedPaths.some((path) => requestPath(input).startsWith(path));
    if (!allowed && await viewAsRole()) throw new Error("View as is on. Exit View as to make changes.");
    return fetch(input, init);
  };
}

export const sessionFetch = readOnlyFetch(DATABASE_ENFORCED_PATHS);
export const masterKeyFetch = readOnlyFetch(["/storage/v1/object/sign/"]);
