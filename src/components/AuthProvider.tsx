"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { installAuthFetch } from "@/lib/auth-fetch";

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Before any child renders (children wait for `loading` to clear), so
    // every dashboard /api call carries the user's token.
    installAuthFetch();
    const unsubscribe = auth.onAuthStateChanged(
      (user: User | null) => {
        setUser(user);
        setLoading(false);
        if (!user && typeof window !== 'undefined') {
          router.push("/auth/login");
        }
      },
      (error: Error) => {
        console.error("Auth error:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
