import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { HabitForm } from "@/components/HabitForm";
import { resolvedRouteParams } from "@/lib/route-params";

export default async function EditHabitRoute({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const { id } = await resolvedRouteParams(params);
  if (!id) redirect("/habits");
  const supabase = await createClient();
  // getSession reads the cookie-backed session without an extra Auth API round-trip;
  // getUser() validates JWT remotely and is noticeably slower on navigation.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) redirect("/login");
  const { data: habit } = await supabase.from("habits").select("*").eq("id", id).eq("user_id", user.id).single();
  if (!habit) redirect("/habits");
  return <HabitForm mode="edit" habit={habit} />;
}
