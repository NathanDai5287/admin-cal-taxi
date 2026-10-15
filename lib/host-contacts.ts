import type { SharedState } from "./host-state-model";

export type SavedContact = {
  id: string;
  name: string;
  contact: string;
  executiveRoles: string[];
};

export function officerContactDefaults(data: SharedState, contacts: SavedContact[]): Partial<SharedState> {
  if (data.currentOrderId || data.loadedOrderIdentity) return {};
  const treasurer = contacts.find(person => person.executiveRoles.includes("treasurer"));
  const president = contacts.find(person => person.executiveRoles.includes("president"));
  const defaults: Partial<SharedState> = {};
  if (treasurer?.name.trim() && treasurer.contact.trim() && !data.treasurerName && !data.treasurerContact) {
    defaults.treasurerName = treasurer.name;
    defaults.treasurerContact = treasurer.contact;
  }
  if (president?.name.trim() && president.contact.trim() && !data.presidentName && !data.presidentContact) {
    defaults.presidentName = president.name;
    defaults.presidentContact = president.contact;
  }
  return defaults;
}
