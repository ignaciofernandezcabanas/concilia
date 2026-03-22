"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useCompany } from "@/hooks/useApi";
import Sidebar from "@/components/Sidebar";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { session, loading, isConfigured } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Load company to check if onboarding is needed
  const { data: companyData, loading: companyLoading } = useCompany();

  useEffect(() => {
    if (!loading && isConfigured && !session) {
      router.push("/login");
    }
  }, [loading, session, isConfigured, router]);

  // Redirect to onboarding if no company exists (but user is authenticated)
  useEffect(() => {
    if (
      !loading &&
      !companyLoading &&
      session &&
      !companyData?.company &&
      pathname !== "/onboarding"
    ) {
      router.push("/onboarding");
    }
  }, [loading, companyLoading, session, companyData, pathname, router]);

  if (loading || (isConfigured && session && companyLoading)) {
    return (
      <div className="flex items-center justify-center h-screen bg-page">
        <LoadingSpinner />
      </div>
    );
  }

  if (isConfigured && !session) {
    return null;
  }

  // Onboarding page: no sidebar
  if (pathname === "/onboarding") {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-page">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
