import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import typia, { type tags } from "typia";

import { storageAdapterForCode, verifyStoredObject } from "../storage/StorageConfiguration";
import { AuthProvider } from "../auth/AuthProvider";
import { KnittingLogContext as K } from "../common/KnittingLogContext";
import { MaintenanceAuthorization as A } from "./MaintenanceAuthorization";

export namespace RecoveryProvider {
  export type Uuid = string & tags.Format<"uuid">;
  export type Kind = "project" | "workspace" | "counter" | "record" | "record_comment" | "post" | "post_comment";
  export interface Target { kind: Kind; id: Uuid }
  export interface Prepare {
    operation_id: Uuid;
    deletion_operation_id: Uuid;
    targets: Target[] & tags.MinItems<1> & tags.MaxItems<100>;
    executor_user_id: Uuid;
    reason: string;
    expires_at: string;
  }
  export interface Approve extends Prepare { approval_id: Uuid; expected_snapshots: Snapshot[] & tags.MaxItems<100> }
  export interface Execute { operation_id: Uuid; approval_id: Uuid }
  export interface ReversePrepare {
    operation_id: Uuid;
    transfer_id: Uuid;
    executor_user_id: Uuid;
    reason: string;
    expires_at: string;
  }
  export interface ReverseApprove extends ReversePrepare { approval_id: Uuid; expected_snapshot: ReverseSnapshot }
  export interface ReverseExecute { operation_id: Uuid; approval_id: Uuid }
  export interface Snapshot {
    kind: Kind;
    id: string;
    updated_at: string;
    owner_user_id: string;
    project_id: string | null;
    workspace_id: string | null;
    parent_id: string | null;
    version: number | null;
    workspace_version: number | null;
    deletion_operation_id: string;
    deleted_at: string;
    photo_object_id: string | null;
    state_hash: string;
  }
  export interface ReverseSnapshot {
    transfer_id: string;
    workspace_id: string;
    from_project_id: string;
    to_project_id: string;
    from_membership_id: string;
    to_membership_id: string;
    workspace_version: number;
    workspace_owner_user_id: string;
    state_hash: string;
  }
  export interface ReverseResult {
    approval_id: string;
    transfer_id: string;
    workspace_id: string;
    project_id: string;
    version: number;
  }
  interface Approval {
    mode: "content" | "reverse_transfer";
    approver_user_id: string;
    executor_user_id: string;
    reason: string;
    expires_at: string;
    deletion_operation_id?: string;
    targets?: Target[];
    snapshots?: Snapshot[];
    transfer_id?: string;
    transfer_snapshot?: ReverseSnapshot;
  }

  const allowed = new Set<Kind>(["project", "workspace", "counter", "record", "record_comment", "post", "post_comment"]);
  const ordered: Record<Kind, number> = { project: 0, workspace: 1, counter: 2, record: 3, post: 3, record_comment: 4, post_comment: 4 };
  const stateHash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

