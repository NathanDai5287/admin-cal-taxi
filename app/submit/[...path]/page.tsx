import { redirect } from "next/navigation";

// Unknown member-site paths (e.g. an old bookmark) return to the submit form.
export default function CatchAllPage() {
  redirect("/");
}
