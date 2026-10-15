"use client";

import { useSharedData } from "@/lib/host-shared-state";
import { useEffect } from "react";
import { officerContactDefaults, type SavedContact } from "@/lib/host-contacts";

export default function ContactsForm({ contacts }: { contacts: SavedContact[] }) {
  const { hydrated, data, update, bulk } = useSharedData();
  const completeContacts = contacts.filter(person => person.name.trim() && person.contact.trim());
  const treasurer = completeContacts.find(person => person.executiveRoles.includes("treasurer"));
  const president = completeContacts.find(person => person.executiveRoles.includes("president"));

  useEffect(() => {
    if (!hydrated) return;
    const defaults = officerContactDefaults(data, contacts);
    if (Object.keys(defaults).length) bulk(defaults);
  }, [hydrated, data, bulk, contacts]);

  function autofill(nameKey: "treasurerName" | "presidentName", contactKey: "treasurerContact" | "presidentContact", event: React.ChangeEvent<HTMLSelectElement>) {
    const contact = contacts.find(person => person.id === event.target.value);
    if (!contact) return;
    bulk({ [nameKey]: contact.name, [contactKey]: contact.contact });
    event.target.value = "";
  }

  return (
    <section className="card">
      <div className="card-header">
        <span className="card-title">Contacts</span>
        <span className="card-subtitle">
          Current officers come from Users. Saved order contacts stay unchanged.
        </span>
      </div>
      {(!treasurer || !president) && (
        <p className="px-6 pt-4 text-sm text-muted">
          Assign and complete {(!treasurer && !president) ? "a treasurer and president" : !treasurer ? "a treasurer" : "a president"} in <a href="/users" className="underline">Users</a> to fill their contact details.
        </p>
      )}
      <div className="card-body grid gap-x-8 gap-y-5 sm:grid-cols-2">
        <div>
          <div className="text-[10.5px] font-bold tracking-[0.16em] uppercase text-brand mb-3">
            Treasurer
          </div>
          <div className="space-y-3">
            <div>
              <label className="field-label" htmlFor="tres-saved">Choose a person</label>
              <select
                id="tres-saved"
                className="field-input"
                defaultValue=""
                onChange={e => autofill("treasurerName", "treasurerContact", e)}
              >
                <option value="" disabled>— Select a person —</option>
                {completeContacts.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="tres-name">Name</label>
              <input
                id="tres-name"
                className="field-input"
                placeholder="Full name"
                value={hydrated ? data.treasurerName : ""}
                onChange={e => update("treasurerName", e.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="tres-contact">Contact</label>
              <input
                id="tres-contact"
                className="field-input"
                placeholder="Email or phone"
                value={hydrated ? data.treasurerContact : ""}
                onChange={e => update("treasurerContact", e.target.value)}
                autoComplete="off"
              />
              <p className="field-hint">Email or phone — whatever you want renters to reach you at.</p>
            </div>
          </div>
        </div>

        <div>
          <div className="text-[10.5px] font-bold tracking-[0.16em] uppercase text-brand mb-3">
            President
          </div>
          <div className="space-y-3">
            <div>
              <label className="field-label" htmlFor="pres-saved">Choose a person</label>
              <select
                id="pres-saved"
                className="field-input"
                defaultValue=""
                onChange={e => autofill("presidentName", "presidentContact", e)}
              >
                <option value="" disabled>— Select a person —</option>
                {completeContacts.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="pres-name">Name</label>
              <input
                id="pres-name"
                className="field-input"
                placeholder="Optional"
                value={hydrated ? data.presidentName : ""}
                onChange={e => update("presidentName", e.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="pres-contact">Contact</label>
              <input
                id="pres-contact"
                className="field-input"
                placeholder="Optional"
                value={hydrated ? data.presidentContact : ""}
                onChange={e => update("presidentContact", e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
