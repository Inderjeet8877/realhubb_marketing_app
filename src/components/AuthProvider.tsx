"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { refreshSession, useMe, type Me } from "@/lib/api";

interface AuthContextType {
  /** Signed-in Broadzen user (cookie session). */
  me: Me | null;
  /**
   * Legacy Firebase user, only for the Meta-connect flow in Settings that still
   * sends Firebase ID tokens. Usually null now that sign-in no longer uses Firebase.
   */
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ me: null, user: null, loading: true });

export function useAuth() {
  return useContext(AuthContext);
}

/** Gate for the legacy /dashboard: signed-in platform admins only. */
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: me, error } = useMe();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (me && !me.user.isPlatformAdmin) router.replace("/workspace");
  }, [me, router]);

  useEffect(() => auth.onAuthStateChanged(setUser, () => setUser(null)), []);

  // Legacy pages call fetch() directly (no auto-refresh), so keep the
  // 15-minute access cookie fresh while the dashboard is open.
  useEffect(() => {
    const t = setInterval(refreshSession, 10 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  if (error && !me) {
    // useMe() already redirects to sign-in on 401; this covers anything else.
    return <div role="alert" className="min-h-screen flex items-center justify-center text-sm text-red-700">{error.message}</div>;
  }
  if (!me?.user.isPlatformAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center" aria-busy="true" aria-label="Loading">
        <Loader2 className="w-8 h-8 animate-spin text-teal-700" />
      </div>
    );
  }

  return <AuthContext.Provider value={{ me, user, loading: false }}>{children}</AuthContext.Provider>;
}
