import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Analytics has been redesigned into Insights.
 * This redirect maintains backward compatibility for any existing links and bookmarks.
 */
export default async function AnalyticsRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const resolved = await searchParams;
  const query = resolved.days ? `?days=${resolved.days}` : "";
  redirect(`/insights${query}`);
}
