import { revalidatePath } from "next/cache";
import { z } from "zod";

import { setExpenseCategoryCompleted } from "@/app/(admin)/finance/planning/actions";
import { categorySchema } from "@/lib/reimbursements/format";

export async function POST(request: Request) {
  const parsed = z.object({ category: categorySchema, completed: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ status: "error", message: "Choose a valid category." }, { status: 400 });
  const result = await setExpenseCategoryCompleted(parsed.data.category, parsed.data.completed);
  if (result.status === "success") revalidatePath("/finance/planning");
  return Response.json(result, { status: result.status === "success" ? 200 : 400 });
}
