import { redirect } from "next/navigation";

// The submit site only has a submit page and a sign-in page. Anything else
// (e.g. an old bookmark) bounces back to the submit form.
export default function CatchAllPage() {
  redirect("/");
}
