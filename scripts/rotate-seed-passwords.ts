/**
 * Rotates the shared "password123" seed password (see prisma/seed.ts) on
 * every seeded account in a target database, except demo@holdpoint.gg —
 * that one is the public demo login shown on /login, so it stays on a
 * known password instead (DEMO_PASSWORD below).
 *
 * Each of the other 24 seeded accounts gets its own random password,
 * hashed with bcrypt exactly the way registration does — bcrypt.hash(x, 12),
 * see register() in src/lib/actions/auth.ts. Nobody needs to log in as
 * these accounts, so the plaintext is never written anywhere: it's
 * generated, hashed, and discarded.
 *
 * The seeded accounts are matched by an explicit, hardcoded email list
 * (mirroring PEOPLE in prisma/seed.ts) rather than by domain or any other
 * heuristic, so this can never reach a real account. And a row is only
 * ever rotated if it's still sitting on the known seed hash — re-running
 * this after someone has already secured an account by hand leaves that
 * account alone.
 *
 * The target database is REQUIRED as an explicit CLI argument. This
 * script never reads DATABASE_URL or any .env file, on purpose — the
 * whole point is that running it can't silently land on whatever your
 * local dev database happens to be. The connection string goes straight
 * into Prisma's `datasources` override, bypassing env entirely.
 *
 * Defaults to a dry run: it reports what it would change but writes
 * nothing. Pass --commit to apply.
 *
 *   npx tsx scripts/rotate-seed-passwords.ts "postgresql://…"            # dry run
 *   npx tsx scripts/rotate-seed-passwords.ts "postgresql://…" --commit   # apply
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

// Mirrors PEOPLE in prisma/seed.ts, minus demo. Kept as an explicit list
// rather than "every @holdpoint.gg address" so this can never touch a
// real production account, seeded-looking or not.
const SEEDED_USERNAMES = [
  "kestrelvane", "orbitdecay", "mothlight", "nullsix", "brambleknight",
  "ferrofluid", "saltmarsh", "quietkiln", "harrowgate", "vermilionsky",
  "longwinter", "cobaltmirror", "duskrunner", "paperwasp", "ironhymn",
  "glasshour", "tenderthorn", "halfstep", "marrowlight", "sablecrest",
  "hollowpine", "cinderpath", "ninthward", "fadeaway",
];
const SEEDED_EMAILS = SEEDED_USERNAMES.map((username) => `${username}@holdpoint.gg`);

const DEMO_EMAIL = "demo@holdpoint.gg";
// Public demo login, documented on /login — not a secret, so a plain
// known string is correct here, not a random one.
const DEMO_PASSWORD = "holdpointdemo";

// A row is only rotated if it's still on this — see file header.
const SEED_PASSWORD = "password123";

const BCRYPT_COST = 12; // matches register() in src/lib/actions/auth.ts

function randomPassword(): string {
  // 18 random bytes, base64url-encoded -> 24 chars, ~144 bits. Never
  // stored or logged anywhere, including here — generated and hashed
  // in the same breath.
  return randomBytes(18).toString("base64url");
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");
  const url = args.find((arg) => !arg.startsWith("--"));

  if (!url) {
    console.error(
      "Usage: npx tsx scripts/rotate-seed-passwords.ts <database-url> [--commit]\n\n" +
        "The database URL is required and must be passed explicitly. This script\n" +
        "deliberately never reads DATABASE_URL or .env, so it can't silently land\n" +
        "on your local dev database — pass the connection string you actually mean.",
    );
    process.exit(1);
  }
  if (/localhost|127\.0\.0\.1/.test(url)) {
    console.warn(`Warning: that URL points at localhost — double-check this is the database you meant.\n`);
  }

  // Explicit override, not env("DATABASE_URL") — see file header.
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    const rows = await prisma.user.findMany({
      where: { email: { in: [...SEEDED_EMAILS, DEMO_EMAIL] } },
      select: { id: true, email: true, passwordHash: true },
    });
    const byEmail = new Map(rows.map((row) => [row.email, row]));
    console.log(`Connected. Found ${rows.length} of the 25 seeded accounts in this database.\n`);

    const missing: string[] = [];
    const alreadyChanged: string[] = [];
    const toRotate: { id: string; email: string; hash: string }[] = [];

    for (const email of SEEDED_EMAILS) {
      const row = byEmail.get(email);
      if (!row) {
        missing.push(email);
        continue;
      }
      const stillOnSeedPassword = row.passwordHash != null && (await bcrypt.compare(SEED_PASSWORD, row.passwordHash));
      if (!stillOnSeedPassword) {
        alreadyChanged.push(email);
        continue;
      }
      const hash = await bcrypt.hash(randomPassword(), BCRYPT_COST);
      toRotate.push({ id: row.id, email, hash });
    }

    const demoRow = byEmail.get(DEMO_EMAIL);
    const demoAlreadyCorrect =
      demoRow?.passwordHash != null && (await bcrypt.compare(DEMO_PASSWORD, demoRow.passwordHash));

    console.log(`Would rotate ${toRotate.length} of ${SEEDED_EMAILS.length} non-demo seeded accounts to unique random passwords.`);
    if (alreadyChanged.length) {
      console.log(`Skipping ${alreadyChanged.length} account(s) already off the seed password: ${alreadyChanged.join(", ")}`);
    }
    if (missing.length) {
      console.log(`Not found in this database: ${missing.join(", ")}`);
    }
    if (demoRow) {
      console.log(
        demoAlreadyCorrect
          ? `demo@holdpoint.gg is already on the known demo password — no change needed.`
          : `demo@holdpoint.gg will be set to the known demo password (see DEMO_PASSWORD in this script).`,
      );
    } else {
      console.log(`demo@holdpoint.gg not found in this database — nothing to set.`);
    }

    if (!commit) {
      console.log("\nDry run only — nothing written. Re-run with --commit to apply.");
      return;
    }

    let changed = 0;
    for (const { id, hash } of toRotate) {
      await prisma.user.update({ where: { id }, data: { passwordHash: hash } });
      changed++;
    }
    if (demoRow && !demoAlreadyCorrect) {
      await prisma.user.update({
        where: { id: demoRow.id },
        data: { passwordHash: await bcrypt.hash(DEMO_PASSWORD, BCRYPT_COST) },
      });
    }

    console.log(`\nDone. Changed ${changed} row(s).${demoRow && !demoAlreadyCorrect ? " (plus demo@holdpoint.gg, set to the known demo password)" : ""}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
