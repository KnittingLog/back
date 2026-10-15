import { StoragePort, StoredBytes } from "./StoragePort";

export function requireStorageAdapter(adapter: StoragePort | undefined): StoragePort {
  if (!adapter) throw new Error("Storage adapter is not configured; file access is unavailable");
  return adapter;
}

const configuredAdapters = new Map<string, StoragePort>();
let uploadStorageCode: string | undefined;
let retentionInventory: RetentionInventory | undefined;

export function configureStorageAdapter(storageCode: string, adapter: StoragePort): void {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(storageCode)) throw new Error("Invalid storage code");
  const existing = configuredAdapters.get(storageCode);
  if (existing && existing !== adapter) throw new Error("Storage code cannot be rebound to another adapter");
  configuredAdapters.set(storageCode, adapter);
}

export function storageAdapterForCode(storageCode: string): StoragePort | undefined {
  return configuredAdapters.get(storageCode);
}

export function configuredStorageAdapters(): ReadonlyMap<string, StoragePort> {
  return new Map(configuredAdapters);
}

export function configureUploadStorageCode(storageCode: string): void {
  if (!configuredAdapters.has(storageCode)) throw new Error("Upload storage adapter is not configured");
  if (uploadStorageCode && uploadStorageCode !== storageCode) throw new Error("Upload storage code cannot be rebound");
  uploadStorageCode = storageCode;
}

export function configuredUploadStorage(): { storageCode: string; storage: StoragePort } | undefined {
  if (!uploadStorageCode) return undefined;
  const storage = configuredAdapters.get(uploadStorageCode);
  return storage ? { storageCode: uploadStorageCode, storage } : undefined;
}

export async function verifyStoredObject(
  adapter: StoragePort | undefined,
  object: StoredBytes,
  maximumBytes: number,
): Promise<Buffer> {
  if (object.byteSize < 0n || object.byteSize > BigInt(maximumBytes))
    throw new Error("Stored object exceeds restore size limit");
  return requireStorageAdapter(adapter).getVerified(object.objectKey, object, maximumBytes);
}

export interface PurgeEvidence {
  readonly now: Date;
  readonly currentReferenceCount: number;
  readonly recoverableContentUntil: Date | null;
  readonly retainedBackupReferenceThrough: Date;
  readonly backupEvidenceScannedAt: Date;
  readonly backupEvidenceCoversThrough: Date;
  readonly objectKey: string;
  readonly sha256: string;
}

export function assertPurgeEligible(evidence: PurgeEvidence): void {
  const times = [evidence.now, evidence.recoverableContentUntil, evidence.retainedBackupReferenceThrough,
    evidence.backupEvidenceScannedAt, evidence.backupEvidenceCoversThrough].filter((date): date is Date => date !== null).map((date) => date.getTime());
  if (times.some((time) => !Number.isFinite(time)) || !Number.isSafeInteger(evidence.currentReferenceCount) ||
      evidence.currentReferenceCount < 0 || !/^[a-f0-9]{64}$/.test(evidence.objectKey) || !/^[a-f0-9]{64}$/.test(evidence.sha256) ||
      evidence.backupEvidenceScannedAt.getTime() > evidence.now.getTime() ||
      evidence.now.getTime() - evidence.backupEvidenceScannedAt.getTime() > 5 * 60_000 ||
      evidence.backupEvidenceCoversThrough.getTime() < evidence.now.getTime())
    throw new Error("Purge denied: server-verified backup retention evidence is unavailable");
  if (evidence.currentReferenceCount !== 0 ||
      evidence.recoverableContentUntil !== null && evidence.now < evidence.recoverableContentUntil ||
      evidence.now < evidence.retainedBackupReferenceThrough)
    throw new Error("Purge denied: a reference or recovery retention window remains");
}

export interface BackupRetentionEvidence {
  readonly storageCode: string;
  readonly objectKey: string;
  readonly sha256: string;
  readonly byteSize: bigint;
  readonly scannedAt: Date;
  readonly coversThrough: Date;
  readonly retainUntil: Date;
}

export interface RetentionInventory {
  /** 구현체는 서버 측 백업 인벤토리를 검증해야 합니다. 요청 본문은 입력으로 받지 않습니다. */
  inspect(object: StoredBytes & { readonly storageCode: string }): Promise<BackupRetentionEvidence | undefined>;
}

export const unavailableRetentionInventory: RetentionInventory = {
  async inspect() { return undefined; },
};

export function configureRetentionInventory(inventory: RetentionInventory): void {
  if (retentionInventory && retentionInventory !== inventory)
    throw new Error("Retention inventory cannot be rebound");
  retentionInventory = inventory;
}

export function configuredRetentionInventory(): RetentionInventory {
  return retentionInventory ?? unavailableRetentionInventory;
}
