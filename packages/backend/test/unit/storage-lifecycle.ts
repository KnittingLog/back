import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { LocalFilesystemStorage } from "../../src/providers/storage/LocalFilesystemStorage";
import { assertPurgeEligible, configuredUploadStorage, configureStorageAdapter, requireStorageAdapter, storageAdapterForCode, verifyStoredObject } from "../../src/providers/storage/StorageConfiguration";
import { configureLocalFilesystemStorage, configureStorageFromEnvironment } from "../../src/providers/storage/StorageBootstrap";
import { StoragePort } from "../../src/providers/storage/StoragePort";

async function* chunks(...values: string[]): AsyncGenerator<Uint8Array> {
  for (const value of values) yield Buffer.from(value);
}

async function main(): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "knittinglog-storage-"));
  try {
    assert.equal(configuredUploadStorage(), undefined);
    await configureStorageFromEnvironment("local", {});
    assert.equal(configuredUploadStorage(), undefined);
    await assert.rejects(configureStorageFromEnvironment("local", { KNITTINGLOG_LOCAL_STORAGE_CODE: "partial" }));
    await assert.rejects(configureStorageFromEnvironment("real", {
      KNITTINGLOG_LOCAL_STORAGE_CODE: "denied", KNITTINGLOG_LOCAL_STORAGE_ROOT: root,
    }));
    const storage = await LocalFilesystemStorage.open(root);
    const object = await storage.put(chunks("knit", "ting"), 32);
    assert.match(object.objectKey, /^[a-f0-9]{64}$/);
    assert.equal(object.byteSize, 8n);
    assert.equal(await storage.getVerified(object.objectKey, object, 32).then(String), "knitting");
    assert.equal(String(await verifyStoredObject(storage, object, 32)), "knitting");
    await assert.rejects(verifyStoredObject(undefined, object, 32));
    await assert.rejects(verifyStoredObject(storage, object, 2));
    await assert.rejects(storage.put(chunks("too large"), 2));
    await assert.rejects(storage.getVerified("../outside", object, 32));
    await assert.rejects(storage.put(chunks("replacement"), 32).then(async (replacement) => {
      const originalPath = path.join(root, object.objectKey);
      await fs.writeFile(originalPath, "tampered");
      await storage.getVerified(object.objectKey, object, 32);
      return replacement;
    }));
    await assert.rejects(storage.removeVerified(object.objectKey, object));

    const symlinkKey = "a".repeat(64);
    const outside = path.join(root, "outside");
    await fs.writeFile(outside, "outside");
    await fs.symlink(outside, path.join(root, symlinkKey));
    await assert.rejects(storage.removeVerified(symlinkKey, { sha256: "0".repeat(64), byteSize: 7n }));
    await assert.rejects(storage.getVerified(symlinkKey, { sha256: "0".repeat(64), byteSize: 7n }, 32));

    const removable = await storage.put(chunks("immutable"), 32);
    await storage.removeVerified(removable.objectKey, removable);
    await storage.removeVerified(removable.objectKey, removable);
    await storage.restoreVerified(removable.objectKey, chunks("immutable"), removable, 32);
    assert.equal(String(await storage.getVerified(removable.objectKey, removable, 32)), "immutable");
    await storage.removeVerified(removable.objectKey, removable);
    await assert.rejects(storage.restoreVerified(removable.objectKey, chunks("tampered"), removable, 32));
    await storage.restoreVerified(removable.objectKey, chunks("immutable"), removable, 32);
    assert.throws(() => requireStorageAdapter(undefined));
    const deniedPort = {} as StoragePort;
    assert.equal(requireStorageAdapter(deniedPort), deniedPort);
    configureStorageAdapter("unit-storage", storage);
    configureStorageAdapter("unit-storage", storage);
    assert.equal(storageAdapterForCode("unit-storage"), storage);
    assert.throws(() => configureStorageAdapter("unit-storage", deniedPort));
    assert.equal(storageAdapterForCode("not-configured"), undefined);
    await assert.rejects(configureLocalFilesystemStorage({ mode: "real", storageCode: "not-local", absoluteRoot: root }));
    await assert.rejects(configureLocalFilesystemStorage({ mode: "local", storageCode: "", absoluteRoot: root }));
    await assert.rejects(configureLocalFilesystemStorage({ mode: "local", storageCode: "relative", absoluteRoot: "relative-root" }));
    await configureStorageFromEnvironment("local", {
      KNITTINGLOG_LOCAL_STORAGE_CODE: "test-opt-in", KNITTINGLOG_LOCAL_STORAGE_ROOT: path.join(root, "opt-in"),
    });
    assert.equal(configuredUploadStorage()?.storageCode, "test-opt-in");

    assert.throws(() => assertPurgeEligible({ now: new Date("2026-03-01T00:00:00Z"),
      currentReferenceCount: 0, recoverableContentUntil: null, retainedBackupReferenceThrough: new Date("2026-02-01T00:00:00Z"),
      backupEvidenceScannedAt: new Date("2026-02-28T23:54:00Z"), backupEvidenceCoversThrough: new Date("2026-03-01T00:00:00Z"),
      objectKey: "a".repeat(64), sha256: "b".repeat(64) }));
    assert.throws(() => assertPurgeEligible({ now: new Date("2026-03-01T00:00:00Z"),
      currentReferenceCount: 0, recoverableContentUntil: null, retainedBackupReferenceThrough: new Date("2026-04-01T00:00:00Z"),
      backupEvidenceScannedAt: new Date("2026-03-01T00:00:00Z"), backupEvidenceCoversThrough: new Date("2026-03-01T00:00:00Z"),
      objectKey: "a".repeat(64), sha256: "b".repeat(64) }));
    assert.throws(() => assertPurgeEligible({ now: new Date(Number.NaN),
      currentReferenceCount: 0, recoverableContentUntil: null, retainedBackupReferenceThrough: new Date("2026-02-01T00:00:00Z"),
      backupEvidenceScannedAt: new Date("2026-03-01T00:00:00Z"), backupEvidenceCoversThrough: new Date("2026-03-01T00:00:00Z"),
      objectKey: "a".repeat(64), sha256: "b".repeat(64) }));
    assert.throws(() => assertPurgeEligible({ now: new Date("2026-03-01T00:00:00Z"),
      currentReferenceCount: Number.NaN, recoverableContentUntil: null, retainedBackupReferenceThrough: new Date("2026-02-01T00:00:00Z"),
      backupEvidenceScannedAt: new Date("2026-03-01T00:00:00Z"), backupEvidenceCoversThrough: new Date("2026-03-01T00:00:00Z"),
      objectKey: "a".repeat(64), sha256: "b".repeat(64) }));
    assert.throws(() => assertPurgeEligible({ now: new Date("2026-03-01T00:00:00Z"),
      currentReferenceCount: 1, recoverableContentUntil: null, retainedBackupReferenceThrough: new Date("2026-02-01T00:00:00Z"),
      backupEvidenceScannedAt: new Date("2026-03-01T00:00:00Z"), backupEvidenceCoversThrough: new Date("2026-03-01T00:00:00Z"),
      objectKey: "a".repeat(64), sha256: "b".repeat(64) }));
    assert.doesNotThrow(() => assertPurgeEligible({ now: new Date("2026-03-01T00:00:00Z"),
      currentReferenceCount: 0, recoverableContentUntil: null, retainedBackupReferenceThrough: new Date("2026-02-01T00:00:00Z"),
      backupEvidenceScannedAt: new Date("2026-03-01T00:00:00Z"), backupEvidenceCoversThrough: new Date("2026-03-01T00:00:00Z"),
      objectKey: "a".repeat(64), sha256: "b".repeat(64) }));
    console.log("PASS storage immutable keys, streamed integrity, bounded input, traversal/symlink rejection and purge retention guards");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error("FAIL storage lifecycle", error);
  process.exitCode = 1;
});
