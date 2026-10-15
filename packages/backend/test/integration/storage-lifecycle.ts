import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import typia from "typia";
import api from "@knittinglog/api";

import { MyBackend } from "../../src/MyBackend";
import { MyGlobal } from "../../src/MyGlobal";
import { MyModule } from "../../src/MyModule";
import { KnittingLogContext as K } from "../../src/providers/common/KnittingLogContext";
import { StoredObjectProvider as S } from "../../src/providers/storage/StoredObjectProvider";
import { StoredObjectController } from "../../src/controllers/storage/v1/StoredObjectController";
import { configureRetentionInventory, RetentionInventory, verifyStoredObject } from "../../src/providers/storage/StorageConfiguration";
import { configureLocalFilesystemStorage } from "../../src/providers/storage/StorageBootstrap";
import { StoragePort } from "../../src/providers/storage/StoragePort";
import { ProjectProvider } from "../../src/providers/projects/ProjectProvider";
import { assertIsolatedPostgresUrl } from "../helpers/IsolatedPostgres";
import { KnittingLogApi as Api } from "../helpers/KnittingLogApi";

let stage = "격리 대상 확인";

async function main(): Promise<void> {
  assert.equal(process.env.MODE, "local");
  assert.equal(process.env.KNITTINGLOG_TEST_ALLOW_WRITES, "1");
  assert.equal(process.env.KNITTINGLOG_TEST_POSTGRES_PORT, "50801");
  assertIsolatedPostgresUrl(process.env.POSTGRES_URL ?? "", "50801");
  const expected = process.env.KNITTINGLOG_TEST_DATA_DIRECTORY;
  assert.ok(expected && /^\/private\/tmp\/knittinglog-tdd\.[^/]+\/postgres$/.test(expected));

  let app: INestApplication | undefined;
  let root: string | undefined;
  let purgeFunction = false;
  let purgeTrigger = false;
  try {
    const [identity] = await MyGlobal.prisma.$queryRaw<{ directory: string; port: number; address: string; database: string }[]>`
      SELECT current_setting('data_directory') AS directory, inet_server_port() AS port,
        host(inet_server_addr()) AS address, current_database() AS database`;
    assert.deepEqual(identity, { directory: expected, port: 50801, address: "127.0.0.1", database: "knittinglog_tdd" });

    app = await NestFactory.create(MyModule, { logger: false });
    MyBackend.configure(app);
    await app.listen(0, "127.0.0.1");
    const connection: Api.Connection = { host: await app.getUrl() };
    const owner = await Api.register(connection);
    const approver = await Api.register(connection);
    const executor = await Api.register(connection);
    const outsider = await Api.register(connection);
    process.env.KNITTINGLOG_MAINTENANCE_APPROVER_USER_IDS = approver.session.user.id;
    process.env.KNITTINGLOG_MAINTENANCE_EXECUTOR_USER_IDS = executor.session.user.id;

    root = await fs.mkdtemp(path.join(os.tmpdir(), "knittinglog-storage-integration-"));
    const localAdapter = await configureLocalFilesystemStorage({ mode: "local", storageCode: "isolated-local", absoluteRoot: root });
    const local = localAdapter.storage;
    let failRemoval = true;
    const retryingRemoval: StoragePort = {
      put: (source, maximumBytes) => local.put(source, maximumBytes),
      getVerified: (key, expectedBytes, maximumBytes) => local.getVerified(key, expectedBytes, maximumBytes),
      restoreVerified: (key, source, expectedBytes, maximumBytes) => local.restoreVerified(key, source, expectedBytes, maximumBytes),
      removeVerified: async (key, expectedBytes) => {
        if (failRemoval) { failRemoval = false; throw new Error("injected external removal failure"); }
        await local.removeVerified(key, expectedBytes);
      },
    };
    const adapter: S.Adapter = localAdapter;
    const adapters = new Map<string, StoragePort>([[adapter.storageCode, retryingRemoval]]);
    const inventory: RetentionInventory = {
      async inspect(object) {
        const now = new Date();
        return { ...object, scannedAt: now, coversThrough: new Date(now.getTime() + 60_000), retainUntil: new Date(now.getTime() - 1000) };
      },
    };
    configureRetentionInventory(inventory);

    stage = "인증 업로드·소유권·실제 바이트 복원";
    const controller = new StoredObjectController();
    const executePurge = (authorization: string, id: S.Uuid, input: S.PurgeExecute) => S.executePurge(authorization, input, adapters, inventory, id);
    const restoreBackup = (authorization: string, id: string, source: () => AsyncIterable<Uint8Array>, maximumBytes: number, operationId = randomUUID()) =>
      S.restoreFromBackup(authorization, id, source, adapters, maximumBytes, operationId);
    const originalBytes = Buffer.alloc(200 * 1024, 0x2a);
    stage = "필수 정책 동의 전 업로드 차단";
    await MyGlobal.prisma.policy_consents.updateMany({
      where: { user_id: owner.session.user.id, policy_document_id: { in: owner.input.policy_document_ids }, deleted_at: null },
      data: { deleted_at: new Date(), updated_at: new Date(), updated_by: owner.session.user.id },
    });
    await Api.error(owner.connection, "POST", "/storage/objects", 403, { data_base64: Buffer.from("must not be stored").toString("base64") });
    assert.deepEqual(await fs.readdir(root), []);
    await Api.request(owner.connection, "POST", "/users/me/policy-consents", 200, { policy_document_ids: owner.input.policy_document_ids });
    stage = "업로드 고아 파일의 영속 추적";
    let orphanKey = "";
    let orphanTrigger = false;
    let orphanFunction = false;
    try {
      await MyGlobal.prisma.$executeRawUnsafe(`CREATE FUNCTION accounts.qa_fail_stored_object_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected stored object insert failure'; END $$`);
      orphanFunction = true;
      await MyGlobal.prisma.$executeRawUnsafe(`CREATE TRIGGER qa_fail_stored_object_insert BEFORE INSERT ON accounts.stored_objects FOR EACH ROW EXECUTE FUNCTION accounts.qa_fail_stored_object_insert()`);
      orphanTrigger = true;
      const orphanStorage: StoragePort = {
        put: async (source, maximumBytes) => { const object = await local.put(source, maximumBytes); orphanKey = object.objectKey; return object; },
        getVerified: (key, expectedBytes, maximumBytes) => local.getVerified(key, expectedBytes, maximumBytes),
        restoreVerified: (key, source, expectedBytes, maximumBytes) => local.restoreVerified(key, source, expectedBytes, maximumBytes),
        removeVerified: async () => { throw new Error("injected orphan cleanup failure"); },
      };
      const orphanSource = async function* (): AsyncGenerator<Uint8Array> { yield Buffer.from("orphan bytes"); };
      await assert.rejects(S.upload(`Bearer ${owner.session.access_token}`, { storageCode: adapter.storageCode, storage: orphanStorage }, orphanSource(), 1024), /orphan cleanup failed and was recorded/);
      const receipt = await MyGlobal.prisma.command_receipts.findFirstOrThrow({ where: { command_type: "storage_upload_orphan" } });
      assert.equal((receipt.result as { value: { object_key: string; cleanup_pending: boolean } }).value.object_key, orphanKey);
      assert.equal((receipt.result as { value: { cleanup_pending: boolean } }).value.cleanup_pending, true);
      await local.removeVerified(orphanKey, { sha256: createHash("sha256").update("orphan bytes").digest("hex"), byteSize: BigInt(Buffer.byteLength("orphan bytes")) });
    } finally {
      if (orphanTrigger) await MyGlobal.prisma.$executeRawUnsafe("DROP TRIGGER qa_fail_stored_object_insert ON accounts.stored_objects");
      if (orphanFunction) await MyGlobal.prisma.$executeRawUnsafe("DROP FUNCTION accounts.qa_fail_stored_object_insert()");
    }
    const uploadBody = JSON.stringify({ data_base64: originalBytes.toString("base64") });
    assert.ok(Buffer.byteLength(uploadBody) > 100 * 1024);
    const objectEndpoint = `${connection.host}/api/v1/storage/objects`;
    const uploadResponse = await fetch(objectEndpoint, {
      method: "POST", headers: { Authorization: `Bearer ${owner.session.access_token}`, "Content-Type": "application/json" }, body: uploadBody,
    });
    assert.equal(uploadResponse.status, 201);
    const uploadResult = await uploadResponse.json() as { id: string };
    const uploaded = await MyGlobal.prisma.stored_objects.findUniqueOrThrow({ where: { id: uploadResult.id } });
    const objectBytes = { objectKey: uploaded.object_key, sha256: uploaded.sha256, byteSize: uploaded.byte_size };
    assert.equal(uploaded.owner_user_id, owner.session.user.id);
    await local.removeVerified(objectBytes.objectKey, objectBytes);
    const backupSource = async function* () { yield originalBytes; };
    await assert.rejects(restoreBackup(`Bearer ${outsider.session.access_token}`, uploaded.id, backupSource, 10 * 1024 * 1024));
    await assert.rejects(restoreBackup(`Bearer ${executor.session.access_token}`, uploaded.id, async function* () { yield Buffer.from("tampered"); }, 10 * 1024 * 1024));
    const restoredOperation = randomUUID();
    await restoreBackup(`Bearer ${executor.session.access_token}`, uploaded.id, backupSource, 10 * 1024 * 1024, restoredOperation);
    await restoreBackup(`Bearer ${executor.session.access_token}`, uploaded.id, backupSource, 10 * 1024 * 1024, restoredOperation);
    const downloadResponse = await fetch(`${objectEndpoint}/${uploaded.id}`, { headers: { Authorization: `Bearer ${owner.session.access_token}` } });
    assert.equal(downloadResponse.status, 200);
    const download = await downloadResponse.json() as { data_base64: string; byte_size: number };
    assert.equal(Buffer.from(download.data_base64, "base64").compare(originalBytes), 0);
    assert.equal(download.byte_size, originalBytes.byteLength);
    const deniedDownload = await fetch(`${objectEndpoint}/${uploaded.id}`, { headers: { Authorization: `Bearer ${outsider.session.access_token}` } });
    assert.equal(deniedDownload.status, 404);
    const tooLarge = await fetch(objectEndpoint, {
      method: "POST", headers: { Authorization: `Bearer ${owner.session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ data_base64: Buffer.alloc(10 * 1024 * 1024 + 1).toString("base64") }),
    });
    assert.equal(tooLarge.status, 413);
    const otherRouteLimit = await fetch(`${connection.host}/api/v1/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login_id: "x".repeat(120 * 1024), password: "unused" }),
    });
    assert.equal(otherRouteLimit.status, 413);
    await Api.request(owner.connection, "PATCH", "/users/me", 200, { profile_photo_object_id: uploaded.id, visibility: "public" });
    await Api.error(outsider.connection, "PATCH", "/users/me", 404, { profile_photo_object_id: uploaded.id });
    const refBeforeRestore = (await MyGlobal.prisma.users.findUniqueOrThrow({ where: { id: owner.session.user.id } })).profile_photo_object_id;
    const restoredResponse = await fetch(`${objectEndpoint}/${uploaded.id}`, { headers: { Authorization: `Bearer ${owner.session.access_token}` } });
    assert.equal(restoredResponse.status, 200);
    const restored = await restoredResponse.json() as { data_base64: string; byte_size: number };
    assert.equal(Buffer.from(restored.data_base64, "base64").compare(originalBytes), 0);
    assert.equal(restored.byte_size, Number(uploaded.byte_size));
    assert.equal((await MyGlobal.prisma.users.findUniqueOrThrow({ where: { id: owner.session.user.id } })).profile_photo_object_id, refBeforeRestore);
    const publicProfile = await Api.request(outsider.connection, "GET", `/users/${owner.session.user.id}`, 200) as Record<string, unknown>;
    assert.equal(publicProfile.profile_photo_object_id, uploaded.id);
    assert.equal(Object.hasOwn(publicProfile, "bytes"), false);
    assert.equal(Object.hasOwn(publicProfile, "url"), false);
    const denyAttachedPhoto = () => S.preparePurge(`Bearer ${approver.session.access_token}`, {
      operation_id: typia.assert<S.Uuid>(randomUUID()), object_id: typia.assert<S.Uuid>(uploaded.id),
      executor_user_id: typia.assert<S.Uuid>(executor.session.user.id), reason: "프로필 참조 보존", expires_at: new Date(Date.now() + 3600_000).toISOString(),
    }, adapters, inventory);
    await assert.rejects(denyAttachedPhoto());
    await Api.request(owner.connection, "PATCH", "/users/me", 200, { profile_photo_object_id: null });
    await assert.rejects(S.preparePurge(`Bearer ${approver.session.access_token}`, {
      operation_id: typia.assert<S.Uuid>(randomUUID()), object_id: typia.assert<S.Uuid>(uploaded.id),
      executor_user_id: typia.assert<S.Uuid>(executor.session.user.id), reason: "백업 증거 기본 거부", expires_at: new Date(Date.now() + 3600_000).toISOString(),
    }, adapters));
    assert.equal((await MyGlobal.prisma.stored_objects.findUniqueOrThrow({ where: { id: uploaded.id } })).deleted_at, null);

    stage = "현재·복구 가능 프로젝트 참조 거부";
    const project = await Api.project(owner);
    await K.transaction(async (tx) => {
      await tx.projects.update({ where: { id: project.id }, data: { cover_photo_object_id: uploaded.id, ...K.changed(owner.session.user.id) } });
    });
    const attempt = () => controller.preparePurge(`Bearer ${approver.session.access_token}`, typia.assert<S.Uuid>(uploaded.id), {
      operation_id: typia.assert<S.Uuid>(randomUUID()),
      executor_user_id: typia.assert<S.Uuid>(executor.session.user.id), reason: "참조 보존 검사", expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });
    await assert.rejects(attempt());
    await K.transaction(async (tx) => {
      await tx.projects.update({ where: { id: project.id }, data: { deleted_at: new Date(Date.now() - 29 * 86400_000), deletion_operation_id: randomUUID(), ...K.changed(owner.session.user.id) } });
    });
    await assert.rejects(attempt());
    await K.transaction(async (tx) => {
      await tx.projects.update({ where: { id: project.id }, data: { deleted_at: new Date(Date.now() - 31 * 86400_000), deletion_operation_id: randomUUID(), ...K.changed(owner.session.user.id) } });
    });

    stage = "신규 프로젝트 참조와 제거 준비의 경합";
    const raceResponse = await fetch(objectEndpoint, {
      method: "POST", headers: { Authorization: `Bearer ${owner.session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ data_base64: Buffer.from("race bytes").toString("base64") }),
    });
    assert.equal(raceResponse.status, 201);
    const raceResult = await raceResponse.json() as { id: string };
    const raceObject = await MyGlobal.prisma.stored_objects.findUniqueOrThrow({ where: { id: raceResult.id } });
    const raceProject = await Api.project(owner);
    const racePrepare = () => controller.preparePurge(`Bearer ${approver.session.access_token}`, typia.assert<S.Uuid>(raceObject.id), {
      operation_id: typia.assert<S.Uuid>(randomUUID()),
      executor_user_id: typia.assert<S.Uuid>(executor.session.user.id), reason: "참조 경합 검사", expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });
    const race = await Promise.allSettled([
      ProjectProvider.update(`Bearer ${owner.session.access_token}`, raceProject.id, { cover_photo_object_id: typia.assert<ProjectProvider.Uuid>(raceObject.id) }),
      racePrepare(),
    ]);
    assert.equal(race.filter((result) => result.status === "fulfilled").length, 1, "참조 생성과 제거 준비 중 한 동작만 성공해야 합니다.");
    const raceRow = await MyGlobal.prisma.stored_objects.findUniqueOrThrow({ where: { id: raceObject.id } });
    const raceProjectRow = await MyGlobal.prisma.projects.findUniqueOrThrow({ where: { id: raceProject.id } });
    assert.ok((raceRow.deleted_at && raceProjectRow.cover_photo_object_id === null) ||
      (!raceRow.deleted_at && raceProjectRow.cover_photo_object_id === raceObject.id));

    const staged = await controller.preparePurge(`Bearer ${approver.session.access_token}`, typia.assert<S.Uuid>(uploaded.id), {
      operation_id: typia.assert<S.Uuid>(randomUUID()),
      executor_user_id: typia.assert<S.Uuid>(executor.session.user.id), reason: "만료된 고아 객체 정리", expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });
    await assert.rejects(restoreBackup(`Bearer ${executor.session.access_token}`, uploaded.id, backupSource, 10 * 1024 * 1024));
    assert.equal(Buffer.from(await verifyStoredObject(local, objectBytes, 300 * 1024)).compare(originalBytes), 0);

    stage = "오래된 승인 거부·외부 제거 실패와 동일 키 재시도";
    await K.transaction(async (tx) => {
      await tx.stored_objects.update({ where: { id: uploaded.id }, data: { updated_at: new Date(Date.now() + 10_000) } });
    });
    await assert.rejects(executePurge(`Bearer ${executor.session.access_token}`, typia.assert<S.Uuid>(uploaded.id), {
      operation_id: typia.assert<S.Uuid>(randomUUID()), approval_id: typia.assert<S.Uuid>(staged.approval_id),
    }));
    assert.equal((await MyGlobal.prisma.stored_objects.findUniqueOrThrow({ where: { id: uploaded.id } })).purged_at, null);

    const fresh = await controller.preparePurge(`Bearer ${approver.session.access_token}`, typia.assert<S.Uuid>(uploaded.id), {
      operation_id: typia.assert<S.Uuid>(randomUUID()),
      executor_user_id: typia.assert<S.Uuid>(executor.session.user.id), reason: "재승인 후 제거", expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });
    const conflictId = typia.assert<S.Uuid>(randomUUID());
    await K.transaction(async (tx) => {
      await tx.command_receipts.create({ data: {
        id: conflictId, actor_user_id: executor.session.user.id, command_type: "unrelated_operation",
        request_hash: "0".repeat(64), result: { value: null }, ...K.audit(executor.session.user.id),
      } });
    });
    await assert.rejects(executePurge(`Bearer ${executor.session.access_token}`, typia.assert<S.Uuid>(uploaded.id), {
      operation_id: conflictId, approval_id: typia.assert<S.Uuid>(fresh.approval_id),
    }));
    assert.equal(Buffer.from(await verifyStoredObject(local, objectBytes, 300 * 1024)).compare(originalBytes), 0);

    const executeId = typia.assert<S.Uuid>(randomUUID());
    const execution = { operation_id: executeId, approval_id: typia.assert<S.Uuid>(fresh.approval_id) };
    await assert.rejects(executePurge(`Bearer ${executor.session.access_token}`, typia.assert<S.Uuid>(uploaded.id), execution));
    assert.equal((await MyGlobal.prisma.stored_objects.findUniqueOrThrow({ where: { id: uploaded.id } })).purged_at, null);
    assert.equal((await MyGlobal.prisma.command_receipts.findUniqueOrThrow({ where: { id: executeId } })).command_type, "storage_purge_intent");
    await assert.rejects(K.transaction((tx) => K.command(tx, executor.session.user.id, executeId, "unrelated_operation", {}, async () => null)));
    await assert.rejects(executePurge(`Bearer ${executor.session.access_token}`, typia.assert<S.Uuid>(uploaded.id), { ...execution, operation_id: typia.assert<S.Uuid>(randomUUID()) }));

    stage = "외부 삭제 뒤 DB 롤백과 동일 키 재시도";
    await MyGlobal.prisma.$executeRaw`CREATE FUNCTION accounts.tf_qa_fail_object_purge() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA_STORAGE_PURGE_ROLLBACK'; END; $$`;
    purgeFunction = true;
    await MyGlobal.prisma.$executeRaw`CREATE TRIGGER qa_fail_object_purge BEFORE UPDATE ON accounts.stored_objects
      FOR EACH ROW WHEN (NEW.purged_at IS NOT NULL AND OLD.purged_at IS NULL)
      EXECUTE FUNCTION accounts.tf_qa_fail_object_purge()`;
    purgeTrigger = true;
    await assert.rejects(executePurge(`Bearer ${executor.session.access_token}`, typia.assert<S.Uuid>(uploaded.id), execution));
    assert.equal((await MyGlobal.prisma.stored_objects.findUniqueOrThrow({ where: { id: uploaded.id } })).purged_at, null);
    await MyGlobal.prisma.$executeRaw`DROP TRIGGER qa_fail_object_purge ON accounts.stored_objects`;
    purgeTrigger = false;
    await MyGlobal.prisma.$executeRaw`DROP FUNCTION accounts.tf_qa_fail_object_purge()`;
    purgeFunction = false;

    const purged = await executePurge(`Bearer ${executor.session.access_token}`, typia.assert<S.Uuid>(uploaded.id), execution);
    assert.ok(purged.purged_at);
    assert.equal((await MyGlobal.prisma.stored_objects.findUniqueOrThrow({ where: { id: uploaded.id } })).purged_at?.toISOString(), purged.purged_at);
    assert.deepEqual(await executePurge(`Bearer ${executor.session.access_token}`, typia.assert<S.Uuid>(uploaded.id), execution), purged);
    await assert.rejects(verifyStoredObject(local, objectBytes, 300 * 1024));
    await assert.rejects(restoreBackup(`Bearer ${executor.session.access_token}`, uploaded.id, backupSource, 10 * 1024 * 1024));
    stage = "실제 HTTP 제거 승인과 실행";
    const httpObject = await api.functional.api.v1.storage.objects.upload(owner.connection, { input: { data_base64: Buffer.from("HTTP lifecycle").toString("base64") } });
    assert.equal(Buffer.from((await api.functional.api.v1.storage.objects.read(owner.connection, { id: httpObject.id })).data_base64, "base64").toString(), "HTTP lifecycle");
    const httpApproval = await api.functional.api.v1.storage.objects.purge.prepare.preparePurge(approver.connection, { id: typia.assert<S.Uuid>(httpObject.id), input: {
      operation_id: typia.assert<S.Uuid>(randomUUID()), executor_user_id: typia.assert<S.Uuid>(executor.session.user.id), reason: "격리 HTTP 제거 검사", expires_at: new Date(Date.now() + 60_000).toISOString(),
    } });
    const httpExecution = { operation_id: typia.assert<S.Uuid>(randomUUID()), approval_id: typia.assert<S.Uuid>(httpApproval.approval_id) };
    const httpPurged = await api.functional.api.v1.storage.objects.purge.execute.executePurge(executor.connection, { id: typia.assert<S.Uuid>(httpObject.id), input: httpExecution });
    assert.ok(Number.isFinite(Date.parse(httpPurged.purged_at)));
    assert.deepEqual(await api.functional.api.v1.storage.objects.purge.execute.executePurge(executor.connection, { id: typia.assert<S.Uuid>(httpObject.id), input: httpExecution }), httpPurged);
    stage = "백업 복원과 제거 준비의 경쟁";
    const restoreRaceBytes = Buffer.from("restore and purge race");
    const restoreRaceObject = await api.functional.api.v1.storage.objects.upload(owner.connection, { input: { data_base64: restoreRaceBytes.toString("base64") } });
    const restoreRaceRow = await MyGlobal.prisma.stored_objects.findUniqueOrThrow({ where: { id: restoreRaceObject.id } });
    const restoreRaceMetadata = { objectKey: restoreRaceRow.object_key, sha256: restoreRaceRow.sha256, byteSize: restoreRaceRow.byte_size };
    await local.removeVerified(restoreRaceMetadata.objectKey, restoreRaceMetadata);
    const restoreRaceSource = async function* () { yield restoreRaceBytes; };
    let entered!: () => void;
    let resume!: () => void;
    const startedRestore = new Promise<undefined>((resolve) => { entered = () => resolve(undefined); });
    const resumeRestore = new Promise<undefined>((resolve) => { resume = () => resolve(undefined); });
    const pendingRestoreId = randomUUID();
    const pendingRestore = restoreBackup(`Bearer ${executor.session.access_token}`, restoreRaceRow.id, async function* () {
      entered();
      await resumeRestore;
      yield restoreRaceBytes;
    }, 1024, pendingRestoreId);
    await Promise.race([startedRestore, pendingRestore.then(() => assert.fail("대기 중인 백업 입력을 먼저 확인해야 합니다."))]);
    try {
      await assert.rejects(restoreBackup(`Bearer ${executor.session.access_token}`, restoreRaceRow.id, restoreRaceSource, 1024, pendingRestoreId));
      await assert.rejects(controller.preparePurge(`Bearer ${approver.session.access_token}`, typia.assert<S.Uuid>(restoreRaceRow.id), {
        operation_id: typia.assert<S.Uuid>(randomUUID()), executor_user_id: typia.assert<S.Uuid>(executor.session.user.id),
        reason: "복원 제거 경쟁 검사", expires_at: new Date(Date.now() + 60_000).toISOString(),
      }));
    } finally {
      resume();
      await pendingRestore;
    }
    const raceApproval = await controller.preparePurge(`Bearer ${approver.session.access_token}`, typia.assert<S.Uuid>(restoreRaceRow.id), {
      operation_id: typia.assert<S.Uuid>(randomUUID()), executor_user_id: typia.assert<S.Uuid>(executor.session.user.id),
      reason: "복원 완료 후 제거 검사", expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    await assert.rejects(restoreBackup(`Bearer ${executor.session.access_token}`, restoreRaceRow.id, restoreRaceSource, 1024));
    await controller.executePurge(`Bearer ${executor.session.access_token}`, typia.assert<S.Uuid>(restoreRaceRow.id), {
      operation_id: typia.assert<S.Uuid>(randomUUID()), approval_id: typia.assert<S.Uuid>(raceApproval.approval_id),
    });
    await assert.rejects(verifyStoredObject(local, restoreRaceMetadata, 1024));
    console.log("PASS 격리 저장 객체의 백업 fail-closed·참조/30일 복구 차단·실제 바이트 복원·충돌 거부·외부 제거/DB 롤백 재시도");
  } finally {
    try {
      if (purgeTrigger) await MyGlobal.prisma.$executeRaw`DROP TRIGGER qa_fail_object_purge ON accounts.stored_objects`;
      if (purgeFunction) await MyGlobal.prisma.$executeRaw`DROP FUNCTION accounts.tf_qa_fail_object_purge()`;
      await app?.close();
    }
    finally {
      await MyGlobal.prisma.$disconnect();
      if (root) await fs.rm(root, { recursive: true, force: true });
    }
  }
}

main().catch(() => {
  console.error(`FAIL 격리 저장 객체 수명 주기: ${stage}`);
  process.exitCode = 1;
});
