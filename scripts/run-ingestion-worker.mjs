const url = process.env.INGESTION_WORKER_URL ?? "http://localhost:3000/api/accreditation/ingestion";
if (!process.env.DOCUMENT_INGESTION_SECRET) throw new Error("Set DOCUMENT_INGESTION_SECRET in .env.local before running the worker.");
do {
  try {
    const response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${process.env.DOCUMENT_INGESTION_SECRET}` }, signal: AbortSignal.timeout(230_000) });
    console.log(new Date().toISOString(), "ingestion worker", response.status, await response.text());
    if (!response.ok && process.argv.includes("--once")) process.exitCode = 1;
  } catch (error) { console.error("Worker unavailable:", error.message); if (process.argv.includes("--once")) process.exitCode = 1; }
  if (process.argv.includes("--once")) break;
  await new Promise(resolve => setTimeout(resolve, 60_000));
} while (true);
