"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button type="button" className="btn-ghost" onClick={() => signOut({ callbackUrl: "/login" })}>
      Sign out
    </button>
  );
}
