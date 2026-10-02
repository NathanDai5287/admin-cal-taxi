"use client";

import ContractPanel from "@/app/(admin)/host/documents/ContractPanel";
import type { SharedState } from "@/lib/host-state-model";

export default function ChapterSigningFields({ data, update }: {
  data: SharedState;
  update: <K extends keyof SharedState>(key: K, value: SharedState[K]) => void;
}) {
  return <div className="space-y-4">
    <ContractPanel sign={data.contractPresign} onSignChange={value => update("contractPresign", value)} />
    <p className="field-hint">{data.contractPresign ? "The generated PDF includes Theta Xi’s existing chapter signature. Only the club representatives receive signing links." : "The chapter representative receives a personal signing link alongside the club representatives."}</p>
    {!data.contractPresign && <div className="grid gap-4 sm:grid-cols-2">
      <label><span className="field-label">Chapter representative name</span><input className="field-input" value={data.chapterSignerName} onChange={e => update("chapterSignerName", e.target.value)} /></label>
      <label><span className="field-label">Chapter representative email</span><input className="field-input" type="email" value={data.chapterSignerEmail} onChange={e => update("chapterSignerEmail", e.target.value)} /></label>
    </div>}
  </div>;
}
