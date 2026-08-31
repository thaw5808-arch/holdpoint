import { NextResponse } from "next/server";
import { startGoogleOAuth } from "@/lib/google-auth";

/** Entry point for the "Continue with Google" button on /login and
 * /register. Sets the CSRF state cookie and bounces to Google. */
export async function GET() {
  const authorizeUrl = await startGoogleOAuth();
  return NextResponse.redirect(authorizeUrl);
}
