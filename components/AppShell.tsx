"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import Sidebar from "@/components/Sidebar";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { session, loading, isConfigured } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && isConfigured && !session) {
      router.push("/login");
    }
  }, [loading, session, isConfigured, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-page">
        <LoadingSpinner />
      </div>
    );
  }

  // If auth is not configured, allow access (development mode)
  if (isConfigured && !session) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-page">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
