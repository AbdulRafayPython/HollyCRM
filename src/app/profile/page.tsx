import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Profile settings are unified under /settings.
 * This redirect maintains bookmark and routing compatibility.
 */
export default async function ProfilePage() {
  redirect("/settings");
}
