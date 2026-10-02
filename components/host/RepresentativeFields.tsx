"use client";

import { Button } from "@/components/brand/button";
import { normalizeOrgName } from "@/lib/host-clubs";
import type { ContractSigner, SharedState } from "@/lib/host-state-model";

/** Club membership is explicit; these same fields are used during replacement editing. */
export default function RepresentativeFields({ data, update, club, clubSlot }: {
  data: SharedState;
  update: <K extends keyof SharedState>(key: K, value: SharedState[K]) => void;
  club: string;
  clubSlot?: number;
}) {
  const people = data.contractSigners.filter(person => clubSlot !== undefined && person.clubSlot !== undefined ? person.clubSlot === clubSlot : normalizeOrgName(person.club) === normalizeOrgName(club));
  function change(id: string, patch: Partial<ContractSigner>) {
    update("contractSigners", data.contractSigners.map(person => person.id === id ? { ...person, ...patch } : person));
  }
  return <div className="mt-4 space-y-3">
    <p className="text-[12px] font-semibold text-ink">Representatives who will sign for {club || "this organization"}</p>
    {people.map(person => <div key={person.id} className="grid gap-3 sm:grid-cols-[1fr_1.3fr_auto] items-end">
      <label><span className="field-label">Full name</span><input className="field-input" value={person.fullName} onChange={e => change(person.id, { fullName: e.target.value })} autoComplete="name" /></label>
      <label><span className="field-label">Email</span><input className="field-input" type="email" value={person.email} onChange={e => change(person.id, { email: e.target.value })} autoComplete="email" /></label>
      <Button variant="text" compact aria-label={`Remove ${person.fullName || "representative"} from ${club}`} onClick={() => update("contractSigners", data.contractSigners.filter(p => p.id !== person.id))}>Remove</Button>
    </div>)}
    <Button variant="text" compact disabled={!club.trim()} onClick={() => update("contractSigners", [...data.contractSigners, { id: crypto.randomUUID(), fullName: "", email: "", club: normalizeOrgName(club), ...(clubSlot === undefined ? {} : { clubSlot }) }])}>Add representative</Button>
  </div>;
}
