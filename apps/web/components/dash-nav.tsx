"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const GROUPS = [
  {
    title: "Studio",
    items: [
      { href: "/", label: "Home" },
      { href: "/assets", label: "Videos" },
      { href: "/jobs", label: "Jobs" },
      { href: "/renders", label: "Timeline" },
    ],
  },
  {
    title: "Developers",
    items: [
      { href: "/api-keys", label: "API keys" },
      { href: "/webhooks", label: "Webhooks" },
    ],
  },
  {
    title: "Help",
    items: [{ href: "/docs", label: "Guide" }],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashNav() {
  const pathname = pathnameOrEmpty(usePathname());

  return (
    <nav className="dash-nav" aria-label="Dashboard">
      {GROUPS.map((group) => (
        <div key={group.title} className="dash-nav-group">
          <p className="dash-nav-title">{group.title}</p>
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={isActive(pathname, item.href) ? "is-active" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

function pathnameOrEmpty(value: string | null) {
  return value ?? "/";
}
