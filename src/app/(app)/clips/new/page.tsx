import { redirect } from "next/navigation";
import { UploadClipForm } from "@/components/upload-clip-form";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export default async function NewClipPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const games = await prisma.game.findMany({ orderBy: { name: "asc" } });

  return <UploadClipForm games={games.map((game) => ({ slug: game.slug, name: game.name }))} />;
}
