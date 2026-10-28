"use client";
import { useState, useTransition } from "react";
import { Button } from "@platform/ui";
import { ResultMessage, type ActionResultLike } from "@platform/ui/client";
import { updateStatus } from "../../server-actions";

export function StatusButtons({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResultLike | null>(null);
  const set = (status: string) => start(async () => setResult((await updateStatus({ id, status })) as ActionResultLike));
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button variant="secondary" disabled={pending} onClick={() => set("in_progress")}>Start</Button>
        <Button disabled={pending} onClick={() => set("closed")}>Close</Button>
      </div>
      {result ? <ResultMessage result={result} /> : null}
    </div>
  );
}
