export const MEMBERSHIP_OPTIONS = [
  { value: "brother", label: "Brother" },
  { value: "associate_member", label: "Associate member" },
] as const;

export const EXECUTIVE_ROLE_OPTIONS = [
  { value: "president", label: "President" },
  { value: "vice_president", label: "Vice president" },
  { value: "treasurer", label: "Treasurer" },
  { value: "house_manager", label: "House manager" },
  { value: "social_chair", label: "Social chair" },
  { value: "education_chair", label: "Education chair" },
  { value: "secretary", label: "Secretary" },
  { value: "rush_chair", label: "Rush chair" },
] as const;

export type Membership = (typeof MEMBERSHIP_OPTIONS)[number]["value"];
export type ExecutiveRole = (typeof EXECUTIVE_ROLE_OPTIONS)[number]["value"];
export type PersonContact = {
  id: string;
  full_name: string;
  email: string;
  contact_email: string;
  phone: string;
  membership: Membership | null;
  executive_roles: ExecutiveRole[];
};

export function personContactEmail(person: Pick<PersonContact, "email" | "contact_email">): string {
  return person.contact_email || person.email;
}
