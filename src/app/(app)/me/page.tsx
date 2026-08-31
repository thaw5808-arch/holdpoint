import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

export default async function MePage() {
  const user = await getCurrentUser();
  redirect(user ? `/u/${user.username}` : "/login");
}
