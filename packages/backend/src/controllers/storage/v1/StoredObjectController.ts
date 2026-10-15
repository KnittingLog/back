import core from "@nestia/core";
import { Controller, Headers, HttpCode, Res } from "@nestjs/common";
import type { Response } from "express";
import type { tags } from "typia";

import {
  configuredStorageAdapters,
  configuredRetentionInventory,
  configuredUploadStorage,
} from "../../../providers/storage/StorageConfiguration";
import { StoredObjectProvider as S } from "../../../providers/storage/StoredObjectProvider";
import { KnittingLogContext as K } from "../../../providers/common/KnittingLogContext";
import { AuthProvider } from "../../../providers/auth/AuthProvider";

const MAXIMUM_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAXIMUM_BASE64_LENGTH = Math.ceil(MAXIMUM_UPLOAD_BYTES / 3) * 4;

export interface UploadBody { data_base64: string & tags.MaxLength<13981016> }
export interface DownloadBody { data_base64: string; byte_size: number }

@Controller({ path: "storage/objects", version: "1" })
export class StoredObjectController {
  @core.TypedRoute.Post()
  @HttpCode(201)
  public async upload(
    @Headers("authorization") authorization: string | undefined,
    @core.TypedBody() input: UploadBody,
  ): Promise<{ id: string; sha256: string; byte_size: string; created_at: string }> {
    await AuthProvider.actor(authorization);
    K.keys(input, ["data_base64"]);
    if (!input.data_base64 || input.data_base64.length > MAXIMUM_BASE64_LENGTH || input.data_base64.length % 4 !== 0)
      K.fail(413, "FILE_TOO_LARGE", "파일이 비어 있거나 허용 크기를 초과했습니다.");
    const body = Buffer.from(input.data_base64, "base64");
    if (body.byteLength > MAXIMUM_UPLOAD_BYTES || body.toString("base64") !== input.data_base64)
      K.fail(413, "FILE_TOO_LARGE", "파일 바이트 또는 Base64 형식이 허용 범위를 초과했습니다.");
    const adapter = configuredUploadStorage();
    if (!adapter) K.fail(503, "STORAGE_UNAVAILABLE", "저장 위치가 설정되지 않았습니다.");
    const row = await S.upload(authorization, adapter, (async function* () {
      for (let offset = 0; offset < body.byteLength; offset += 64 * 1024)
        yield body.subarray(offset, offset + 64 * 1024);
    })(), MAXIMUM_UPLOAD_BYTES);
    return { id: row.id, sha256: row.sha256, byte_size: row.byte_size.toString(), created_at: row.created_at.toISOString() };
  }

  @core.TypedRoute.Get(":id")
  public async read(
    @Headers("authorization") authorization: string | undefined,
    @core.TypedParam("id") id: S.Uuid,
    @Res({ passthrough: true }) response: Response,
  ): Promise<DownloadBody> {
    const restored = await S.restoreOriginalBytes(authorization, id, configuredStorageAdapters(), MAXIMUM_UPLOAD_BYTES);
    response.setHeader("Cache-Control", "private, no-store");
    return { data_base64: restored.bytes.toString("base64"), byte_size: Number(restored.byteSize) };
  }

  @core.TypedRoute.Post(":id/purge/prepare")
  public preparePurge(
    @Headers("authorization") authorization: string | undefined,
    @core.TypedParam("id") id: S.Uuid,
    @core.TypedBody() input: Omit<S.PurgePrepare, "object_id">,
  ): Promise<{ approval_id: string; expires_at: string }> {
    K.keys(input, ["operation_id", "executor_user_id", "reason", "expires_at"]);
    return S.preparePurge(authorization, { ...input, object_id: id }, this.adapters(), configuredRetentionInventory());
  }

  @core.TypedRoute.Post(":id/purge/execute")
  public executePurge(
    @Headers("authorization") authorization: string | undefined,
    @core.TypedParam("id") id: S.Uuid,
    @core.TypedBody() input: S.PurgeExecute,
  ): Promise<{ purged_at: string }> {
    K.keys(input, ["operation_id", "approval_id"]);
    return S.executePurge(authorization, input, this.adapters(), configuredRetentionInventory(), id);
  }

  private adapters() {
    return configuredStorageAdapters();
  }
}
