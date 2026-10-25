import { EXECUTIVE_ROLE_OPTIONS } from "@/lib/people";

export const APP_OPTIONS = [
  { key: "host", label: "Host", href: "/host" },
  { key: "rush", label: "Rush", href: "/rush" },
  { key: "finance", label: "Finance", href: "/finance" },
  { key: "submit", label: "Reimbursement submissions", href: "/submit" },
  { key: "accreditation", label: "Accreditation", href: "/accreditation" },
  { key: "ask-policy", label: "Ask Policy", href: "/ask-policy" },
  { key: "nu-news", label: "Nu News", href: "/nu-news" },
  { key: "mailing-list", label: "Mailing List", href: "/mailing-list" },
  { key: "users", label: "Members", href: "/users" },
  { key: "connections", label: "Connected AI clients", href: "/connections" },
  { key: "policy", label: "Policy assistant", href: "/policy" },
] as const;

export const ACCESS_LEVELS = ["none", "read", "write"] as const;
export const ROLE_OPTIONS = [
  { key: "admin", label: "Administrator" },
  { key: "member", label: "Base member" },
  { key: "brother", label: "Brother" },
  { key: "associate_member", label: "Associate member" },
  { key: "exec_member", label: "Executive member" },
  ...EXECUTIVE_ROLE_OPTIONS.map(({ value, label }) => ({ key: value, label })),
] as const;

export type AppKey = (typeof APP_OPTIONS)[number]["key"];
export type AccessLevel = (typeof ACCESS_LEVELS)[number];
export type RoleKey = (typeof ROLE_OPTIONS)[number]["key"];
export type RoleAppAccess = { role_key: RoleKey; app_key: AppKey; access_level: AccessLevel };

export const PARENT_ROLE: Partial<Record<RoleKey, RoleKey>> = {
  brother: "member",
  associate_member: "member",
  exec_member: "brother",
  ...Object.fromEntries(EXECUTIVE_ROLE_OPTIONS.map(({ value }) => [value, "exec_member"])),
};

export function roleWithAncestors(role: RoleKey): RoleKey[] {
  const parent = PARENT_ROLE[role];
  return parent ? [role, ...roleWithAncestors(parent)] : [role];
}

export function isRoleKey(value: string | undefined): value is RoleKey {
  return ROLE_OPTIONS.some(({ key }) => key === value);
}

export const VIEW_AS_COOKIE = "view_as_role";
export const VIEW_AS_HEADER = "x-view-as-role";
