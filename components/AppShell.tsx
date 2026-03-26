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
  const isOnboarding = pathname === "/onboarding";

  // Skip API call on /onboarding to avoid 401 loop for new users
  const {
    data: companyData,
    loading: companyLoading,
    error: companyError,
  } = useFetch<CompanyResponse>(isOnboarding ? null : "/api/settings/company");

  // Redirect to login if no session
  useEffect(() => {
    if (!loading && isConfigured && !session) {
      router.push("/login");
    }
  }, [loading, session, isConfigured, router]);

  // Redirect to onboarding if no company (user exists but no company)
  useEffect(() => {
    if (
      !loading &&
      !companyLoading &&
      session &&
      !isOnboarding &&
      companyData &&
      !companyData.company
    ) {
      router.push("/onboarding");
    }
  }, [loading, companyLoading, session, companyData, isOnboarding, router]);

  // Show loading while auth or company data is being fetched
  if (loading || (isConfigured && session && !isOnboarding && companyLoading)) {
    return (
      <div className="flex items-center justify-center h-screen bg-page">
        <LoadingSpinner />
      </div>
    );
  }

  // No session — render nothing (redirect to login happening)
  if (isConfigured && !session) {
    return null;
  }

  // Company API returned error (401 = user not in DB) — show nothing while api-client redirects
  if (!isOnboarding && companyError && !companyData) {
    return (
      <div className="flex items-center justify-center h-screen bg-page">
        <LoadingSpinner />
      </div>
    );
  }

  // Onboarding page: no sidebar
  if (isOnboarding) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-page">
      <Sidebar />
      <main className="flex-1 overflow-auto animate-fade-in">{children}</main>
    </div>
  );
}
