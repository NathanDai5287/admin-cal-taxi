import { NextResponse } from "next/server";

import { createClient } from "@/lib/reimbursements/supabase/server";

// Only same-origin absolute paths: "//evil.com" is protocol-relative and
// "/\evil.com" is treated as protocol-relative by some browsers.
function safeNext(value: string | null) {
  if (value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) {
    return value;
  }
  return "/";
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
