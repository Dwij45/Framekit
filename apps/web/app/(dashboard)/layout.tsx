import Link from "next/link";
import { auth } from "@/auth";
import { SignOutButton } from "@/components/sign-out-button";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/assets", label: "Assets" },
  { href: "/jobs", label: "Jobs" },
  { href: "/api-keys", label: "API keys" },
  { href: "/docs", label: "Docs" },
];

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
          <p className="brand-sub">Video pipeline</p>
        </div>
        <nav>
          {NAV.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="dash-user">
          <p>{session?.user?.email}</p>
          <SignOutButton />
        </div>
      </aside>
      <div className="dash-main">{children}</div>
    </div>
  );
}
