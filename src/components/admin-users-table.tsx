"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { AccountStatus, UserRole } from "@prisma/client";
import { Search } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Pill } from "@/components/ui";
import { changeUserRoleAction, liftSuspensionAction } from "@/lib/actions/admin";

const ROLES: UserRole[] = ["VIEWER", "CREATOR", "ORGANIZER", "MODERATOR", "ADMIN"];

const STATUS_TONE: Record<AccountStatus, "signal" | "quiet" | "gold"> = {
  ACTIVE: "signal",
  SUSPENDED: "gold",
  BANNED: "quiet",
  DELETED: "quiet",
};

export interface AdminUserRow {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  role: UserRole;
  status: AccountStatus;
  /** The signed-in admin viewing this list — their own row can't submit a role change. */
  isSelf: boolean;
  /** role === ADMIN and this is the only ADMIN account left — demoting it is blocked server-side too. */
  isLastAdmin: boolean;
  lastChange: {
    kind: "ROLE_CHANGE" | "SUSPENSION_LIFTED";
    byDisplayName: string;
    byUsername: string;
    at: string; // pre-formatted relative time
  } | null;
}

/**
 * Debounced search box that drives the page's own `?q=` — a server
 * component re-fetches on navigation rather than this component holding
 * the result set itself, since "the list will grow" means the query
 * belongs to the DB, not the client. Same debounce-then-replace approach
 * as elsewhere in this codebase's client-side filters, just pushed through
 * the URL instead of local state so the search term survives a refresh.
 */
function UserSearch({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(initialQuery);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const params = new URLSearchParams();
      if (value.trim()) params.set("q", value.trim());
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative mb-5">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
      <input
        type="text"
        className="input input-icon-left"
        placeholder="Search by username or display name"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-label="Search users"
      />
    </div>
  );
}

function lastChangeLabel(change: NonNullable<AdminUserRow["lastChange"]>) {
  const verb = change.kind === "ROLE_CHANGE" ? "Role changed" : "Suspension lifted";
  return `${verb} by ${change.byDisplayName} (@${change.byUsername}) ${change.at}`;
}

function UserRow({ item }: { item: AdminUserRow }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // On success, re-fetch the server component rather than patching local
  // state — a role change can shift another row's isLastAdmin (demoting
  // one of two admins makes the other the last one) and attaches a real
  // "changed by" attribution, neither of which this row can compute on its
  // own from just its own result.
  const handleRoleChange = (role: string) => {
    if (role === item.role) return;
    setError(null);
    startTransition(async () => {
      const result = await changeUserRoleAction(item.id, role);
      if ("error" in result) setError(result.error);
      else router.refresh();
    });
  };

  const handleLiftSuspension = () => {
    setError(null);
    startTransition(async () => {
      const result = await liftSuspensionAction(item.id);
      if ("error" in result) setError(result.error);
      else router.refresh();
    });
  };

  // Mirrors the two server-side invariants in changeUserRoleAction so the
  // control is disabled before the round-trip, not just after it errors —
  // the action itself is what actually enforces these, this is UX only.
  const roleLocked = item.isSelf || item.isLastAdmin;
  const roleLockedReason = item.isSelf
    ? "You can't change your own role."
    : item.isLastAdmin
      ? "This is the last admin — promote someone else before demoting them."
      : null;

  return (
    <li className="flex flex-wrap items-center gap-3 border border-line bg-surface p-3">
      <Avatar name={item.displayName} seed={item.username} size={32} avatarUrl={item.avatarUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          {item.displayName} <span className="text-faint">@{item.username}</span>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Pill tone={STATUS_TONE[item.status]}>{item.status.toLowerCase()}</Pill>
          {item.lastChange && (
            <span className="text-[0.6875rem] text-faint">{lastChangeLabel(item.lastChange)}</span>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-1 text-[0.75rem] text-live">
            {error}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {item.status === "SUSPENDED" && (
          <button type="button" className="btn" disabled={isPending} onClick={handleLiftSuspension}>
            Lift suspension
          </button>
        )}
        <select
          className="input"
          value={item.role}
          disabled={roleLocked || isPending}
          title={roleLockedReason ?? undefined}
          aria-label={`Role for ${item.displayName}`}
          onChange={(event) => handleRoleChange(event.target.value)}
        >
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      </div>
    </li>
  );
}

/**
 * Thin wrapper around the search box and the row list — unlike
 * ModerationQueue, this doesn't own the list client-side, because a role
 * change here can affect *other* rows (the last-admin flag shifting to
 * whoever's left) in a way a resolved report never affects other reports.
 * Each row's own action triggers router.refresh() instead, so this always
 * renders whatever the server most recently computed.
 */
export function AdminUsersTable({ items, initialQuery }: { items: AdminUserRow[]; initialQuery: string }) {
  return (
    <>
      <UserSearch initialQuery={initialQuery} />
      {items.length === 0 ? (
        <p className="border border-dashed border-line px-6 py-10 text-center text-sm text-muted">
          {initialQuery ? "Nobody matches that search." : "No accounts yet."}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <UserRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </>
  );
}
