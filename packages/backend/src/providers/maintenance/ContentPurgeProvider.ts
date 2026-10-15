import type { tags } from "typia";

import { KnittingLogContext as K } from "../common/KnittingLogContext";
import { MaintenanceAuthorization as A } from "./MaintenanceAuthorization";

export namespace ContentPurgeProvider {
  export type Uuid = string & tags.Format<"uuid">;
  export type Kind = "project" | "workspace" | "counter" | "record" | "record_comment" | "post" | "post_comment";
  export interface Target { kind: Kind; id: Uuid }
  export interface PrepareInput {
    operation_id: Uuid;
    deletion_operation_id: Uuid;
    targets: Target[] & tags.MinItems<1> & tags.MaxItems<100>;
    executor_user_id: Uuid;
    reason: string & tags.MinLength<1> & tags.MaxLength<1000>;
    expires_at: string & tags.Format<"date-time">;
  }
  export interface ApproveInput extends PrepareInput { approval_id: Uuid; expected_snapshots: Preview[] & tags.MinItems<1> & tags.MaxItems<100> }
  export interface ExecuteInput { operation_id: Uuid; approval_id: Uuid }
  export interface Preview {
    target: Target;
    deletion_operation_id: string;
    deleted_at: string;
    updated_at: string;
    owner_user_ids: string[];
    parent: ParentSnapshot | null;
    version: number | null;
    workspace_version: number | null;
    dependencies: DependencySnapshot[];
    inventory_id: string;
    inventory_scanned_at: string;
    inventory_covers_through: string;
    retain_until: string;
  }
  export interface ParentSnapshot {
    kind: "project" | "workspace" | "record" | "post";
    id: string;
    updated_at: string;
    deleted_at: string | null;
    owner_user_id: string;
    project_id: string | null;
    version: number | null;
  }
  export interface DependencySnapshot {
    kind: "workspace" | "membership" | "invitation" | "transfer" | "counter" | "record" | "timer" | "record_comment" | "reaction" | "post_comment" | "like" | "report";
    ids: string[];
  }
  export interface RetentionInventoryTarget {
    kind: Kind;
    id: string;
    deletion_operation_id: string;
    deleted_at: string;
    updated_at: string;
  }
  export interface RetentionInventoryEvidence {
    kind: Kind;
    id: string;
    deletion_operation_id: string;
    deleted_at: string;
    updated_at: string;
    inventory_id: string;
    scanned_at: string;
    covers_through: string;
    retain_until: string;
    no_backup_references: true;
    no_retained_references: true;
  }
  export interface ContentRetentionInventory {
    inspect(target: RetentionInventoryTarget): Promise<RetentionInventoryEvidence | undefined>;
  }

  interface Snapshot extends Preview {}
  interface Approval {
    approval_id: string;
    approver_user_id: string;
    executor_user_id: string;
    reason: string;
    expires_at: string;
    deletion_operation_id: string;
    snapshots: Snapshot[];
  }
  interface JsonObject { [key: string]: JsonValue }
  type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
  type DbJson = string | number | boolean | null | { [key: string]: DbJson | DbJson[] } | DbJson[];

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const kinds = new Set<Kind>(["project", "workspace", "counter", "record", "record_comment", "post", "post_comment"]);
  const order: Record<Kind, number> = { project: 0, workspace: 1, counter: 2, record: 3, post: 3, record_comment: 4, post_comment: 4 };
  const MAX_APPROVAL_MS = 24 * 60 * 60_000;
  const INVENTORY_MAX_AGE_MS = 5 * 60_000;
  let retentionInventory: ContentRetentionInventory | undefined;

  export function configureRetentionInventory(inventory: ContentRetentionInventory | undefined): void {
    if (retentionInventory && retentionInventory !== inventory) fail(409, "PURGE_INVENTORY_LOCKED", "보존 인벤토리는 프로세스에서 한 번만 설정할 수 있습니다.");
    if (inventory) retentionInventory = inventory;
  }

