import AppShell from "@/components/AppShell";
import { TourProvider } from "@/components/tour/TourProvider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <TourProvider>{children}</TourProvider>
    </AppShell>
  );
}
