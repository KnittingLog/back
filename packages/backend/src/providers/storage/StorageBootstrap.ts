import path from "node:path";

import { configureStorageAdapter, configureUploadStorageCode } from "./StorageConfiguration";
import { LocalFilesystemStorage } from "./LocalFilesystemStorage";

export interface LocalStorageOptions {
  readonly mode: "local" | "dev" | "real";
  readonly storageCode: string;
  readonly absoluteRoot: string;
}

export async function configureLocalFilesystemStorage(options: LocalStorageOptions): Promise<{
  storageCode: string;
  storage: LocalFilesystemStorage;
}> {
  if (options.mode !== "local") throw new Error("Local filesystem storage requires MODE=local");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(options.storageCode)) throw new Error("An explicit storage code is required");
  if (!path.isAbsolute(options.absoluteRoot)) throw new Error("An explicit absolute storage root is required");
  const storage = await LocalFilesystemStorage.open(options.absoluteRoot);
  configureStorageAdapter(options.storageCode, storage);
  configureUploadStorageCode(options.storageCode);
  return { storageCode: options.storageCode, storage };
}

export async function configureStorageFromEnvironment(mode: LocalStorageOptions["mode"], environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  const storageCode = environment.KNITTINGLOG_LOCAL_STORAGE_CODE;
  const absoluteRoot = environment.KNITTINGLOG_LOCAL_STORAGE_ROOT;
  if (storageCode === undefined && absoluteRoot === undefined) return;
  if (!storageCode || !absoluteRoot) throw new Error("Local storage code and root must be configured together");
  await configureLocalFilesystemStorage({ mode, storageCode, absoluteRoot });
}
