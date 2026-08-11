import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";

export default function Home() {
  redirect(isSupabaseConfigured() ? "/inbox" : "/setup");
}
