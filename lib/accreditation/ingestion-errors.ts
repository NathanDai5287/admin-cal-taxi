export function ingestionFailure(error: unknown, failures: number) {
  const cause = error instanceof Error ? error.cause ?? error : error;
  const raw = typeof cause === "object" && cause !== null
    ? JSON.stringify(cause, Object.getOwnPropertyNames(cause)) : String(cause);
  const message = error instanceof Error ? error.message : "Processing failed";
  const retryable = /429|503|capacity|quota|rate.limit|RESOURCE_EXHAUSTED|UNAVAILABLE|fetch failed|timeout|aborted|high demand/i.test(raw + message);
  const daily = /per.?day|daily|billing|credits|payment/i.test(raw);
  const hint = /retry(?:Delay| after| in)?[\s"':=]*(\d+(?:\.\d+)?)s/i.exec(raw);
  const seconds = retryable ? Math.max(60, Math.min(900, 60 * 2 ** Math.min(failures - 1, 4)) + Math.floor(Math.random() * 10), hint ? Math.ceil(Number(hint[1])) : 0) : 0;
  return { status: retryable && !daily && failures < 8 ? "waiting" : "paused", retryable, seconds, message: message.slice(0, 500) };
}
