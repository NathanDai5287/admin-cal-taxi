// Browser-only helper: computes the admin and submit site origins for the
// current environment. Must only be called from client components.
export function siteOrigins() {
  const { protocol, hostname, port } = window.location;
  if (hostname.endsWith("localhost")) {
    const suffix = port ? `:${port}` : "";
    return {
      adminOrigin: `${protocol}//localhost${suffix}`,
      submitOrigin: `${protocol}//reimbursements.localhost${suffix}`,
    };
  }
  return {
    adminOrigin: "https://admin.cal.taxi",
    submitOrigin: "https://reimbursements.cal.taxi",
  };
}
