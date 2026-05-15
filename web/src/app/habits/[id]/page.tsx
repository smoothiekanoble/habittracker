import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { resolvedRouteParams } from "@/lib/route-params";

/** Single-habit view removed; list + inline calendars are the primary UX. */
export default async function HabitDetailRoute({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const { id } = await resolvedRouteParams(params);
  if (!id) redirect("/habits");
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) redirect("/login");
  redirect("/habits");
}
