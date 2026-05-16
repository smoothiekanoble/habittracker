import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { MainTabsShell } from "@/components/MainTabsShell";
import { TodayPage } from "@/components/TodayPage";
import { HabitsListPage } from "@/components/HabitsListPage";

export default async function HabitsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return (
    <MainTabsShell
      initialTab="habits"
      today={<TodayPage />}
      habits={<HabitsListPage />}
    />
  );
}
