import { createHash, randomBytes } from "node:crypto";

export interface StoredBytes {
  readonly objectKey: string;
  readonly sha256: string;
  readonly byteSize: bigint;
}

export interface StoragePort {
  put(source: AsyncIterable<Uint8Array>, maximumBytes: number): Promise<StoredBytes>;
  restoreVerified(objectKey: string, source: AsyncIterable<Uint8Array>, expected: Pick<StoredBytes, "sha256" | "byteSize">, maximumBytes: number): Promise<void>;
  getVerified(objectKey: string, expected: Pick<StoredBytes, "sha256" | "byteSize">, maximumBytes: number): Promise<Buffer>;
  removeVerified(objectKey: string, expected: Pick<StoredBytes, "sha256" | "byteSize">): Promise<void>;
}

export function newObjectKey(): string {
  return randomBytes(32).toString("hex");
}

export async function digest(source: AsyncIterable<Uint8Array>, maximumBytes: number): Promise<{ bytes: Buffer; sha256: string; byteSize: bigint }> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new Error("Invalid storage size limit");
  const chunks: Buffer[] = [];
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of source) {
    if (!(chunk instanceof Uint8Array)) throw new Error("Storage input must contain bytes");
    size += chunk.byteLength;
    if (size > maximumBytes) throw new Error("Storage object exceeds size limit");
    const bytes = Buffer.from(chunk);
    chunks.push(bytes);
    hash.update(bytes);
  }
  return { bytes: Buffer.concat(chunks, size), sha256: hash.digest("hex"), byteSize: BigInt(size) };
}