  function fail(status: number, code: string, message: string): never { return K.fail(status, code, message); }
  function uuid(value: string): boolean { return UUID.test(value); }
  function iso(value: string): number {
    const milliseconds = Date.parse(value);
    if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) return fail(503, "PURGE_INVENTORY_INVALID", "시각 형식이 올바르지 않습니다.");
    return milliseconds;
  }
  function parseExpiry(value: string): string {
    const milliseconds = Date.parse(value);
    const now = Date.now();
    if (!Number.isFinite(milliseconds) || milliseconds <= now || milliseconds > now + MAX_APPROVAL_MS) fail(400, "INVALID_INPUT", "승인 만료 시각은 현재부터 24시간 이내여야 합니다.");
    return new Date(milliseconds).toISOString();
  }
  function validateReason(value: string): string {
    if (!value.trim() || value.length > 1000) fail(400, "INVALID_INPUT", "물리 삭제 사유를 입력하세요.");
    return value.trim();
  }
  export function validateInventoryEvidence(target: RetentionInventoryTarget, evidence: RetentionInventoryEvidence | undefined, now = new Date()): RetentionInventoryEvidence {
    if (!evidence) return fail(503, "PURGE_INVENTORY_UNAVAILABLE", "서버 보존 인벤토리를 확인할 수 없습니다.");
    if (!isSerializableJson(evidence)) return fail(503, "PURGE_INVENTORY_INVALID", "보존 인벤토리에 JSON이 아닌 값이 있습니다.");
    let parsed: unknown;
    try { parsed = JSON.parse(JSON.stringify(evidence)); } catch { return fail(503, "PURGE_INVENTORY_INVALID", "보존 인벤토리를 JSON으로 검증할 수 없습니다."); }
    if (!hasOnlyJson(parsed) || !isObject(parsed)) return fail(503, "PURGE_INVENTORY_INVALID", "보존 인벤토리가 JSON 형식이 아닙니다.");
    evidence = parsed as unknown as RetentionInventoryEvidence;
    const keys = ["kind", "id", "deletion_operation_id", "deleted_at", "updated_at", "inventory_id", "scanned_at", "covers_through", "retain_until", "no_backup_references", "no_retained_references"];
    if (Object.keys(evidence).length !== keys.length || Object.keys(evidence).some((key) => !keys.includes(key)) ||
        evidence.kind !== target.kind || evidence.id !== target.id || evidence.deletion_operation_id !== target.deletion_operation_id ||
        evidence.deleted_at !== target.deleted_at || evidence.updated_at !== target.updated_at || !evidence.inventory_id.trim() ||
        evidence.no_backup_references !== true || evidence.no_retained_references !== true) fail(503, "PURGE_INVENTORY_INVALID", "보존 인벤토리가 정확한 대상을 증명하지 않습니다.");
    const nowValue = now.getTime();
    const scanned = iso(evidence.scanned_at);
    const covers = iso(evidence.covers_through);
    const retain = iso(evidence.retain_until);
    if (!Number.isFinite(nowValue) || scanned > nowValue || nowValue - scanned > INVENTORY_MAX_AGE_MS || covers < nowValue || retain > nowValue) fail(409, "PURGE_RETENTION", "백업 범위·최신성 또는 보존 기간이 물리 삭제를 허용하지 않습니다.");
    return evidence;
  }
  export function validateDeletionAge(deletedAt: string, now = new Date()): void {
    const deleted = iso(deletedAt);
    const nowValue = now.getTime();
    if (!Number.isFinite(nowValue) || deleted > nowValue || nowValue - deleted < 30 * 86400_000) fail(409, "PURGE_RETENTION", "직접 삭제 뒤 30일이 지나야 물리 삭제할 수 있습니다.");
  }
  function hasOnlyJson(value: unknown): value is JsonValue {
    if (value === null || typeof value === "string" || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (Array.isArray(value)) return value.every(hasOnlyJson);
    if (typeof value !== "object") return false;
    const prototype = Object.getPrototypeOf(value);
    return (prototype === Object.prototype || prototype === null) && Reflect.ownKeys(value).every((key) => typeof key === "string") && Object.values(value).every(hasOnlyJson);
  }
  function isSerializableJson(value: unknown): boolean {
    try { return hasOnlyJson(value); } catch { return false; }
  }
  function isObject(value: unknown): value is JsonObject { return value !== null && typeof value === "object" && !Array.isArray(value); }
  function exactKeys(value: JsonObject, names: string[]): boolean { return Object.keys(value).length === names.length && Object.keys(value).every((key) => names.includes(key)); }

  function validateApproval(value: JsonValue): Approval {
    if (!isObject(value) || !exactKeys(value, ["approval_id", "approver_user_id", "executor_user_id", "reason", "expires_at", "deletion_operation_id", "snapshots"]) ||
        typeof value.approval_id !== "string" || !uuid(value.approval_id) || typeof value.approver_user_id !== "string" || !uuid(value.approver_user_id) ||
        typeof value.executor_user_id !== "string" || !uuid(value.executor_user_id) || value.approver_user_id === value.executor_user_id ||
        typeof value.reason !== "string" || !value.reason.trim() || value.reason.length > 1000 || typeof value.expires_at !== "string" || !validIso(value.expires_at) ||
        typeof value.deletion_operation_id !== "string" || !uuid(value.deletion_operation_id) || !Array.isArray(value.snapshots) || value.snapshots.length < 1 || value.snapshots.length > 100 ||
        !value.snapshots.every((entry) => isSnapshot(entry) && entry.deletion_operation_id === value.deletion_operation_id))
      fail(409, "PURGE_APPROVAL_INVALID", "승인 기록을 검증할 수 없습니다.");
    return value as unknown as Approval;
  }
  function validIso(value: unknown): value is string {
    if (typeof value !== "string") return false;
    const milliseconds = Date.parse(value);
    return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
  }
  function isSnapshot(value: JsonValue): value is JsonObject {
    const depKinds = ["workspace", "membership", "invitation", "transfer", "counter", "record", "timer", "record_comment", "reaction", "post_comment", "like", "report"];
    const target = isObject(value) ? value.target : undefined;
    const parent = isObject(value) ? value.parent : undefined;
    const dependencies = isObject(value) && Array.isArray(value.dependencies) ? value.dependencies : undefined;
    const parentValid = parent === null || (isObject(parent) && exactKeys(parent, ["kind", "id", "updated_at", "deleted_at", "owner_user_id", "project_id", "version"]) &&
      ["project", "workspace", "record", "post"].includes(String(parent.kind)) && typeof parent.id === "string" && uuid(parent.id) && validIso(parent.updated_at) &&
      (parent.deleted_at === null || validIso(parent.deleted_at)) && typeof parent.owner_user_id === "string" && uuid(parent.owner_user_id) &&
      (parent.project_id === null || typeof parent.project_id === "string" && uuid(parent.project_id)) && (parent.version === null || Number.isSafeInteger(parent.version)));
    return isObject(value) && exactKeys(value, ["target", "deletion_operation_id", "deleted_at", "updated_at", "owner_user_ids", "parent", "version", "workspace_version", "dependencies", "inventory_id", "inventory_scanned_at", "inventory_covers_through", "retain_until"]) &&
      isObject(target) && exactKeys(target, ["kind", "id"]) && typeof target.kind === "string" && kinds.has(target.kind as Kind) && typeof target.id === "string" && uuid(target.id) &&
      typeof value.deletion_operation_id === "string" && uuid(value.deletion_operation_id) && validIso(value.deleted_at) && validIso(value.updated_at) && Array.isArray(value.owner_user_ids) &&
      value.owner_user_ids.every((id) => typeof id === "string" && uuid(id)) &&
      parentValid && (value.version === null || Number.isSafeInteger(value.version)) && (value.workspace_version === null || Number.isSafeInteger(value.workspace_version)) &&
      dependencies !== undefined && dependencies.every((entry) => isObject(entry) && exactKeys(entry, ["kind", "ids"]) && typeof entry.kind === "string" && depKinds.includes(entry.kind) &&
        Array.isArray(entry.ids) && entry.ids.every((id) => typeof id === "string" && uuid(id))) &&
      typeof value.inventory_id === "string" && value.inventory_id.trim().length > 0 && validIso(value.inventory_scanned_at) && validIso(value.inventory_covers_through) && validIso(value.retain_until);
  }
  function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonicalize(entry)]));
    return value;
  }
  function canonical(value: unknown): string { return JSON.stringify(canonicalize(value)); }
  function compareTargets(left: Target, right: Target): number { return order[left.kind] - order[right.kind] || left.id.localeCompare(right.id); }

  function dependenciesEmpty(snapshot: Snapshot): void {
    if (snapshot.dependencies.some((entry) => entry.ids.length > 0)) fail(409, "PURGE_DEPENDENCY", "보존 중인 자식·관계·이력이 있어 물리 삭제할 수 없습니다.");
  }
  async function dependencySnapshot(tx: K.Tx, kind: Kind, id: string): Promise<DependencySnapshot[]> {
    const list = async <T extends { id: string }>(values: T[], dependency: DependencySnapshot["kind"]): Promise<DependencySnapshot> => ({ kind: dependency, ids: values.map((row) => row.id).sort((left, right) => left.localeCompare(right)) });
    switch (kind) {
      case "project":
        return [
          await list(await tx.project_workspaces.findMany({ where: { project_id: id }, select: { id: true } }), "workspace"),
          await list(await tx.project_memberships.findMany({ where: { project_id: id }, select: { id: true } }), "membership"),
          await list(await tx.project_invitations.findMany({ where: { project_id: id }, select: { id: true } }), "invitation"),
          await list(await tx.workspace_transfers.findMany({ where: { OR: [{ from_project_id: id }, { to_project_id: id }] }, select: { id: true } }), "transfer"),
        ];
      case "workspace":
        return [
          await list(await tx.project_counters.findMany({ where: { workspace_id: id }, select: { id: true } }), "counter"),
          await list(await tx.project_records.findMany({ where: { workspace_id: id }, select: { id: true } }), "record"),
          await list(await tx.project_timers.findMany({ where: { workspace_id: id }, select: { id: true } }), "timer"),
          await list(await tx.workspace_transfers.findMany({ where: { workspace_id: id }, select: { id: true } }), "transfer"),
        ];
      case "record":
        return [
          await list(await tx.record_comments.findMany({ where: { record_id: id }, select: { id: true } }), "record_comment"),
          await list(await tx.record_reactions.findMany({ where: { record_id: id }, select: { id: true } }), "reaction"),
          await list(await tx.project_timers.findMany({ where: { record_id: id }, select: { id: true } }), "timer"),
        ];
      case "post":
        return [
          await list(await tx.post_comments.findMany({ where: { post_id: id }, select: { id: true } }), "post_comment"),
          await list(await tx.post_likes.findMany({ where: { post_id: id }, select: { id: true } }), "like"),
          await list(await tx.reports.findMany({ where: { post_id: id }, select: { id: true } }), "report"),
        ];
      case "counter": case "record_comment": case "post_comment": return [];
    }
  }

  async function parentSnapshot(tx: K.Tx, kind: ParentSnapshot["kind"], id: string): Promise<ParentSnapshot> {
    switch (kind) {
      case "project": {
        const row = await tx.projects.findUnique({ where: { id }, select: { id: true, owner_user_id: true, updated_at: true, deleted_at: true } });
        if (!row) return fail(409, "PURGE_PARENT", "현재 부모 프로젝트를 찾을 수 없습니다.");
        return { kind: "project", id: row.id, project_id: row.id, owner_user_id: row.owner_user_id, updated_at: row.updated_at.toISOString(), deleted_at: row.deleted_at?.toISOString() ?? null, version: null };
      }
      case "record": {
        const row = await tx.project_records.findUnique({ where: { id }, select: { id: true, workspace_id: true, author_id: true, updated_at: true, deleted_at: true } });
        if (!row) return fail(409, "PURGE_PARENT", "현재 부모 기록을 찾을 수 없습니다.");
        const workspace = await tx.project_workspaces.findUniqueOrThrow({ where: { id: row.workspace_id }, select: { project_id: true } });
        return { kind: "record", id: row.id, project_id: workspace.project_id, owner_user_id: row.author_id, updated_at: row.updated_at.toISOString(), deleted_at: row.deleted_at?.toISOString() ?? null, version: null };
      }
      case "post": {
        const row = await tx.posts.findUnique({ where: { id }, select: { id: true, author_id: true, updated_at: true, deleted_at: true } });
        if (!row) return fail(409, "PURGE_PARENT", "현재 부모 게시글을 찾을 수 없습니다.");
        return { kind: "post", id: row.id, project_id: null, owner_user_id: row.author_id, updated_at: row.updated_at.toISOString(), deleted_at: row.deleted_at?.toISOString() ?? null, version: null };
      }
      case "workspace": {
        const row = await tx.project_workspaces.findUnique({ where: { id }, select: { id: true, project_id: true, owner_user_id: true, updated_at: true, deleted_at: true, version: true } });
        if (!row) return fail(409, "PURGE_PARENT", "현재 부모 작업 공간을 찾을 수 없습니다.");
        return { kind: "workspace", id: row.id, project_id: row.project_id, owner_user_id: row.owner_user_id, updated_at: row.updated_at.toISOString(), deleted_at: row.deleted_at?.toISOString() ?? null, version: row.version };
      }
    }
  }

  async function buildSnapshot(tx: K.Tx, target: Target, deletionOperationId: string): Promise<Snapshot> {
    if (!kinds.has(target.kind) || !uuid(target.id)) fail(400, "INVALID_INPUT", "물리 삭제 대상 형식이 올바르지 않습니다.");
    let deletedAt: Date | null;
    let updatedAt: Date;
    let owners: string[];
    let parentId: string | null = null;
    let version: number | null = null;
    let workspaceVersion: number | null = null;
    let parent: ParentSnapshot | null = null;
    switch (target.kind) {
      case "project": {
        const row = await tx.projects.findUnique({ where: { id: target.id }, select: { owner_user_id: true, deleted_at: true, deletion_operation_id: true, updated_at: true } });
        if (!row || row.deletion_operation_id !== deletionOperationId) return fail(409, "PURGE_STATE", "삭제 작업 식별자가 대상과 일치하지 않습니다.");
        deletedAt = row.deleted_at; updatedAt = row.updated_at; owners = [row.owner_user_id]; break;
      }
      case "workspace": {
        const row = await tx.project_workspaces.findUnique({ where: { id: target.id }, select: { project_id: true, owner_user_id: true, version: true, deleted_at: true, deletion_operation_id: true, updated_at: true } });
        if (!row || row.deletion_operation_id !== deletionOperationId) return fail(409, "PURGE_STATE", "삭제 작업 식별자가 대상과 일치하지 않습니다.");
        deletedAt = row.deleted_at; updatedAt = row.updated_at; owners = [row.owner_user_id]; parentId = row.project_id; version = row.version; parent = await parentSnapshot(tx, "project", row.project_id); break;
      }
      case "counter": {
        const row = await tx.project_counters.findUnique({ where: { id: target.id }, select: { workspace_id: true, version: true, deleted_at: true, deletion_operation_id: true, updated_at: true } });
        if (!row || row.deletion_operation_id !== deletionOperationId) return fail(409, "PURGE_STATE", "삭제 작업 식별자가 대상과 일치하지 않습니다.");
        const workspace = await tx.project_workspaces.findUnique({ where: { id: row.workspace_id }, select: { owner_user_id: true, version: true } });
        if (!workspace) return fail(409, "PURGE_PARENT", "현재 부모 작업 공간을 찾을 수 없습니다.");
        deletedAt = row.deleted_at; updatedAt = row.updated_at; owners = [workspace.owner_user_id]; parentId = row.workspace_id; version = row.version; workspaceVersion = workspace.version; parent = await parentSnapshot(tx, "workspace", row.workspace_id); break;
      }
      case "record": {
        const row = await tx.project_records.findUnique({ where: { id: target.id }, select: { workspace_id: true, author_id: true, deleted_at: true, deletion_operation_id: true, updated_at: true } });
        if (!row || row.deletion_operation_id !== deletionOperationId) return fail(409, "PURGE_STATE", "삭제 작업 식별자가 대상과 일치하지 않습니다.");
        const workspace = await tx.project_workspaces.findUnique({ where: { id: row.workspace_id }, select: { owner_user_id: true, version: true } });
        if (!workspace) return fail(409, "PURGE_PARENT", "현재 부모 작업 공간을 찾을 수 없습니다.");
        deletedAt = row.deleted_at; updatedAt = row.updated_at; owners = [row.author_id, workspace.owner_user_id].sort((left, right) => left.localeCompare(right)); parentId = row.workspace_id; workspaceVersion = workspace.version; parent = await parentSnapshot(tx, "workspace", row.workspace_id); break;
      }
      case "record_comment": {
        const row = await tx.record_comments.findUnique({ where: { id: target.id }, select: { record_id: true, author_id: true, deleted_at: true, deletion_operation_id: true, updated_at: true } });
        if (!row || row.deletion_operation_id !== deletionOperationId) return fail(409, "PURGE_STATE", "삭제 작업 식별자가 대상과 일치하지 않습니다.");
        const record = await tx.project_records.findUnique({ where: { id: row.record_id }, select: { workspace_id: true, author_id: true } });
        if (!record) return fail(409, "PURGE_PARENT", "현재 부모 기록을 찾을 수 없습니다.");
        const workspace = await tx.project_workspaces.findUnique({ where: { id: record.workspace_id }, select: { owner_user_id: true, version: true } });
        if (!workspace) return fail(409, "PURGE_PARENT", "현재 부모 작업 공간을 찾을 수 없습니다.");
        deletedAt = row.deleted_at; updatedAt = row.updated_at; owners = [row.author_id, record.author_id, workspace.owner_user_id].sort((left, right) => left.localeCompare(right)); parentId = row.record_id; workspaceVersion = workspace.version; parent = await parentSnapshot(tx, "record", row.record_id); break;
      }
      case "post": {
        const row = await tx.posts.findUnique({ where: { id: target.id }, select: { author_id: true, deleted_at: true, deletion_operation_id: true, updated_at: true } });
        if (!row || row.deletion_operation_id !== deletionOperationId) return fail(409, "PURGE_STATE", "삭제 작업 식별자가 대상과 일치하지 않습니다.");
        deletedAt = row.deleted_at; updatedAt = row.updated_at; owners = [row.author_id]; break;
      }
      case "post_comment": {
        const row = await tx.post_comments.findUnique({ where: { id: target.id }, select: { post_id: true, author_id: true, deleted_at: true, deletion_operation_id: true, updated_at: true } });
        if (!row || row.deletion_operation_id !== deletionOperationId) return fail(409, "PURGE_STATE", "삭제 작업 식별자가 대상과 일치하지 않습니다.");
        const post = await tx.posts.findUnique({ where: { id: row.post_id }, select: { author_id: true } });
        if (!post) return fail(409, "PURGE_PARENT", "현재 부모 게시글을 찾을 수 없습니다.");
        deletedAt = row.deleted_at; updatedAt = row.updated_at; owners = [row.author_id, post.author_id].sort((left, right) => left.localeCompare(right)); parentId = row.post_id; parent = await parentSnapshot(tx, "post", row.post_id); break;
      }
    }
    if (!deletedAt) return fail(409, "PURGE_STATE", "삭제된 콘텐츠만 물리 삭제할 수 있습니다.");
    validateDeletionAge(deletedAt.toISOString());
    const dependencies = await dependencySnapshot(tx, target.kind, target.id);
    const targetData: RetentionInventoryTarget = { kind: target.kind, id: target.id, deletion_operation_id: deletionOperationId, deleted_at: deletedAt.toISOString(), updated_at: updatedAt.toISOString() };
    const inventory = validateInventoryEvidence(targetData, await retentionInventory?.inspect(targetData));
    const snapshot: Snapshot = {
      target: { ...target }, deletion_operation_id: deletionOperationId, deleted_at: deletedAt.toISOString(), updated_at: updatedAt.toISOString(),
      owner_user_ids: owners, parent, version, workspace_version: workspaceVersion, dependencies,
      inventory_id: inventory.inventory_id, inventory_scanned_at: inventory.scanned_at, inventory_covers_through: inventory.covers_through, retain_until: inventory.retain_until,
    };
    dependenciesEmpty(snapshot);
    return snapshot;
  }

  async function snapshots(tx: K.Tx, input: PrepareInput): Promise<Snapshot[]> {
    if (!UUID.test(input.deletion_operation_id) || !UUID.test(input.operation_id) || !UUID.test(input.executor_user_id)) fail(400, "INVALID_INPUT", "작업 식별자 형식이 올바르지 않습니다.");
    validateReason(input.reason); parseExpiry(input.expires_at);
    if (input.targets.length < 1 || input.targets.length > 100 || new Set(input.targets.map((target) => `${target.kind}:${target.id}`)).size !== input.targets.length) fail(400, "INVALID_INPUT", "대상은 중복 없이 1개 이상 100개 이하여야 합니다.");
    const sorted = input.targets.slice().sort(compareTargets);
    const result: Snapshot[] = [];
    for (const target of sorted) result.push(await buildSnapshot(tx, target, input.deletion_operation_id));
    return result;
  }

  export async function prepare(authorization: string | undefined, input: PrepareInput): Promise<Preview[]> {
    K.keys(input, ["operation_id", "deletion_operation_id", "targets", "executor_user_id", "reason", "expires_at"]);
    return K.transaction(async (tx) => {
      const approver = await A.approver(tx, authorization);
      if (input.executor_user_id === approver || !A.isExecutor(input.executor_user_id)) fail(403, "FORBIDDEN", "다른 지정 실행자에게만 승인을 준비할 수 있습니다.");
      return snapshots(tx, input);
    });
  }

  export async function approve(authorization: string | undefined, input: ApproveInput): Promise<{ approval_id: string; expires_at: string }> {
    K.keys(input, ["operation_id", "approval_id", "deletion_operation_id", "targets", "executor_user_id", "reason", "expires_at", "expected_snapshots"]);
    if (!UUID.test(input.approval_id)) fail(400, "INVALID_INPUT", "승인 식별자가 올바르지 않습니다.");
    return K.transaction(async (tx) => {
      const approver = await A.approver(tx, authorization);
      if (input.executor_user_id === approver || !A.isExecutor(input.executor_user_id)) fail(403, "FORBIDDEN", "다른 지정 실행자에게만 승인을 발급할 수 있습니다.");
      const reason = validateReason(input.reason);
      const expires = parseExpiry(input.expires_at);
      const snapshot = await snapshots(tx, input);
      if (!Array.isArray(input.expected_snapshots) || canonical(snapshot) !== canonical(input.expected_snapshots)) fail(409, "PURGE_APPROVAL_STALE", "검토한 미리보기와 현재 대상 상태가 다릅니다.");
      const approval: Approval = { approval_id: input.approval_id, approver_user_id: approver, executor_user_id: input.executor_user_id, reason, expires_at: expires, deletion_operation_id: input.deletion_operation_id, snapshots: snapshot };
      await K.command(tx, approver, input.approval_id, "content_purge_approval", { ...input, reason, expected_snapshots: snapshot }, async () => ({ approval_id: input.approval_id, approval }));
      return { approval_id: input.approval_id, expires_at: expires };
    });
  }

  function storedApproval(row: { id: string; actor_user_id: string; command_type: string; result: DbJson }): Approval {
    if (row.command_type !== "content_purge_approval" || !hasOnlyJson(row.result)) return fail(404, "PURGE_APPROVAL_NOT_FOUND", "물리 삭제 승인을 찾을 수 없습니다.");
    const result = row.result as JsonValue;
    if (!isObject(result) || !isObject(result.value) || !isObject(result.value.approval)) return fail(409, "PURGE_APPROVAL_INVALID", "승인 기록을 검증할 수 없습니다.");
    const approval = validateApproval(result.value.approval);
    if (approval.approver_user_id !== row.actor_user_id || approval.approval_id !== row.id) return fail(409, "PURGE_APPROVAL_INVALID", "승인 주체와 기록을 확인할 수 없습니다.");
    return approval;
  }

  async function consumed(tx: K.Tx, approvalId: string): Promise<boolean> {
    const rows = await tx.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM accounts.command_receipts
      WHERE command_type = 'content_purge_execute' AND result->'value'->>'approval_id' = ${approvalId}`;
    return rows[0]?.count !== 0n;
  }

  async function revalidateRoles(tx: K.Tx, actor: string, receiptActor: string, value: Approval): Promise<void> {
    if (value.executor_user_id !== actor || receiptActor !== value.approver_user_id || !A.isApprover(value.approver_user_id) || !A.isExecutor(actor)) fail(403, "FORBIDDEN", "승인자 또는 실행자의 현재 운영 권한이 유효하지 않습니다.");
    const approver = await tx.users.findFirst({ where: { id: value.approver_user_id, deleted_at: null }, select: { id: true } });
    if (!approver) fail(403, "FORBIDDEN", "승인자가 현재 활성 계정이 아닙니다.");
  }

  async function deleteOne(tx: K.Tx, target: Target, deletionOperationId: string, deletedAt: string, updatedAt: string): Promise<void> {
    const where = { id: target.id, deleted_at: new Date(deletedAt), deletion_operation_id: deletionOperationId, updated_at: new Date(updatedAt) };
    let count: number;
    switch (target.kind) {
      case "project": count = (await tx.projects.deleteMany({ where })).count; break;
      case "workspace": count = (await tx.project_workspaces.deleteMany({ where })).count; break;
      case "counter": count = (await tx.project_counters.deleteMany({ where })).count; break;
      case "record": count = (await tx.project_records.deleteMany({ where })).count; break;
      case "record_comment": count = (await tx.record_comments.deleteMany({ where })).count; break;
      case "post": count = (await tx.posts.deleteMany({ where })).count; break;
      case "post_comment": count = (await tx.post_comments.deleteMany({ where })).count; break;
    }
    if (count !== 1) fail(409, "PURGE_STATE", "물리 삭제 직전에 대상 상태가 변경되었습니다.");
  }

  export interface ExecutionResult { approval_id: string; purged: Target[] }

  export async function execute(authorization: string | undefined, input: ExecuteInput): Promise<ExecutionResult> {
    K.keys(input, ["operation_id", "approval_id"]);
    if (!uuid(input.operation_id) || !uuid(input.approval_id)) fail(400, "INVALID_INPUT", "작업 식별자가 올바르지 않습니다.");
    return K.transaction(async (tx) => {
      const actor = await A.executor(tx, authorization);
      const receipt = await tx.command_receipts.findUnique({ where: { id: input.approval_id } });
      if (!receipt || receipt.deleted_at) return fail(404, "PURGE_APPROVAL_NOT_FOUND", "물리 삭제 승인을 찾을 수 없습니다.");
      const value = storedApproval(receipt as unknown as { id: string; actor_user_id: string; command_type: string; result: DbJson });
      await revalidateRoles(tx, actor, receipt.actor_user_id, value);
      const commandInput = { approval_id: input.approval_id };
      return K.command(tx, actor, input.operation_id, "content_purge_execute", commandInput, async () => {
        if (Date.parse(value.expires_at) <= Date.now()) fail(403, "PURGE_APPROVAL_EXPIRED", "물리 삭제 승인이 만료되었습니다.");
        if (await consumed(tx, input.approval_id)) fail(409, "PURGE_APPROVAL_USED", "이미 실행한 승인입니다.");
        const current: Snapshot[] = [];
        for (const target of value.snapshots) {
          const snapshot = await buildSnapshot(tx, target.target, value.deletion_operation_id);
          current.push(snapshot);
        }
        if (canonical(current) !== canonical(value.snapshots)) fail(409, "PURGE_APPROVAL_STALE", "승인 뒤 콘텐츠·부모·참조 또는 보존 상태가 변경되었습니다.");
        for (const snapshot of value.snapshots.slice().sort((left, right) => order[right.target.kind] - order[left.target.kind] || left.target.id.localeCompare(right.target.id)))
          await deleteOne(tx, snapshot.target, value.deletion_operation_id, snapshot.deleted_at, snapshot.updated_at);
        return { approval_id: input.approval_id, purged: value.snapshots.map((snapshot) => snapshot.target) };
      });
    });
  }

}
