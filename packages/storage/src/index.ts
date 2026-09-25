import {
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

export function s3Bucket(): string {
  return required("S3_BUCKET");
}

export function getS3(): S3Client {
  return new S3Client({
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint: required("S3_ENDPOINT"),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    credentials: {
      accessKeyId: required("S3_ACCESS_KEY"),
      secretAccessKey: required("S3_SECRET_KEY"),
    },
  });
}

export async function presignPut(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: s3Bucket(),
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(getS3(), command, { expiresIn: 60 * 15 });
}

export async function ensureBucket(): Promise<void> {
  const Bucket = s3Bucket();
  try {
    await getS3().send(new HeadBucketCommand({ Bucket }));
  } catch {
    await getS3().send(new CreateBucketCommand({ Bucket }));
  }
}

export async function headObject(key: string) {
  return getS3().send(
    new HeadObjectCommand({
      Bucket: s3Bucket(),
      Key: key,
    }),
  );
}

export async function downloadObjectToFile(key: string, destPath: string): Promise<void> {
  const res = await getS3().send(
    new GetObjectCommand({
      Bucket: s3Bucket(),
      Key: key,
    }),
  );
  if (!res.Body) throw new Error("Empty S3 body");
  await pipeline(res.Body as Readable, createWriteStream(destPath));
}

export async function uploadFile(
  key: string,
  filePath: string,
  contentType: string,
): Promise<number> {
  const { createReadStream } = await import("node:fs");
  const { stat } = await import("node:fs/promises");
  const size = (await stat(filePath)).size;
  await getS3().send(
    new PutObjectCommand({
      Bucket: s3Bucket(),
      Key: key,
      Body: createReadStream(filePath),
      ContentType: contentType,
      ContentLength: size,
    }),
  );
  return size;
}

export async function uploadBytes(
  key: string,
  body: Buffer | string,
  contentType: string,
): Promise<number> {
  const buf = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  await getS3().send(
    new PutObjectCommand({
      Bucket: s3Bucket(),
      Key: key,
      Body: buf,
      ContentType: contentType,
      ContentLength: buf.length,
    }),
  );
  return buf.length;
}

export async function getObject(key: string, range?: string, signal?: AbortSignal) {
  return getS3().send(
    new GetObjectCommand({
      Bucket: s3Bucket(),
      Key: key,
      Range: range,
    }),
    signal ? { abortSignal: signal } : undefined,
  );
}

export async function deleteObjectKey(key: string): Promise<void> {
  if (!key || key === "pending") return;
  await getS3().send(
    new DeleteObjectCommand({
      Bucket: s3Bucket(),
      Key: key,
    }),
  );
}

export async function deletePrefix(prefix: string): Promise<void> {
  if (!prefix) return;
  const Bucket = s3Bucket();
  const client = getS3();
  let token: string | undefined;
  do {
    const listed = await client.send(
      new ListObjectsV2Command({
        Bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    const objects = (listed.Contents ?? [])
      .map((obj) => obj.Key)
      .filter((key): key is string => Boolean(key))
      .map((Key) => ({ Key }));
    if (objects.length > 0) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket,
          Delete: { Objects: objects, Quiet: true },
        }),
      );
    }
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (token);
}
