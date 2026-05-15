"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { getOAuthCallbackUrl } from "@/lib/oauth-callback-url";

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace("/");
    });
  }, [router]);

  async function signInWithGoogle() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: getOAuthCallbackUrl() },
    });
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <h1 className="text-2xl font-semibold mb-2">Habit Tracker</h1>
      <p className="text-zinc-600 mb-8">Sign in to view and edit your habits.</p>
      <button
        type="button"
        onClick={signInWithGoogle}
        className="px-6 py-3 bg-zinc-900 text-white rounded-lg font-medium hover:bg-zinc-800 min-h-[44px]"
      >
        Sign in with Google
      </button>
    </div>
  );
}
