import { prisma } from "@framekit/db";
import { auth } from "@/auth";
import { CreateApiKeyForm } from "@/components/create-api-key-form";
import { RevokeKeyButton } from "@/components/revoke-key-button";

export default async function ApiKeysPage() {
  const session = await auth();
  const keys = session?.user?.id
    ? await prisma.apiKey.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
      })
    : [];

  return (
    <section className="page">
      <header className="page-head">
        <p className="eyebrow">Developers</p>
        <h1>API keys</h1>
        <p className="lede">
          Scripts and curl use a secret that starts with <code>fk_test_</code>.
          We only store a hash. Copy the full key when it appears — you will
          not see it again.
        </p>
      </header>
      <div className="panel">
        <CreateApiKeyForm />
      </div>
      {keys.length === 0 ? (
        <p className="muted">No keys yet.</p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Prefix</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key.id}>
                <td>{key.name}</td>
                <td>
                  <code>{key.prefix}…</code>
                </td>
                <td>{key.revokedAt ? "Revoked" : "Active"}</td>
                <td>{key.revokedAt ? null : <RevokeKeyButton keyId={key.id} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
