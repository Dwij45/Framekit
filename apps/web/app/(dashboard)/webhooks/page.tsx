import { prisma } from "@framekit/db";
import { auth } from "@/auth";
import { CreateWebhookForm } from "@/components/create-webhook-form";
import { DisableWebhookButton } from "@/components/disable-webhook-button";

export default async function WebhooksPage() {
  const session = await auth();
  const endpoints = session?.user?.id
    ? await prisma.webhookEndpoint.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
      })
    : [];

  return (
    <section className="page">
      <header className="page-head">
        <p className="eyebrow">Developers</p>
        <h1>Webhooks</h1>
        <p className="lede">
          When a job finishes we POST to your URL so you do not have to poll.
          Paste a{" "}
          <a href="https://webhook.site" target="_blank" rel="noreferrer">
            webhook.site
          </a>{" "}
          link to try it. We sign every request; copy the signing secret once.
        </p>
      </header>
      <div className="panel">
        <CreateWebhookForm />
      </div>
      {endpoints.length === 0 ? (
        <p className="muted">No endpoints yet.</p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>URL</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {endpoints.map((row) => (
              <tr key={row.id}>
                <td className="url-cell">{row.url}</td>
                <td>{row.disabledAt ? "Off" : "On"}</td>
                <td>{row.disabledAt ? null : <DisableWebhookButton endpointId={row.id} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
