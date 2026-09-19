export const MAX_BATCH_DOCUMENTS = 20;
export const MAX_PROCESSING_ATTEMPTS = 12;

export type BatchCreateResult = {
  ok: boolean;
  id?: string;
  message: string;
};

export type BatchProcessResult = {
  ok: boolean;
  retryable: boolean;
  message: string;
};

// Google recommends exponential backoff with jitter. Document processing is
// deliberately conservative: retry after 10-12 seconds, then cap at 20 seconds.
export function processingRetryDelayMs(failedAttempt: number, random = Math.random()) {
  const exponential = 10_000 * (2 ** Math.max(0, failedAttempt));
  const jitter = Math.floor(Math.min(Math.max(random, 0), 0.999999) * 2_001);
  return Math.min(exponential + jitter, 20_000);
}
