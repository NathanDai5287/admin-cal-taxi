"use client";
import { Button } from "@/components/brand/button";
export default function ConnectError({ reset }: { reset: () => void }) {
  return (
    <div className="grid gap-4">
      <h1 className="page-title">Connect is temporarily unavailable</h1>
      <p>
        Please try again in a moment. Your invitation will remain available.
      </p>
      <div>
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
