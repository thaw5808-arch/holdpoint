"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { ReportDialog } from "@/components/report-dialog";

/** Small client island for the profile header's "Report" button — the
 * rest of the page is a server component, so this owns just the dialog's
 * open/closed state. Only ever rendered for someone else's profile (see
 * u/[username]/page.tsx's isOwnProfile gate); reportContentAction blocks
 * a self-report regardless. */
export function ProfileReportButton({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        <Flag size={14} /> Report
      </button>
      {open && <ReportDialog target="USER" targetId={userId} label="player" onClose={() => setOpen(false)} />}
    </>
  );
}
