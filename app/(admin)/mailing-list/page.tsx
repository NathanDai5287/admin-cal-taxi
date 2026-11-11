import { redirect } from "next/navigation";

export default function RetiredMailingListPage() {
  redirect("/users/alumni?view=alumni");
}
