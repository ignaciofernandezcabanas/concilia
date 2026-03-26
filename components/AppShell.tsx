"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useFetch } from "@/hooks/useApi";
import Sidebar from "@/components/Sidebar";
import LoadingSpinner from "@/components/LoadingSpinner";

interface CompanyResponse {
  company: { id: string; name: string } | null;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { session, loading, isConfigured } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Load company to check if onboarding is needed
  // Pass null on /onboarding to skip the API call entirely (avoids 401 loop for new OAuth users)
  const isOnboarding = pathname === "/onboarding";
  const {
    data: companyData,
    loading: companyLoading,
    error: companyError,
  } = useFetch<CompanyResponse>(isOnboarding ? null : "/api/settings/company");

  useEffect(() => {
    if (!loading && isConfigured && !session) {
      router.push("/login");
    }
  }, [loading, session, isConfigured, router]);

  // Redirect to onboarding if:
  // 1. API returned data but no company (user exists, no company)
  // 2. API returned error (user not in DB — 401 from withAuth)
  useEffect(() => {
    if (!loading && !companyLoading && session && !isOnboarding) {
      if ((companyData && !companyData.company) || (companyError && !companyData)) {
        router.push("/onboarding");
      }
    }
  }, [loading, companyLoading, session, companyData, companyError, isOnboarding, pathname, router]);

  if (loading || (isConfigured && session && !isOnboarding && companyLoading)) {
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
      <main className="flex-1 overflow-auto animate-fade-in">{children}</main>
    </div>
  );
}
