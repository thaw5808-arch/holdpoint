import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env, getAppUrl } from "./env";
import { prisma } from "./prisma";

/**
 * "Continue with Google" — a hand-rolled OAuth 2.0 authorization-code flow
 * that ends the same way password login does: a call to createSession()
 * from session.ts. There is no separate Google session type; once this
 * module hands back a User row, it's indistinguishable from a password
 * user for the rest of the app.
 *
 * This redirect URI must exactly match one of the "Authorized redirect
 * URIs" registered on the Google Cloud Console client, both when we send
 * the user to accounts.google.com AND when we exchange the code for a
 * token below — Google rejects the exchange otherwise. It's built from
 * APP_URL (getAppUrl(), defaulting to localhost for dev) rather than the
 * incoming request's Host header on purpose: Host is client-supplied and
 * an OAuth redirect_uri is a security-relevant value, so it should come
 * from server config we control, not request input. It also wouldn't
 * solve anything anyway — Google still requires an exact pre-registered
 * match per environment, and Vercel preview URLs are unpredictable, so
 * there's no way around registering fixed URIs per environment. Set
 * APP_URL to https://holdpoint-eight.vercel.app in Vercel's Production
 * env vars; leave it unset locally.
 */
const GOOGLE_REDIRECT_URI = `${getAppUrl()}/api/auth/google/callback`;

const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

// Module-scoped so the JWKS (and jose's internal caching of it) survives
// across requests instead of being re-fetched on every callback.
const googleJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));

const STATE_COOKIE = "hp_oauth_state";
const STATE_MAX_AGE_SECONDS = 600; // 10 minutes — long enough for the Google consent screen, no longer

/**
 * Starts the flow: mints a random state value, stashes it in a short-lived
 * cookie scoped to just this route pair, and returns the URL to send the
 * browser to. The cookie (not the state value itself) is what makes this a
 * CSRF guard — an attacker can put any state they like in a crafted
 * callback link, but they can't also plant our httpOnly cookie in the
 * victim's browser.
 */
export async function startGoogleOAuth(): Promise<string> {
  const state = randomBytes(24).toString("base64url");

  const jar = await cookies();
  jar.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax", // must survive the top-level cross-site redirect back from accounts.google.com
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth/google",
    maxAge: STATE_MAX_AGE_SECONDS,
  });

  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", GOOGLE_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

/**
 * Consumes (reads + deletes, one-time-use) the state cookie and checks it
 * against what Google echoed back in the callback's `state` query param.
 */
async function consumeOAuthState(candidate: string | null): Promise<boolean> {
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value ?? null;
  jar.delete(STATE_COOKIE);
  return Boolean(expected && candidate && expected === candidate);
}

async function exchangeCodeForIdToken(code: string): Promise<string> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  }

  const data: unknown = await res.json();
  const idToken = (data as { id_token?: unknown }).id_token;
  if (typeof idToken !== "string") throw new Error("Google token response had no id_token");
  return idToken;
}

type GoogleClaims = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
};

/**
 * Verifies the id_token's signature against Google's live JWKS and checks
 * issuer/audience/expiry — this is the difference between trusting Google
 * and trusting whatever bytes came back over the wire. The token-endpoint
 * response body is never treated as identity on its own.
 */
async function verifyGoogleIdToken(idToken: string): Promise<GoogleClaims> {
  const { payload } = await jwtVerify(idToken, googleJwks, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: env.GOOGLE_CLIENT_ID,
  });
  if (typeof payload.sub !== "string") throw new Error("Google id_token had no sub claim");
  return payload as GoogleClaims;
}

// Mirrors slugify/uniqueSlug in actions/team.ts, but constrained to the
// username rule from actions/auth.ts: lowercase letters, digits and
// underscores only, 3-20 characters.
function baseUsername(claims: GoogleClaims): string {
  const source = claims.name || claims.given_name || claims.email?.split("@")[0] || "";
  const cleaned = source
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents, e.g. "Jos\u00e9" -> "Jose"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 16); // leave room for a "_<suffix>"
  if (cleaned.length >= 3) return cleaned;
  return `player_${cleaned}`.replace(/_+$/, "").slice(0, 16) || "player";
}

/** Appends _2, _3, … until it finds a username nothing else is using. */
async function uniqueUsername(base: string): Promise<string> {
  let candidate = base;
  for (
    let suffix = 2;
    await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } });
    suffix++
  ) {
    candidate = `${base}_${suffix}`.slice(0, 20);
  }
  return candidate;
}

function displayNameFromClaims(claims: GoogleClaims): string {
  const raw = (claims.name || claims.given_name || claims.email?.split("@")[0] || "").trim();
  const truncated = raw.slice(0, 32);
  return truncated.length >= 2 ? truncated : "Player";
}

/**
 * The three-case lookup described in the auth plan:
 *   1. googleId already on file        -> returning Google user, just log in
 *   2. no googleId, but email matches  -> existing password account, link it
 *   3. neither matches                 -> brand-new signup
 *
 * Case 2 and 3 both require Google's own `email_verified` claim, so an
 * account can't be taken over (or a duplicate silently created) off an
 * email Google itself won't vouch for.
 */
export async function resolveGoogleUser(claims: GoogleClaims) {
  const byGoogleId = await prisma.user.findUnique({ where: { googleId: claims.sub } });
  if (byGoogleId) return byGoogleId;

  if (!claims.email) throw new Error("Google account has no email");
  if (!claims.email_verified) throw new Error("Google email is not verified");
  const email = claims.email.toLowerCase();

  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail) {
    return prisma.user.update({ where: { id: byEmail.id }, data: { googleId: claims.sub } });
  }

  const username = await uniqueUsername(baseUsername(claims));
  return prisma.user.create({
    data: {
      email,
      username,
      displayName: displayNameFromClaims(claims),
      googleId: claims.sub,
      passwordHash: null,
      profile: { create: { languages: ["en"] } },
    },
  });
}

/** Runs the callback half of the flow: state check, code exchange, id_token
 * verification, and the case-1/2/3 user resolution above. Throws on any
 * failure — the route handler is responsible for turning that into a
 * redirect back to /login. */
export async function completeGoogleOAuth(code: string | null, state: string | null) {
  const stateOk = await consumeOAuthState(state);
  if (!stateOk || !code) throw new Error("Invalid or expired OAuth state");

  const idToken = await exchangeCodeForIdToken(code);
  const claims = await verifyGoogleIdToken(idToken);
  return resolveGoogleUser(claims);
}
