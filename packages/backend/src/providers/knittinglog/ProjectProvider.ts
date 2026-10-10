import { createHash, randomUUID } from "node:crypto";
import { tags } from "typia";

import {
  project_invitations,
  project_memberships,
  project_workspaces,
  projects,
  workspace_transfers,
} from "../../prisma/client";
import { KnittingLogContext as K } from "./KnittingLogContext";
import { SocialProvider } from "./SocialProvider";
import { AuthProvider } from "./AuthProvider";

export namespace ProjectProvider {
  export type Uuid = string & tags.Format<"uuid">;
  export interface Project {
    id: string;
    owner_user_id: string;
    name: string;
    cover_photo_object_id: string | null;
  }
  export interface Membership {
    id: string;
    project_id: string;
    user_id: string;
    left_at: string | null;
  }
  export interface Workspace {
    id: string;
    project_id: string;
    owner_user_id: string;
    status: "active" | "paused" | "done";
    yarn_notes: string | null;
    needle_notes: string | null;
    ended_at: string | null;
    version: number;
  }
  export interface Invitation {
    id: string;
    project_id: string;
    recipient_id: string;
    status: "pending" | "accepted" | "rejected" | "cancelled";
  }
  export interface Transfer {
    id: string;
    workspace_id: string;
    from_project_id: string;
    to_project_id: string;
    from_membership_id: string;
    to_membership_id: string;
    workspace_version: number;
  }
  export interface Create {
    name: string & tags.MinLength<1> & tags.MaxLength<255>;
    cover_photo_object_id?: Uuid | null;
    invitee_user_ids?: Uuid[] & tags.MaxItems<100>;
  }
  export interface Update {
    name?: string & tags.MinLength<1> & tags.MaxLength<255>;
    cover_photo_object_id?: Uuid | null;
  }
  export interface Move {
    operation_id: Uuid;
    workspace_id: Uuid;
    expected_version: number & tags.Type<"int32"> & tags.Minimum<0>;
    successor_user_id?: Uuid;
  }
  export const project = (row: projects): Project => ({
    id: row.id,
    owner_user_id: row.owner_user_id,
    name: row.name,
    cover_photo_object_id: row.cover_photo_object_id,
  });
  export const membership = (row: project_memberships): Membership => ({
    id: row.id,
    project_id: row.project_id,
    user_id: row.user_id,
    left_at: row.left_at?.toISOString() ?? null,
  });
  export const workspace = (row: project_workspaces): Workspace => ({
    id: row.id,
    project_id: row.project_id,
    owner_user_id: row.owner_user_id,
    status: row.status,
    yarn_notes: row.yarn_notes,
    needle_notes: row.needle_notes,
    ended_at: row.ended_at?.toISOString() ?? null,
    version: row.version,
  });
  export const invitation = (row: project_invitations): Invitation => ({
    id: row.id,
    project_id: row.project_id,
    recipient_id: row.recipient_id,
    status: row.status,
  });
  export const transfer = (row: workspace_transfers): Transfer => ({
    id: row.id,
    workspace_id: row.workspace_id,
    from_project_id: row.from_project_id,
    to_project_id: row.to_project_id,
    from_membership_id: row.from_membership_id,
    to_membership_id: row.to_membership_id,
    workspace_version: row.workspace_version,
  });

  export function keys(input: object, allowed: string[]): void {
    if (Object.keys(input).some((key) => !allowed.includes(key))) {
      K.fail(400, "INVALID_INPUT", "허용하지 않은 입력 필드가 있습니다.");
    }
  }

  async function verified(tx: K.Tx, authorization: string | undefined, write = false): Promise<string> {
    const actor = await AuthProvider.actor(authorization, tx);
    if (write) await K.consent(tx, actor.id);
    return actor.id;
  }

