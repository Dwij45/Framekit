import { prisma } from "@framekit/db";
import { auth } from "@/auth";
import { Uploader } from "@/components/uploader";
import Link from "next/link";

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
    <section>
      <h1>Assets</h1>
      <p className="lede">
        The file goes to MinIO with a presigned URL. Next.js never holds the
        bytes. The worker then probes, encodes a ladder, and packages HLS.
      </p>
      <Uploader />
      {assets.length === 0 ? (
        <p className="muted">No uploads yet.</p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>File</th>
              <th>Status</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => (
              <tr key={asset.id}>
                <td>
                  <Link href={`/assets/${asset.id}`}>{asset.fileName}</Link>
                </td>
                <td>{asset.status}</td>
                <td>{asset.contentType}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
