"use client";

import { useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import { uploadAvatarAction } from "@/lib/actions/profile";

/**
 * Wraps the big profile-header Avatar with a "Change avatar" control —
 * only ever rendered for the signed-in user's own profile (see the
 * isOwnProfile check in u/[username]/page.tsx). uploadAvatarAction
 * re-validates the file itself regardless; this just decides whether the
 * control shows up at all.
 */
export function AvatarUpload({
  name,
  seed,
  size,
  presence,
  initialAvatarUrl,
}: {
  name: string;
  seed: string;
  size: number;
  presence?: "ONLINE" | "IN_GAME" | "STREAMING" | "AWAY" | "OFFLINE";
  initialAvatarUrl?: string | null;
}) {
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const result = await uploadAvatarAction(formData);
      if ("error" in result) {
        setError(result.error);
      } else {
        setAvatarUrl(result.avatarUrl);
      }
    });
    // Reset so picking the same file again (e.g. retrying after an error)
    // still fires onChange.
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div>
      <Avatar name={name} seed={seed} size={size} presence={presence} avatarUrl={avatarUrl} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isPending}
        className="btn btn-ghost mt-1.5 w-full text-[0.6875rem]"
      >
        {isPending ? "Uploading…" : "Change avatar"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        onChange={(event) => handleFile(event.target.files?.[0])}
      />
      {error && (
        <p role="alert" className="mt-1 max-w-[100px] text-[0.6875rem] leading-snug text-live">
          {error}
        </p>
      )}
    </div>
  );
}
