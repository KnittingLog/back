import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { digest, newObjectKey, StoredBytes, StoragePort } from "./StoragePort";

const KEY = /^[a-f0-9]{64}$/;

/** 명시적으로 선택한 로컬 테스트 저장소입니다. 기본 또는 운영 저장소로 사용하지 않습니다. */
export class LocalFilesystemStorage implements StoragePort {
  private constructor(private readonly root: string) {}

  public static async open(root: string): Promise<LocalFilesystemStorage> {
    if (!path.isAbsolute(root)) throw new Error("Local storage root must be absolute");
    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    const realRoot = await fs.realpath(root);
    const stat = await fs.lstat(realRoot);
    if (!stat.isDirectory() || stat.mode & 0o077) throw new Error("Local storage root must be a private directory");
    return new LocalFilesystemStorage(realRoot);
  }

  public async put(source: AsyncIterable<Uint8Array>, maximumBytes: number): Promise<StoredBytes> {
    const object = await digest(source, maximumBytes);
    const objectKey = newObjectKey();
    const target = this.resolve(objectKey);
    const temporary = path.join(this.root, `.upload-${newObjectKey()}`);
    const handle = await fs.open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(object.bytes);
      await handle.sync();
      await fs.link(temporary, target);
    } finally {
      await handle.close();
      await fs.unlink(temporary).catch(() => undefined);
    }
    return { objectKey, sha256: object.sha256, byteSize: object.byteSize };
  }

  public async restoreVerified(objectKey: string, source: AsyncIterable<Uint8Array>, expected: Pick<StoredBytes, "sha256" | "byteSize">, maximumBytes: number): Promise<void> {
    const object = await digest(source, maximumBytes);
    if (object.sha256 !== expected.sha256 || object.byteSize !== expected.byteSize)
      throw new Error("Backup bytes integrity check failed");
    const target = this.resolve(objectKey);
    try {
      const current = await this.getVerified(objectKey, expected, maximumBytes);
      if (!current.equals(object.bytes)) throw new Error("Existing object conflicts with backup bytes");
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const temporary = path.join(this.root, `.restore-${newObjectKey()}`);
    const handle = await fs.open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(object.bytes);
      await handle.sync();
      await fs.link(temporary, target);
    } finally {
      await handle.close();
      await fs.unlink(temporary).catch(() => undefined);
    }
  }

  public async getVerified(objectKey: string, expected: Pick<StoredBytes, "sha256" | "byteSize">, maximumBytes: number): Promise<Buffer> {
    return this.readVerified(objectKey, expected, maximumBytes, true) as Promise<Buffer>;
  }

  public async removeVerified(objectKey: string, expected: Pick<StoredBytes, "sha256" | "byteSize">): Promise<void> {
    const target = this.resolve(objectKey);
    const stat = await this.readVerified(objectKey, expected, Number.MAX_SAFE_INTEGER, false).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    });
    if (!stat || Buffer.isBuffer(stat)) return;
    const current = await fs.lstat(target);
    if (!current.isFile() || current.isSymbolicLink() || current.ino !== stat.ino || current.dev !== stat.dev)
      throw new Error("Stored object changed during verified removal");
    await fs.unlink(target);
  }

  private async readVerified(key: string, expected: Pick<StoredBytes, "sha256" | "byteSize">, maximumBytes: number, keep: boolean): Promise<Buffer | { ino: number; dev: number }> {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0 || expected.byteSize < 0n ||
        expected.byteSize > BigInt(maximumBytes) || expected.byteSize > BigInt(Number.MAX_SAFE_INTEGER) ||
        !/^[a-f0-9]{64}$/.test(expected.sha256)) throw new Error("Stored object exceeds verification limit");
    const target = this.resolve(key);
    const handle = await fs.open(target, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    try {
      const before = await handle.stat();
      if (!before.isFile() || BigInt(before.size) !== expected.byteSize) throw new Error("Stored object size check failed");
      const hash = createHash("sha256");
      const chunks: Buffer[] = [];
      let position = 0;
      const limit = Number(expected.byteSize);
      while (position < limit) {
        const buffer = Buffer.alloc(Math.min(64 * 1024, limit - position));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
        if (!bytesRead) throw new Error("Stored object changed during verification");
        const chunk = buffer.subarray(0, bytesRead);
        hash.update(chunk);
        if (keep) chunks.push(chunk);
        position += bytesRead;
      }
      const after = await handle.stat();
      if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || hash.digest("hex") !== expected.sha256)
        throw new Error("Stored object integrity check failed");
      return keep ? Buffer.concat(chunks, position) : { ino: before.ino, dev: before.dev };
    } finally {
      await handle.close();
    }
  }

  private resolve(key: string): string {
    if (!KEY.test(key)) throw new Error("Invalid immutable object key");
    return path.join(this.root, key);
  }
}
