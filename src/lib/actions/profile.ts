"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { avatarSrc } from "@/lib/avatar-url";
import { extensionFor, sniffImageType } from "@/lib/image-sniff";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { storage } from "@/lib/storage";

const MAX_BYTES = 2 * 1024 * 1024; // 2MB

export type UploadAvatarResult = { avatarUrl: string } | { error: string };

/**
 * Uploads a new avatar and swaps it in on Profile.avatarUrl. The upload,
 * DB update, and cleanup of the previous object happen in that order
 * deliberately: the new object exists in the bucket and the profile row
 * is already pointing at it before the old one is touched, so a delete
 * failure at the end just leaves one dead object behind rather than ever
 * leaving the profile pointing at nothing.
 */
export async function uploadAvatarAction(formData: FormData): Promise<UploadAvatarResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No file provided." };
  if (file.size === 0) return { error: "That file is empty." };
  if (file.size > MAX_BYTES) return { error: "Keep it under 2MB." };

  const bytes = Buffer.from(await file.arrayBuffer());

  // The file's declared type/name are never trusted for this — a renamed
  // .exe with a .png extension and an image/png content-type would sail
  // through either check. Only the actual bytes decide what this is.
  const imageType = sniffImageType(bytes);
  if (!imageType) return { error: "That doesn't look like an image file." };

  const key = `avatars/${user.id}/${randomUUID()}.${extensionFor(imageType)}`;

  const previous = await prisma.profile.findUnique({
    where: { userId: user.id },
    select: { avatarUrl: true },
  });

  await storage.put(key, bytes, imageType);

  await prisma.profile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, avatarUrl: key },
    update: { avatarUrl: key },
  });

  if (previous?.avatarUrl && previous.avatarUrl !== key) {
    await storage.delete(previous.avatarUrl).catch(() => {
      // Best-effort — an orphaned object in the bucket is a cheap problem,
      // losing track of the user's just-saved avatar would not be.
    });
  }

  revalidatePath(`/u/${user.username}`);
  return { avatarUrl: avatarSrc(key)! };
}
