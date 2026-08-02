"use client";

import { useSharedData } from "@/lib/host-shared-state";
import { SAVED_CONTACTS } from "@/lib/host-contacts";

/**
 * Officer contact info. Renders on invoices (replacing the generic
 * "Theta Xi treasurer" mentions) and on the credit memo's "Issued By"
 * block. President fields are reserved for future use on the contract;
 * filling them now means they're already saved when that lands.
 */
export default function ContactsForm() {
  const { hydrated, data, update } = useSharedData();

  function autofill(nameKey: "treasurerName" | "presidentName", contactKey: "treasurerContact" | "presidentContact", e: React.ChangeEvent<HTMLSelectElement>) {
    const contact = SAVED_CONTACTS.find(c => c.name === e.target.value);
    if (!contact) return;
    update(nameKey, contact.name);
    update(contactKey, contact.contact);
    e.target.value = "";
  }

  return (
    <section className="card">
      <div className="card-header">
        <span className="card-title">Contacts</span>
        <span className="card-subtitle">
          Officer info shown on invoices and the credit memo. Optional.
        </span>
      </div>
      <div className="card-body grid gap-x-8 gap-y-5 sm:grid-cols-2">
        {/* Treasurer */}
        <div>
          <div className="text-[10.5px] font-bold tracking-[0.16em] uppercase text-brand mb-3">
            Treasurer
          </div>
          <div className="space-y-3">
            <div>
              <label className="field-label" htmlFor="tres-saved">Autofill from saved contact</label>
              <select
                id="tres-saved"
                className="field-input"
                defaultValue=""
                onChange={e => autofill("treasurerName", "treasurerContact", e)}
              >
                <option value="" disabled>— Select a saved contact —</option>
                {SAVED_CONTACTS.map(c => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="tres-name">Name</label>
              <input
                id="tres-name"
                className="field-input"
                placeholder="e.g. Nathan Dai"
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
                placeholder="e.g. nathan.dai@berkeley.edu"
                value={hydrated ? data.treasurerContact : ""}
                onChange={e => update("treasurerContact", e.target.value)}
                autoComplete="off"
              />
              <p className="field-hint">Email or phone — whatever you want renters to reach you at.</p>
            </div>
          </div>
        </div>

        {/* President */}
        <div>
          <div className="text-[10.5px] font-bold tracking-[0.16em] uppercase text-brand mb-3">
            President
          </div>
          <div className="space-y-3">
            <div>
              <label className="field-label" htmlFor="pres-saved">Autofill from saved contact</label>
              <select
                id="pres-saved"
                className="field-input"
                defaultValue=""
                onChange={e => autofill("presidentName", "presidentContact", e)}
              >
                <option value="" disabled>— Select a saved contact —</option>
                {SAVED_CONTACTS.map(c => (
                  <option key={c.name} value={c.name}>{c.name}</option>
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