  export async function access(tx: K.Tx, actorId: string, id: string, write = false): Promise<projects> {
    const row = await tx.projects.findFirst({
      where: { id, deleted_at: null },
    });
    if (!row || !await tx.project_memberships.findFirst({
      where: {
        project_id: id,
        user_id: actorId,
        left_at: null,
        deleted_at: null,
      },
    })) K.fail(404, "NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
    if (write && row.terminated_at) K.fail(
      409,
      "PROJECT_TERMINATED",
      "종료한 프로젝트는 변경할 수 없습니다.",
    );
    return row;
  }

  async function owned(tx: K.Tx, actorId: string, id: string): Promise<projects> {
    const row = await access(tx, actorId, id, true);
    if (row.owner_user_id !== actorId) K.fail(
      403,
      "OWNER_REQUIRED",
      "방장만 처리할 수 있습니다.",
    );
    return row;
  }

  async function photo(tx: K.Tx, actorId: string, id: string | null | undefined): Promise<void> {
    if (id && !await tx.stored_objects.findFirst({
      where: { id, owner_user_id: actorId, deleted_at: null, purged_at: null },
    })) K.fail(404, "NOT_FOUND", "사진을 찾을 수 없습니다.");
  }

  async function setupWorkspace(tx: K.Tx, actorId: string, projectId: string, userId: string): Promise<void> {
    const existing = await tx.project_workspaces.findUnique({
      where: {
        project_id_owner_user_id: {
          project_id: projectId,
          owner_user_id: userId,
        },
      },
    });
    if (existing) {
      if (existing.deleted_at) K.fail(
        409,
        "WORKSPACE_DELETED",
        "삭제한 작업 공간을 새 참여로 복구할 수 없습니다.",
      );
      return;
    }
    const created = await tx.project_workspaces.create({
      data: {
        project_id: projectId,
        owner_user_id: userId,
        ...K.audit(actorId),
      },
    });
    await tx.project_counters.createMany({
      data: ["단", "코"].map((name, sort_order) => ({
        workspace_id: created.id,
        name,
        sort_order,
        ...K.audit(actorId),
      })),
    });
  }

  async function inviteIn(tx: K.Tx, actorId: string, id: string, recipientId: string): Promise<project_invitations> {
    await access(tx, actorId, id, true);
    if (!await tx.users.findFirst({
      where: { id: recipientId, deleted_at: null },
    })) K.fail(404, "NOT_FOUND", "초대 대상을 찾을 수 없습니다.");
    if (actorId === recipientId || !await SocialProvider.areFriends(
      tx,
      actorId,
      recipientId,
    )) K.fail(
      403,
      "FRIEND_REQUIRED",
      "차단 관계가 아닌 친구만 초대할 수 있습니다.",
    );
    if (await tx.project_memberships.findFirst({
      where: {
        project_id: id,
        user_id: recipientId,
        left_at: null,
        deleted_at: null,
      },
    })) K.fail(409, "ALREADY_MEMBER", "이미 참여 중입니다.");
    if (await tx.project_invitations.findFirst({
      where: {
        project_id: id,
        recipient_id: recipientId,
        status: "pending",
        deleted_at: null,
      },
    })) K.fail(409, "PENDING_INVITATION", "대기 중인 초대가 있습니다.");
    return tx.project_invitations.create({
      data: {
        project_id: id,
        sender_id: actorId,
        recipient_id: recipientId,
        ...K.audit(actorId),
      },
    });
  }

  export async function create(authorization: string | undefined, input: Create): Promise<Project> {
    keys(input, ["name", "cover_photo_object_id", "invitee_user_ids"]);
    return K.transaction(async (tx) => {
      const actorId = await verified(tx, authorization, true);
      if (!input.name.trim()) K.fail(400, "INVALID_INPUT", "프로젝트 이름이 필요합니다.");
      await photo(tx, actorId, input.cover_photo_object_id);
      const row = await tx.projects.create({ data: { name: input.name, owner_user_id: actorId, cover_photo_object_id: input.cover_photo_object_id, ...K.audit(actorId) } });
      await tx.project_memberships.create({ data: { project_id: row.id, user_id: actorId, ...K.audit(actorId) } });
      await setupWorkspace(tx, actorId, row.id, actorId);
      for (const recipient of [...new Set(input.invitee_user_ids ?? [])]) await inviteIn(tx, actorId, row.id, recipient);
      return project(row);
    });
  }

  export async function list(authorization: string | undefined, status?: Workspace["status"]): Promise<Project[]> {
    return K.transaction(async (tx) => {
      const actorId = await verified(tx, authorization);
      const rows = await tx.projects.findMany({ where: { deleted_at: null, memberships: { some: { user_id: actorId, left_at: null, deleted_at: null } },
        ...(status ? { workspaces: { some: { owner_user_id: actorId, deleted_at: null, status } } } : {}),
      }, orderBy: [{ created_at: "desc" }, { id: "desc" }] });
      return rows.map(project);
    });
  }

  export async function get(authorization: string | undefined, id: string): Promise<Project> {
    return K.transaction(async (tx) => {
      const actorId = await verified(tx, authorization);
      return project(await access(tx, actorId, id));
    });
  }

  export async function update(authorization: string | undefined, id: string, input: Update): Promise<Project> {
    keys(input, ["name", "cover_photo_object_id"]);
    return K.transaction(async (tx) => {
      const actorId = await verified(tx, authorization, true);
      await owned(tx, actorId, id);
      if (input.name !== undefined && !input.name.trim()) K.fail(400, "INVALID_INPUT", "프로젝트 이름이 필요합니다.");
      await photo(tx, actorId, input.cover_photo_object_id);
      return project(
        await tx.projects.update({ where: { id }, data: { ...input, ...K.changed(actorId) } }),
      );
    });
  }

  export async function remove(authorization: string | undefined, id: string): Promise<void> {
    await K.transaction(async (tx) => {
      const actorId = await verified(tx, authorization, true);
      await owned(tx, actorId, id);
      await tx.projects.update({ where: { id }, data: { deleted_at: new Date(), deletion_operation_id: randomUUID(), ...K.changed(actorId) } });
    });
  }

  export async function memberships(authorization: string | undefined, id: string): Promise<Membership[]> {
    return K.transaction(async (tx) => {
      const actorId = await verified(tx, authorization);
      await access(tx, actorId, id);
      return (await tx.project_memberships.findMany({ where: { project_id: id, left_at: null, deleted_at: null, user: { deleted_at: null } }, orderBy: [{ created_at: "asc" }, { id: "asc" }] })).map(
        membership,
      );
    });
  }

  export async function history(authorization: string | undefined): Promise<Membership[]> {
    return K.transaction(async (tx) => {
      const actorId = await verified(tx, authorization);
      return (await tx.project_memberships.findMany({ where: { user_id: actorId }, orderBy: [{ created_at: "asc" }, { id: "asc" }] })).map(
        membership,
      );
    });
  }

  export async function workspaces(authorization: string | undefined, id: string): Promise<Workspace[]> {
    return K.transaction(async (tx) => {
      const actorId = await verified(tx, authorization);
      await access(tx, actorId, id);
      const rows = await tx.project_workspaces.findMany({ where: { project_id: id, deleted_at: null, owner: { deleted_at: null } }, orderBy: [{ created_at: "asc" }, { id: "asc" }] });
      const visible: Workspace[] = [];
      for (const row of rows) {
        if (await tx.project_memberships.findFirst({ where: { project_id: id, user_id: row.owner_user_id, left_at: null, deleted_at: null } }) && !await K.blocked(tx, actorId, row.owner_user_id)) visible.push(workspace(row));
      }
      return visible;
    });
  }

  export async function owner(authorization: string | undefined, id: string, userId: string): Promise<Project> {
    return K.transaction(async (tx) => {
      const actorId = await verified(tx, authorization, true);
      await owned(tx, actorId, id);
      if (!await tx.project_memberships.findFirst({ where: { project_id: id, user_id: userId, left_at: null, deleted_at: null, user: { deleted_at: null } } })) K.fail(409, "SUCCESSOR_REQUIRED", "현재 참여한 후임을 지정해야 합니다.");
      return project(
        await tx.projects.update({ where: { id }, data: { owner_user_id: userId, ...K.changed(actorId) } }),
      );
    });
  }

  export async function invite(authorization: string | undefined, id: string, recipientId: string): Promise<Invitation> {
    return K.transaction(async (tx) => {
      const actorId = await verified(tx, authorization, true);
      return invitation(await inviteIn(tx, actorId, id, recipientId));
    });
  }

  export async function invitations(authorization: string | undefined, status?: Invitation["status"]): Promise<Invitation[]> {
    return K.transaction(async (tx) => {
      const actorId = await verified(tx, authorization);
      const rows = await tx.project_invitations.findMany({ where: { recipient_id: actorId, deleted_at: null, ...(status ? { status } : {}), project: { deleted_at: null, terminated_at: null }, sender: { deleted_at: null } }, orderBy: [{ created_at: "desc" }, { id: "desc" }] });
      const visible: Invitation[] = [];
      for (const row of rows) if (!await K.blocked(tx, actorId, row.sender_id)) visible.push(invitation(row));
      return visible;
    });
  }

  export async function accept(authorization: string | undefined, id: string): Promise<Membership> {
    return K.transaction(async (tx) => {
      const actorId = await verified(tx, authorization, true);
      const row = await tx.project_invitations.findFirst({ where: { id, deleted_at: null } });
      if (!row) K.fail(404, "NOT_FOUND", "초대를 찾을 수 없습니다.");
      if (row.recipient_id !== actorId) K.fail(403, "FORBIDDEN", "수신자만 초대를 수락할 수 있습니다.");
      const parent = await tx.projects.findFirst({ where: { id: row.project_id, deleted_at: null, terminated_at: null } });
      if (!parent) K.fail(404, "NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
      const current = await tx.project_memberships.findFirst({ where: { project_id: row.project_id, user_id: actorId, left_at: null, deleted_at: null } });
      if (row.status === "accepted" && current) return membership(current);
      if (row.status !== "pending" || current) K.fail(409, "INVITATION_STATE", "수락할 수 없는 초대입니다.");
      await access(tx, row.sender_id, row.project_id, true);
      if (!await tx.users.findFirst({ where: { id: row.sender_id, deleted_at: null } }) || await K.blocked(tx, actorId, row.sender_id)) K.fail(403, "BLOCKED", "초대를 수락할 수 없습니다.");
      const count = await tx.project_memberships.count({ where: { project_id: row.project_id, left_at: null, deleted_at: null, user: { deleted_at: null } } });
      if (count >= 20) K.fail(409, "MEMBER_LIMIT", "프로젝트 참여자는 최대 20명입니다.");
      const created = await tx.project_memberships.create({ data: { project_id: row.project_id, user_id: actorId, ...K.audit(actorId) } });
      await setupWorkspace(tx, actorId, row.project_id, actorId);
      await tx.project_invitations.update({ where: { id }, data: { status: "accepted", responded_at: new Date(), ...K.changed(actorId) } });
      return membership(created);
    });
  }

  export async function cancel(authorization: string | undefined, id: string, reject = false): Promise<void> {
    await K.transaction(async (tx) => {
      const actorId = await verified(tx, authorization, true);
      const row = await tx.project_invitations.findFirst({ where: { id, deleted_at: null } });
      if (!row) K.fail(404, "NOT_FOUND", "초대를 찾을 수 없습니다.");
      if ((reject ? row.recipient_id : row.sender_id) !== actorId) K.fail(403, "FORBIDDEN", "초대를 처리할 권한이 없습니다.");
      if (row.status !== "pending") K.fail(409, "INVITATION_STATE", "대기 중인 초대가 아닙니다.");
      const parent = await tx.projects.findFirst({ where: { id: row.project_id, deleted_at: null, terminated_at: null } });
      if (!parent) K.fail(404, "NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
      if (!reject) await access(tx, actorId, row.project_id, true);
      await tx.project_invitations.update({ where: { id }, data: { status: reject ? "rejected" : "cancelled", responded_at: new Date(), ...K.changed(actorId) } });
    });
  }

  export async function move(authorization: string | undefined, projectId: string, userId: string | undefined, input: Move, kick = false): Promise<Transfer> {
    keys(input, [
      "operation_id",
      "workspace_id",
      "expected_version",
      "successor_user_id",
    ]);
    const command = kick ? "project.kick" : "project.leave";
    return K.transaction(async (tx) => {
      const actorId = await verified(tx, authorization, true);
      userId ??= actorId;
      const hash = createHash("sha256").update(JSON.stringify([command, projectId, userId, input.workspace_id, input.expected_version, input.successor_user_id ?? null])).digest("hex");
      // 참여 종료 뒤에도 원래 실행자와 입력이 일치하는 재시도는 같은 결과를 반환합니다.
      const receipt = await tx.command_receipts.findUnique({ where: { id: input.operation_id } });
      if (receipt) {
        if (receipt.actor_user_id !== actorId) K.fail(403, "FORBIDDEN", "다른 사용자의 명령 결과를 조회할 수 없습니다.");
        if (receipt.command_type !== command || receipt.request_hash !== hash) K.fail(409, "OPERATION_CONFLICT", "작업 식별자의 입력이 다릅니다.");
        const previous = await tx.workspace_transfers.findUnique({ where: { id: input.operation_id } });
        if (!previous) K.fail(409, "OPERATION_CONFLICT", "완료한 이관 결과를 확인할 수 없습니다.");
        return transfer(previous);
      }
      const parent = kick ? await owned(tx, actorId, projectId) : await access(tx, actorId, projectId, true);
      if (kick && (userId === parent.owner_user_id || actorId === userId)) K.fail(403, "FORBIDDEN", "방장을 추방할 수 없습니다.");
      if (!kick && actorId !== userId) K.fail(403, "FORBIDDEN", "자신의 참여만 종료할 수 있습니다.");
      if (!await tx.users.findFirst({ where: { id: userId, deleted_at: null } })) K.fail(404, "NOT_FOUND", "이관 대상을 찾을 수 없습니다.");
      const from = await tx.project_memberships.findFirst({ where: { project_id: projectId, user_id: userId, left_at: null, deleted_at: null } });
      const work = await tx.project_workspaces.findFirst({ where: { id: input.workspace_id, project_id: projectId, owner_user_id: userId, deleted_at: null } });
      if (!from || !work) K.fail(404, "NOT_FOUND", "참여 또는 작업 공간을 찾을 수 없습니다.");
      if (work.version !== input.expected_version) K.fail(409, "VERSION_CONFLICT", "작업 공간이 변경되었습니다.");
      if (parent.owner_user_id === userId) {
        const others = await tx.project_memberships.findMany({ where: { project_id: projectId, user_id: { not: userId }, left_at: null, deleted_at: null, user: { deleted_at: null } } });
        if (others.length) {
          if (!input.successor_user_id || !others.some((row) => row.user_id === input.successor_user_id)) K.fail(409, "SUCCESSOR_REQUIRED", "현재 참여한 후임을 지정해야 합니다.");
          await tx.projects.update({ where: { id: projectId }, data: { owner_user_id: input.successor_user_id, ...K.changed(actorId) } });
        } else await tx.projects.update({ where: { id: projectId }, data: { terminated_at: new Date(), ...K.changed(actorId) } });
      } else if (input.successor_user_id) K.fail(400, "INVALID_INPUT", "방장만 후임을 지정할 수 있습니다.");
      if (parent.cover_photo_object_id && !await tx.stored_objects.findFirst({ where: { id: parent.cover_photo_object_id, deleted_at: null, purged_at: null } })) K.fail(409, "PHOTO_STATE", "프로젝트 사진을 보존할 수 없습니다.");
      const personal = await tx.projects.create({ data: { name: parent.name, cover_photo_object_id: parent.cover_photo_object_id, owner_user_id: userId, ...K.audit(actorId) } });
      const to = await tx.project_memberships.create({ data: { project_id: personal.id, user_id: userId, ...K.audit(actorId) } });
      await tx.project_memberships.update({ where: { id: from.id }, data: { left_at: new Date(), ...K.changed(actorId) } });
      const moved = await tx.project_workspaces.update({ where: { id: work.id }, data: { project_id: personal.id, version: { increment: 1 }, ...K.changed(actorId) } });
      await tx.project_invitations.updateMany({ where: { project_id: projectId, sender_id: userId, status: "pending", deleted_at: null }, data: { status: "cancelled", responded_at: new Date(), ...K.changed(actorId) } });
      const history = await tx.workspace_transfers.create({ data: {
        id: input.operation_id, workspace_id: work.id, from_project_id: projectId, to_project_id: personal.id,
        from_membership_id: from.id, to_membership_id: to.id, workspace_version: moved.version, ...K.audit(actorId),
      } });
      const result = transfer(history);
      await tx.command_receipts.create({ data: { id: input.operation_id, actor_user_id: actorId, command_type: command, request_hash: hash, result: { ...result }, ...K.audit(actorId) } });
      return result;
    });
  }
}
