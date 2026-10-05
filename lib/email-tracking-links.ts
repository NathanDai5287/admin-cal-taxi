import { createHmac, timingSafeEqual } from "node:crypto";

export type TrackingAddress = { origin: string; token: string; secret: string };

function signature(address: TrackingAddress, url: string) {
  return createHmac("sha256", address.secret).update(`${address.token}\n${url}`).digest("base64url");
}

export function trackedLink(address: TrackingAddress, url: string) {
  const query = new URLSearchParams({ url, signature: signature(address, url) });
  return `${address.origin}/api/email-tracking/${address.token}/click?${query}`;
}

export function validTrackedLink(address: TrackingAddress, url: string, suppliedSignature: string) {
  if (!/^https?:\/\//i.test(url)) return false;
  const expected = Buffer.from(signature(address, url));
  const supplied = Buffer.from(suppliedSignature);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

function decodeAttribute(value: string) {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, entity => {
    const named: Record<string, string> = { "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">" };
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
    const hexadecimal = entity.toLowerCase().startsWith("&#x");
    const code = parseInt(entity.slice(hexadecimal ? 3 : 2, -1), hexadecimal ? 16 : 10);
    return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  });
}

export function trackEmailBody(body: { html: string; text: string }, address: TrackingAddress) {
  const html = body.html.replace(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi, (attribute, doubleQuoted, singleQuoted, unquoted) => {
    const url = decodeAttribute(doubleQuoted ?? singleQuoted ?? unquoted);
    if (!/^https?:\/\//i.test(url)) return attribute;
    return `href="${trackedLink(address, url).replaceAll("&", "&amp;")}"`;
  });
  const text = body.text.replace(/https?:\/\/[^\s<>"']+/gi, value => {
    const url = value.replace(/[.,;:!?]+$/, "");
    return trackedLink(address, url) + value.slice(url.length);
  });
  const pixel = `<img src="${address.origin}/api/email-tracking/${address.token}/open" width="1" height="1" alt="" style="display:block;border:0" />`;
  return { ...body, html: html.includes("</body>") ? html.replace("</body>", `${pixel}</body>`) : html + pixel, text };
}