  function keys(value: object, fields: string[]): void { K.keys(value, fields); }
  function validateIds(ids: string[]): void {
    if (!ids.length || ids.length > 100 || ids.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))
      K.fail(400, "INVALID_INPUT", "복구 대상 식별자가 올바르지 않습니다.");
  }
  function validateReason(reason: string): void {
    if (!reason.trim() || reason.length > 1000) K.fail(400, "INVALID_INPUT", "복구 사유를 입력하세요.");
  }
  function validateExpiry(value: string): Date {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()) || date <= new Date() || date.getTime() > Date.now() + 7 * 86400_000)
      K.fail(400, "INVALID_INPUT", "승인 만료 시각은 현재부터 7일 안으로 지정하세요.");
    return date;
  }

  async function snapshot(tx: K.Tx, target: Target, deletionId: string): Promise<Snapshot> {
    if (!allowed.has(target.kind)) K.fail(400, "INVALID_INPUT", "복구할 수 없는 콘텐츠 종류입니다.");
    let row: { updated_at: Date; deleted_at: Date | null; deletion_operation_id: string | null } | null;
    let ownerId: string | undefined;
    let projectId: string | null = null;
    let workspaceId: string | null = null;
    let parentId: string | null = null;
    let version: number | null = null;
    let workspaceVersion: number | null = null;
    let photoId: string | null = null;
    switch (target.kind) {
      case "project": {
        const project = await tx.projects.findUnique({ where: { id: target.id } });
        row = project;
        ownerId = project?.owner_user_id;
        projectId = project?.id ?? null;
        photoId = project?.cover_photo_object_id ?? null;
        break;
      }
      case "workspace": {
        const workspace = await tx.project_workspaces.findUnique({ where: { id: target.id } });
        row = workspace;
        ownerId = workspace?.owner_user_id;
        projectId = workspace?.project_id ?? null;
        workspaceId = workspace?.id ?? null;
        version = workspace?.version ?? null;
        break;
      }
      case "counter": {
        const counter = await tx.project_counters.findUnique({ where: { id: target.id } });
        row = counter;
        workspaceId = counter?.workspace_id ?? null;
        version = counter?.version ?? null;
        break;
      }
      case "record": {
        const record = await tx.project_records.findUnique({ where: { id: target.id } });
        row = record;
        workspaceId = record?.workspace_id ?? null;
        break;
      }
      case "record_comment": {
        const comment = await tx.record_comments.findUnique({ where: { id: target.id } });
        row = comment;
        parentId = comment?.record_id ?? null;
        break;
      }
      case "post": {
        const post = await tx.posts.findUnique({ where: { id: target.id } });
        row = post;
        ownerId = post?.author_id;
        parentId = post?.id ?? null;
        break;
      }
      case "post_comment": {
        const comment = await tx.post_comments.findUnique({ where: { id: target.id } });
        row = comment;
        parentId = comment?.post_id ?? null;
        break;
      }
    }
    if (!row) K.fail(404, "NOT_FOUND", "복구 대상을 찾을 수 없습니다.");
    if (!ownerId) {
      if (workspaceId) ownerId = (await tx.project_workspaces.findUnique({ where: { id: workspaceId } }))?.owner_user_id;
      else if (parentId && target.kind === "record_comment") {
        const rec = await tx.project_records.findUnique({ where: { id: parentId } });
        workspaceId = rec?.workspace_id ?? null;
        const work = rec ? await tx.project_workspaces.findUnique({ where: { id: rec.workspace_id } }) : null;
        ownerId = work?.owner_user_id;
        projectId = work?.project_id ?? null;
        version = work?.version ?? null;
        workspaceVersion = work?.version ?? null;
      } else if (parentId && target.kind === "post_comment") ownerId = (await tx.posts.findUnique({ where: { id: parentId } }))?.author_id;
    }
    if (workspaceId && target.kind !== "workspace") {
      const work = await tx.project_workspaces.findUnique({ where: { id: workspaceId } });
      projectId = work?.project_id ?? null;
      workspaceVersion = work?.version ?? null;
    }
    if (!ownerId || row.deleted_at === null || row.deletion_operation_id !== deletionId || row.deleted_at.getTime() > Date.now() || Date.now() - row.deleted_at.getTime() > 30 * 86400_000)
      K.fail(409, "RECOVERY_STATE", "삭제 작업·삭제 시각 또는 복구 기간을 확인할 수 없습니다.");
    return {
      kind: target.kind, id: target.id, updated_at: row.updated_at.toISOString(), owner_user_id: ownerId,
      project_id: projectId, workspace_id: workspaceId, parent_id: parentId, version,
      workspace_version: workspaceVersion,
      deletion_operation_id: deletionId, deleted_at: row.deleted_at.toISOString(), photo_object_id: photoId,
      state_hash: stateHash(row),
    };
  }

  async function plan(tx: K.Tx, input: Prepare): Promise<Snapshot[]> {
    validateIds(input.targets.map((entry) => entry.id));
    if (input.targets.some((entry) => !allowed.has(entry.kind)) || new Set(input.targets.map((entry) => `${entry.kind}:${entry.id}`)).size !== input.targets.length)
      K.fail(400, "INVALID_INPUT", "복구 대상이 중복되었거나 허용되지 않습니다.");
    const result: Snapshot[] = [];
    for (const target of [...input.targets].sort((a, b) => ordered[a.kind] - ordered[b.kind] || a.id.localeCompare(b.id))) result.push(await snapshot(tx, target, input.deletion_operation_id));
    const ids = new Set(input.targets.map((entry) => `${entry.kind}:${entry.id}`));
    for (const entry of result) {
      const ancestry: unknown[] = [entry.state_hash];
      if (entry.workspace_id) {
        const work = await tx.project_workspaces.findUnique({ where: { id: entry.workspace_id } });
        if (!work || (work.deleted_at && !ids.has(`workspace:${work.id}`))) K.fail(409, "RECOVERY_PARENT", "작업 공간의 현재 상태 또는 복구 승인이 필요합니다.");
        ancestry.push(work);
      }
      if (entry.kind === "record_comment") ancestry.push(await tx.project_records.findUnique({ where: { id: entry.parent_id! } }));
      if (entry.kind === "post_comment") ancestry.push(await tx.posts.findUnique({ where: { id: entry.parent_id! } }));
      const parent: Target | null = entry.kind === "workspace" ? { kind: "project", id: entry.project_id as Uuid }
        : entry.kind === "counter" || entry.kind === "record" ? { kind: "workspace", id: entry.workspace_id as Uuid }
          : entry.kind === "record_comment" ? { kind: "record", id: entry.parent_id as Uuid }
            : entry.kind === "post_comment" ? { kind: "post", id: entry.parent_id as Uuid } : null;
      if (parent) {
        const live = parent.kind === "project" ? await tx.projects.findFirst({ where: { id: parent.id, deleted_at: null } })
          : parent.kind === "workspace" ? await tx.project_workspaces.findFirst({ where: { id: parent.id, deleted_at: null } })
            : parent.kind === "record" ? await tx.project_records.findFirst({ where: { id: parent.id, deleted_at: null } })
              : await tx.posts.findFirst({ where: { id: parent.id, deleted_at: null } });
        if (!live && !ids.has(`${parent.kind}:${parent.id}`)) K.fail(409, "RECOVERY_PARENT", "현재 부모 또는 부모 복구 승인이 필요합니다.");
      }
      if (entry.photo_object_id) {
        const object = await tx.stored_objects.findFirst({ where: { id: entry.photo_object_id, deleted_at: null, purged_at: null } });
        if (!object) K.fail(409, "RECOVERY_PHOTO", "복구할 사진 객체가 삭제되었거나 제거되었습니다.");
        try {
          await verifyStoredObject(storageAdapterForCode(object!.storage_code), { objectKey: object!.object_key, sha256: object!.sha256, byteSize: object!.byte_size }, 10 * 1024 * 1024);
        } catch {
          K.fail(503, "RECOVERY_PHOTO_UNAVAILABLE", "저장 사진의 무결성을 검증할 수 없습니다.");
        }
      }
      const owner = await tx.users.findFirst({ where: { id: entry.owner_user_id, deleted_at: null } });
      if (!owner) K.fail(409, "RECOVERY_OWNER", "현재 소유자를 확인할 수 없습니다.");
      ancestry.push({ id: owner.id, updated_at: owner.updated_at });
      const projectId = entry.project_id ?? (entry.workspace_id ? (await tx.project_workspaces.findUnique({ where: { id: entry.workspace_id } }))?.project_id : null);
      if (projectId) {
        const project = await tx.projects.findUnique({ where: { id: projectId } });
        if (!project || (project.deleted_at && !ids.has(`project:${projectId}`)) || project.terminated_at) K.fail(409, "RECOVERY_PARENT", "현재 프로젝트를 복구할 수 없습니다.");
        const membership = await tx.project_memberships.findFirst({ where: { project_id: projectId, user_id: entry.owner_user_id, left_at: null, deleted_at: null } });
        if (!membership)
          K.fail(409, "RECOVERY_MEMBERSHIP", "현재 소유자의 유효한 프로젝트 참여가 필요합니다.");
        ancestry.push(project, membership);
      }
      entry.state_hash = stateHash(ancestry);
    }
    return result;
  }

  async function prepareContent(tx: K.Tx, authorization: string | undefined, input: Prepare): Promise<Snapshot[]> {
    keys(input, ["operation_id", "deletion_operation_id", "targets", "executor_user_id", "reason", "expires_at"]);
    await AuthProvider.actor(authorization, tx);
    validateReason(input.reason); validateExpiry(input.expires_at);
    const approver = await A.approver(tx, authorization);
    if (approver === input.executor_user_id || !A.isExecutor(input.executor_user_id)) K.fail(403, "FORBIDDEN", "별도로 지정한 실행자가 필요합니다.");
    return plan(tx, input);
  }

  export async function prepare(authorization: string | undefined, input: Prepare): Promise<Snapshot[]> {
    return K.transaction(async (tx) => prepareContent(tx, authorization, input));
  }

  export async function approve(authorization: string | undefined, input: Approve): Promise<{ approval_id: string; expires_at: string }> {
    keys(input, ["operation_id", "approval_id", "deletion_operation_id", "targets", "executor_user_id", "reason", "expires_at", "expected_snapshots"]);
    return K.transaction(async (tx) => {
      const actor = await A.approver(tx, authorization);
      const snapshots = await prepareContent(tx, authorization, {
        operation_id: input.operation_id, deletion_operation_id: input.deletion_operation_id,
        targets: input.targets, executor_user_id: input.executor_user_id,
        reason: input.reason, expires_at: input.expires_at,
      });
      if (!isDeepStrictEqual(snapshots, input.expected_snapshots)) K.fail(409, "APPROVAL_STALE", "검토 후 복구 대상 상태가 변경되었습니다.");
      const approval: Approval = { mode: "content", approver_user_id: actor, executor_user_id: input.executor_user_id, reason: input.reason.trim(), expires_at: validateExpiry(input.expires_at).toISOString(), deletion_operation_id: input.deletion_operation_id, targets: input.targets, snapshots };
      await K.command(tx, actor, input.approval_id, "recovery_approval", approval, async () => ({ approval_id: input.approval_id, approval }));
      return { approval_id: input.approval_id, expires_at: approval.expires_at };
    });
  }

  async function receipt(tx: K.Tx, id: string, kind: string): Promise<Approval> {
    const row = await tx.command_receipts.findUnique({ where: { id } });
    if (!row || row.deleted_at || row.command_type !== kind) K.fail(404, "APPROVAL_NOT_FOUND", "승인 기록을 찾을 수 없습니다.");
    if (!typia.is<{ value: { approval: Approval } }>(row.result)) K.fail(409, "APPROVAL_INVALID", "승인 기록의 형식을 확인할 수 없습니다.");
    const approval = row.result.value.approval;
    if (row.actor_user_id !== approval.approver_user_id || !A.isApprover(approval.approver_user_id) ||
        !await tx.users.findFirst({ where: { id: approval.approver_user_id, deleted_at: null } }))
      K.fail(403, "APPROVAL_REVOKED", "현재 유효한 승인자의 승인이 필요합니다.");
    if (!Number.isFinite(Date.parse(approval.expires_at)) || Date.parse(approval.expires_at) <= Date.now())
      K.fail(403, "APPROVAL_EXPIRED", "승인 기간이 만료되었습니다.");
    return approval;
  }

  async function alreadyExecuted(tx: K.Tx, approvalId: string): Promise<boolean> {
    return await tx.command_receipts.count({ where: {
      command_type: { in: ["recovery_execute", "reverse_transfer_execute"] },
      result: { path: ["value", "approval_id"], equals: approvalId },
    } }) > 0;
  }

  async function restore(tx: K.Tx, actor: string, approval: Approval): Promise<void> {
    if (approval.mode !== "content" || !approval.targets || !approval.snapshots || !approval.deletion_operation_id) K.fail(409, "APPROVAL_INVALID", "복구 승인 내용이 올바르지 않습니다.");
    const current = await plan(tx, { operation_id: "" as Uuid, deletion_operation_id: approval.deletion_operation_id, targets: approval.targets, executor_user_id: approval.executor_user_id as Uuid, reason: approval.reason, expires_at: approval.expires_at });
    if (!isDeepStrictEqual(current, approval.snapshots)) K.fail(409, "APPROVAL_STALE", "승인 뒤 복구 대상 상태가 변경되었습니다.");
    for (const target of approval.targets.slice().sort((a, b) => ordered[a.kind] - ordered[b.kind] || a.id.localeCompare(b.id))) {
      const where = { id: target.id };
      const data = { deleted_at: null, deletion_operation_id: null, ...K.changed(actor) };
      switch (target.kind) {
        case "project": await tx.projects.update({ where, data }); break;
        case "workspace": await tx.project_workspaces.update({ where, data }); break;
        case "counter": await tx.project_counters.update({ where, data: { ...data, version: { increment: 1 } } }); break;
        case "record": await tx.project_records.update({ where, data }); break;
        case "record_comment": await tx.record_comments.update({ where, data }); break;
        case "post": await tx.posts.update({ where, data }); break;
        case "post_comment": await tx.post_comments.update({ where, data }); break;
      }
    }
    for (const workspaceId of new Set(current.map((entry) => entry.workspace_id).filter((id): id is string => id !== null)))
      await K.bump(tx, workspaceId, actor);
  }

  export async function execute(authorization: string | undefined, input: Execute): Promise<{ restored: number }> {
    keys(input, ["operation_id", "approval_id"]);
    return K.transaction(async (tx) => {
      const actor = await A.executor(tx, authorization);
      const approval = await receipt(tx, input.approval_id, "recovery_approval") as Approval;
      if (!approval || approval.mode !== "content" || approval.executor_user_id !== actor || new Date(approval.expires_at) <= new Date()) K.fail(403, "APPROVAL_EXPIRED", "유효한 복구 승인과 지정 실행자가 필요합니다.");
      const result = await K.command(tx, actor, input.operation_id, "recovery_execute", { approval_id: input.approval_id }, async () => {
        if (await alreadyExecuted(tx, input.approval_id)) K.fail(409, "APPROVAL_USED", "이미 실행한 승인입니다.");
        await restore(tx, actor, approval);
        return { approval_id: input.approval_id, restored: approval.targets!.length };
      });
      return { restored: result.restored };
    });
  }

  async function reverseSnapshot(tx: K.Tx, transferId: string): Promise<ReverseSnapshot> {
    const transfer = await tx.workspace_transfers.findUnique({ where: { id: transferId } });
    const workspace = transfer && await tx.project_workspaces.findUnique({ where: { id: transfer.workspace_id } });
    if (!transfer || transfer.deleted_at || !workspace || workspace.deleted_at) K.fail(404, "NOT_FOUND", "이관 이력을 찾을 수 없습니다.");
    if (workspace.project_id !== transfer.to_project_id || workspace.version !== transfer.workspace_version)
      K.fail(409, "REVERSE_CONFLICT", "현재 작업 공간이 원 이관 결과와 다릅니다.");
    const source = await tx.projects.findFirst({ where: { id: transfer.from_project_id, deleted_at: null, terminated_at: null } });
    const destination = await tx.projects.findFirst({ where: { id: transfer.to_project_id, deleted_at: null, terminated_at: null } });
    const owner = await tx.users.findFirst({ where: { id: workspace.owner_user_id, deleted_at: null } });
    const from = await tx.project_memberships.findFirst({ where: { id: transfer.from_membership_id, project_id: transfer.from_project_id, user_id: workspace.owner_user_id, deleted_at: null, left_at: { not: null } } });
    const to = await tx.project_memberships.findFirst({ where: { id: transfer.to_membership_id, project_id: transfer.to_project_id, user_id: workspace.owner_user_id, left_at: null, deleted_at: null } });
    const sourceMembers = await tx.project_memberships.findMany({ where: { project_id: transfer.from_project_id, left_at: null, deleted_at: null, user: { deleted_at: null } }, orderBy: { id: "asc" } });
    const destinationMembers = await tx.project_memberships.findMany({ where: { project_id: transfer.to_project_id, left_at: null, deleted_at: null, user: { deleted_at: null } }, orderBy: { id: "asc" } });
    const sourceOwner = source && await tx.users.findFirst({ where: { id: source.owner_user_id, deleted_at: null } });
    if (!source || !destination || !owner || !from || !to || !sourceOwner ||
        sourceMembers.length >= 20 || sourceMembers.some((member) => member.user_id === owner.id) ||
        !sourceMembers.some((member) => member.user_id === source.owner_user_id) ||
        destination.owner_user_id !== owner.id || destinationMembers.length !== 1 || destinationMembers[0]?.id !== to.id ||
        await K.blocked(tx, owner.id, source.owner_user_id) ||
        await tx.project_workspaces.findFirst({ where: { id: { not: workspace.id }, project_id: source.id, owner_user_id: owner.id } }))
      K.fail(409, "REVERSE_CONFLICT", "현재 프로젝트 권한·참여 인원·방장 또는 소유 관계가 역이관과 충돌합니다.");
    return { transfer_id: transfer.id, workspace_id: transfer.workspace_id, from_project_id: transfer.from_project_id, to_project_id: transfer.to_project_id, from_membership_id: transfer.from_membership_id, to_membership_id: transfer.to_membership_id, workspace_version: transfer.workspace_version, workspace_owner_user_id: workspace.owner_user_id, state_hash: stateHash([transfer, workspace, source, destination, from, to, sourceMembers, destinationMembers, owner.updated_at, sourceOwner.updated_at]) };
  }

  export async function prepareReverse(authorization: string | undefined, input: ReversePrepare): Promise<ReverseSnapshot> {
    keys(input, ["operation_id", "transfer_id", "executor_user_id", "reason", "expires_at"]);
    return K.transaction(async (tx) => {
      const approver = await A.approver(tx, authorization); validateReason(input.reason); validateExpiry(input.expires_at);
      if (approver === input.executor_user_id || !A.isExecutor(input.executor_user_id)) K.fail(403, "FORBIDDEN", "별도로 지정한 실행자가 필요합니다.");
      return reverseSnapshot(tx, input.transfer_id);
    });
  }

  export async function approveReverse(authorization: string | undefined, input: ReverseApprove): Promise<{ approval_id: string; expires_at: string }> {
    keys(input, ["operation_id", "approval_id", "transfer_id", "executor_user_id", "reason", "expires_at", "expected_snapshot"]);
    return K.transaction(async (tx) => {
      const actor = await A.approver(tx, authorization); validateReason(input.reason);
      if (actor === input.executor_user_id || !A.isExecutor(input.executor_user_id)) K.fail(403, "FORBIDDEN", "별도로 지정한 실행자가 필요합니다.");
      const expires = validateExpiry(input.expires_at).toISOString();
      const current = await reverseSnapshot(tx, input.transfer_id);
      if (!isDeepStrictEqual(current, input.expected_snapshot)) K.fail(409, "APPROVAL_STALE", "검토 후 역이관 대상 상태가 변경되었습니다.");
      const approval: Approval = { mode: "reverse_transfer", approver_user_id: actor, executor_user_id: input.executor_user_id, reason: input.reason.trim(), expires_at: expires, transfer_id: input.transfer_id, transfer_snapshot: current };
      await K.command(tx, actor, input.approval_id, "reverse_transfer_approval", approval, async () => ({ approval_id: input.approval_id, approval }));
      return { approval_id: input.approval_id, expires_at: expires };
    });
  }

  export async function executeReverse(authorization: string | undefined, input: ReverseExecute): Promise<ReverseResult> {
    keys(input, ["operation_id", "approval_id"]);
    return K.transaction(async (tx) => {
      const actor = await A.executor(tx, authorization);
      const approval = await receipt(tx, input.approval_id, "reverse_transfer_approval") as Approval;
      if (!approval || approval.mode !== "reverse_transfer" || approval.executor_user_id !== actor || new Date(approval.expires_at) <= new Date()) K.fail(403, "APPROVAL_EXPIRED", "유효한 역이관 승인과 지정 실행자가 필요합니다.");
      return K.command(tx, actor, input.operation_id, "reverse_transfer_execute", { approval_id: input.approval_id }, async () => {
        if (await alreadyExecuted(tx, input.approval_id)) K.fail(409, "APPROVAL_USED", "이미 실행한 승인입니다.");
        const current = await reverseSnapshot(tx, approval.transfer_id!);
        if (!isDeepStrictEqual(current, approval.transfer_snapshot)) K.fail(409, "REVERSE_CONFLICT", "원 이관 뒤 작업 공간 또는 version이 변경되었습니다.");
        const transfer = await tx.workspace_transfers.findUniqueOrThrow({ where: { id: approval.transfer_id! } });
        const workspace = await tx.project_workspaces.findUniqueOrThrow({ where: { id: transfer.workspace_id } });
        const source = await tx.projects.findFirst({ where: { id: transfer.from_project_id, deleted_at: null, terminated_at: null } });
        const destination = await tx.projects.findFirst({ where: { id: transfer.to_project_id, deleted_at: null, terminated_at: null } });
        const owner = await tx.users.findFirst({ where: { id: workspace.owner_user_id, deleted_at: null } });
        const currentMembership = await tx.project_memberships.findFirst({ where: { id: transfer.to_membership_id, project_id: transfer.to_project_id, user_id: workspace.owner_user_id, left_at: null, deleted_at: null } });
        const sourceOwner = source && await tx.users.findFirst({ where: { id: source.owner_user_id, deleted_at: null } });
        const sourceOwnerMembership = source && await tx.project_memberships.findFirst({ where: { project_id: source.id, user_id: source.owner_user_id, left_at: null, deleted_at: null } });
        const existingSourceMembership = await tx.project_memberships.findFirst({ where: { project_id: transfer.from_project_id, user_id: workspace.owner_user_id, left_at: null, deleted_at: null } });
        if (!source || !destination || !owner || !sourceOwner || !sourceOwnerMembership || !currentMembership || existingSourceMembership || await tx.project_workspaces.findFirst({ where: { id: { not: workspace.id }, project_id: transfer.from_project_id, owner_user_id: workspace.owner_user_id } })) K.fail(409, "REVERSE_CONFLICT", "현재 프로젝트·소유자·참여 또는 고유 조건이 역이관과 충돌합니다.");
        await tx.project_memberships.update({ where: { id: currentMembership.id }, data: { left_at: new Date(), ...K.changed(actor) } });
        await tx.projects.update({ where: { id: destination.id }, data: { terminated_at: new Date(), ...K.changed(actor) } });
        const newMembership = await tx.project_memberships.create({ data: { project_id: transfer.from_project_id, user_id: workspace.owner_user_id, ...K.audit(actor) } });
        const moved = await tx.project_workspaces.update({ where: { id: workspace.id }, data: { project_id: transfer.from_project_id, version: { increment: 1 }, ...K.changed(actor) } });
        const history = await tx.workspace_transfers.create({ data: { id: input.operation_id, workspace_id: workspace.id, from_project_id: transfer.to_project_id, to_project_id: transfer.from_project_id, from_membership_id: currentMembership.id, to_membership_id: newMembership.id, workspace_version: moved.version, ...K.audit(actor) } });
        return { approval_id: input.approval_id, transfer_id: history.id, workspace_id: workspace.id, project_id: moved.project_id, version: moved.version };
      });
    });
  }
}
