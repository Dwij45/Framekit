import { auth } from "@/auth";
import { DashNav } from "@/components/dash-nav";
import { SignOutButton } from "@/components/sign-out-button";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <div className="dash">
      <aside className="dash-side">
        <div>
          <p className="brand">Framekit</p>
          <p className="brand-sub">Upload. Encode. Play.</p>
        </div>
        <DashNav />
        <div className="dash-user">
          <p>{session?.user?.email}</p>
          <SignOutButton />
        </div>
      </aside>
      <div className="dash-main">{children}</div>
    </div>
  );
}
