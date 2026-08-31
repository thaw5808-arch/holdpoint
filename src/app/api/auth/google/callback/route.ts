import { NextRequest, NextResponse } from "next/server";
import { completeGoogleOAuth } from "@/lib/google-auth";
import { createSession } from "@/lib/session";

/**
 * Google redirects here with ?code&state (or ?error on the consent screen).
 * completeGoogleOAuth() does the state check, code exchange and id_token
 * verification and resolves it to a User row (see the three cases in
 * google-auth.ts); from there it's the exact same createSession() call a
 * password login makes, so the resulting cookie is indistinguishable from
 * one issued by login() in actions/auth.ts.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  if (searchParams.get("error")) {
    return NextResponse.redirect(new URL("/login?error=google", request.url));
  }

  try {
    const user = await completeGoogleOAuth(searchParams.get("code"), searchParams.get("state"));
    await createSession(user.id);
    return NextResponse.redirect(new URL(user.onboardedAt ? "/home" : "/onboarding", request.url));
  } catch (err) {
    console.error("Google OAuth callback failed:", err);
    return NextResponse.redirect(new URL("/login?error=google", request.url));
  }
}
