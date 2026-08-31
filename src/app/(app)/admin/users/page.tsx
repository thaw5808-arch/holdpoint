import { notFound, redirect } from "next/navigation";
import { AdminUsersTable, type AdminUserRow } from "@/components/admin-users-table";
import { avatarSrc } from "@/lib/avatar-url";
import { relativeTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const PAGE_SIZE = 50;

/**
 * Admin console for changing platform roles — gated on User.role === ADMIN,
 * re-checked here even though the sidebar link (see shell/sidebar.tsx)
 * already hides itself from anyone else, same "a page gate is the actual
 * boundary, a hidden nav link isn't" stance as /moderation. Every mutation
 * this page's actions expose (change role / lift suspension, see
 * @/lib/actions/admin) re-checks the same role independently, since this
 * gate alone wouldn't stop a direct call to one of them.
 *
 * Signed out goes to /login like every other page in this app; signed in
 * but not an admin gets a plain 404 rather than an "access denied" — same
 * as /moderation, this page's existence isn't something worth confirming
 * to a non-admin (a moderator included — role management is a step up from
 * the moderation queue, not part of it).
 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") notFound();

  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const [users, adminCount] = await Promise.all([
    prisma.user.findMany({
      where: query
        ? {
            OR: [
              { username: { contains: query, mode: "insensitive" } },
              { displayName: { contains: query, mode: "insensitive" } },
            ],
          }
        : undefined,
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        status: true,
        profile: { select: { avatarUrl: true } },
      },
      orderBy: { username: "asc" },
      take: PAGE_SIZE,
    }),
    prisma.user.count({ where: { role: "ADMIN" } }),
  ]);

  // Most recent AdminAction per listed user, so the row can show who
  // touched it last and when — the same attribution the moderation queue
  // records on Report (resolvedAt/resolvedById), just surfaced here since
  // a role can be changed more than once and each prior change stays in
  // the AdminAction log even after a newer one lands.
  const lastActions =
    users.length > 0
      ? await prisma.adminAction.findMany({
          where: { userId: { in: users.map((u) => u.id) } },
          orderBy: { createdAt: "desc" },
          distinct: ["userId"],
          include: { actedBy: { select: { username: true, displayName: true } } },
        })
      : [];
  const lastActionByUserId = new Map(lastActions.map((action) => [action.userId, action]));

  const items: AdminUserRow[] = users.map((row) => {
    const lastAction = lastActionByUserId.get(row.id);
    return {
      id: row.id,
      username: row.username,
      displayName: row.displayName,
      avatarUrl: avatarSrc(row.profile?.avatarUrl),
      role: row.role,
      status: row.status,
      isSelf: row.id === user.id,
      isLastAdmin: row.role === "ADMIN" && adminCount <= 1,
      lastChange: lastAction
        ? {
            kind: lastAction.kind,
            byDisplayName: lastAction.actedBy.displayName,
            byUsername: lastAction.actedBy.username,
            at: relativeTime(lastAction.createdAt),
          }
        : null,
    };
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <p className="eyebrow mb-2">Admin</p>
      <h1 className="display mb-1 text-2xl uppercase tracking-[0.04em]">User roles</h1>
      <p className="mb-6 text-sm text-muted">
        {query ? (
          <>
            {items.length} {items.length === 1 ? "match" : "matches"} for &ldquo;{query}&rdquo;.
          </>
        ) : (
          <>Showing the first {items.length} accounts by username — search to narrow it down.</>
        )}
      </p>

      <AdminUsersTable items={items} initialQuery={query} />
    </div>
  );
}
