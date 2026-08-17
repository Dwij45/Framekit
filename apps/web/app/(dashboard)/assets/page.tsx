import Link from "next/link";
import { prisma } from "@framekit/db";
import { auth } from "@/auth";
import { StatusPill } from "@/components/status-pill";
import { Uploader } from "@/components/uploader";

export default async function AssetsPage() {
  const session = await auth();
  const assets = session?.user?.id
    ? await prisma.asset.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      })
    : [];

  return (
    <section className="page">
      <header className="page-head">
        <p className="eyebrow">Studio</p>
        <h1>Videos</h1>
        <p className="lede">
          Upload a clip. We store it privately, then the worker turns it into
          a ladder of MP4s plus an HLS playlist you can play in the browser.
        </p>
      </header>
      <Uploader />
      {assets.length === 0 ? (
        <p className="muted">Nothing here yet. Choose a video above.</p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>File</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => (
              <tr key={asset.id}>
                <td>
                  <Link href={`/assets/${asset.id}`}>{asset.fileName}</Link>
                </td>
                <td>
                  <StatusPill status={asset.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
