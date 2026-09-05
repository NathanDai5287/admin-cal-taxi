type SignOutButtonProps = {
  // Path of the sign-out route on the current host, e.g. "/auth/signout" on
  // the submit site or "/reimbursements/auth/signout" on the admin site.
  action: string;
};

export function SignOutButton({ action }: SignOutButtonProps) {
  return (
    <form action={action} method="post" className="flex items-center">
      <button
        type="submit"
        className="text-[12px] font-bold uppercase tracking-[0.14em] text-muted hover:text-ink transition-colors"
      >
        Sign out
      </button>
    </form>
  );
}
