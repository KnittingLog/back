import type { users } from "@prisma/sdk";

import { AuthProvider } from "./AuthProvider";
import { KnittingLogContext as K } from "./KnittingLogContext";
import { PolicyProvider } from "./PolicyProvider";

export namespace AccountProvider {
  export interface Update {
    handle?: string;
    nickname?: string;
    biography?: string | null;
    visibility?: "public" | "friends" | "private";
  }
  export interface PolicyConsentInput {
    policy_document_ids: string[];
  }
  export interface Membership {
    id: string;
    project_id: string;
    user_id: string;
    left_at: string | null;
  }
  export interface Record {
    id: string;
    workspace_id: string;
    author_id: string;
    author_name: string;
    source: "manual" | "timer";
    body: string | null;
    duration_seconds: number;
    recorded_at: string;
  }
  export interface Statistics {
    total_duration_seconds: number;
  }

  export function me(authorization?: string): Promise<AuthProvider.User> {
    return K.transaction(async (tx) =>
      K.publicUser(await AuthProvider.actor(authorization, tx)),
    );
  }

  export function profile(authorization: string | undefined, id: string): Promise<AuthProvider.User> {
    return K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(authorization, tx);
      return K.publicUser(await visibleUser(tx, actor.id, id));
    });
  }

  export function search(authorization: string | undefined, query?: string): Promise<AuthProvider.User[]> {
    return K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(authorization, tx);
      const term = query?.trim() ?? "";
      if (!term) return [];
      const candidates = await tx.users.findMany({ where: {
        deleted_at: null, OR: [{ handle: { contains: term, mode: "insensitive" } }, { nickname: { contains: term, mode: "insensitive" } }],
      }, orderBy: [{ nickname: "asc" }, { id: "asc" }], take: 100 });
      const result: AuthProvider.User[] = [];
      for (const candidate of candidates) if (!await K.blocked(tx, actor.id, candidate.id)) result.push(K.publicUser(candidate));
      return result;
    });
  }

  export function update(authorization: string | undefined, input: Update): Promise<AuthProvider.User> {
    K.keys(input, ["handle", "nickname", "biography", "visibility"]);
    return K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(authorization, tx);
      await K.consent(tx, actor.id);
      let handle = actor.handle;
      if (input.handle !== undefined) {
        handle = AuthProvider.identifier(input.handle);
        const reservation = await tx.user_identifiers.findUnique({ where: { kind_value: { kind: "handle", value: handle } } });
        const current = await tx.users.findUnique({ where: { handle } });
        if ((reservation && reservation.user_id !== actor.id) || (current && current.id !== actor.id))
          K.fail(409, "IDENTIFIER_RESERVED", "사용할 수 없는 계정 식별자입니다.");
        if (!reservation) await tx.user_identifiers.create({ data: { user_id: actor.id, kind: "handle", value: handle, ...K.audit(actor.id) } });
      }
      const nickname = input.nickname?.trim();
      if (nickname !== undefined && (!nickname || [...nickname].length > 100))
        K.fail(400, "INVALID_NICKNAME", "닉네임의 길이가 올바르지 않습니다.");
      const updated = await tx.users.update({ where: { id: actor.id }, data: {
        handle, ...(nickname === undefined ? {} : { nickname }),
        ...(input.biography === undefined ? {} : { biography: input.biography }),
        ...(input.visibility === undefined ? {} : { visibility: input.visibility }), ...K.changed(actor.id),
      } });
      return K.publicUser(updated);
    });
  }

  export function consents(authorization?: string): Promise<PolicyProvider.Consent[]> {
    return K.transaction(async (tx) =>
      PolicyProvider.consents(
        tx,
        (await AuthProvider.actor(authorization, tx)).id,
      ),
    );
  }

  export function agree(authorization: string | undefined, input: PolicyConsentInput): Promise<PolicyProvider.Consent[]> {
    K.keys(input, ["policy_document_ids"]);
    return K.transaction(async (tx) =>
      PolicyProvider.agree(
        tx,
        (await AuthProvider.actor(authorization, tx)).id,
        input.policy_document_ids,
      ),
    );
  }

  export function memberships(authorization?: string): Promise<Membership[]> {
    return K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(authorization, tx);
      const rows = await tx.project_memberships.findMany({ where: { user_id: actor.id }, orderBy: [{ created_at: "desc" }, { id: "desc" }] });
      return rows.map((row) => ({
        id: row.id,
        project_id: row.project_id,
        user_id: row.user_id,
        left_at: row.left_at?.toISOString() ?? null,
      }));
    });
  }

  export function records(authorization: string | undefined, id?: string): Promise<Record[]> {
    return K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(authorization, tx);
      return visibleRecords(tx, actor.id, id ?? actor.id);
    });
  }

  export function statistics(authorization: string | undefined, id?: string): Promise<Statistics> {
    return K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(authorization, tx);
      return { total_duration_seconds: (await visibleRecords(tx, actor.id, id ?? actor.id))
        .reduce((total, row) => total + row.duration_seconds, 0) };
    });
  }

  async function visibleUser(tx: K.Tx, actorId: string, targetId: string): Promise<users> {
    const target = await tx.users.findUnique({ where: { id: targetId } });
    if (!target || target.deleted_at || await K.blocked(tx, actorId, targetId))
      return K.fail(404, "USER_NOT_FOUND", "사용자를 찾을 수 없습니다.");
    return target;
  }

  async function visibleRecords(tx: K.Tx, actorId: string, targetId: string): Promise<Record[]> {
    const target = await visibleUser(tx, actorId, targetId);
    if (actorId !== targetId && target.visibility !== "public") {
      const [low, high] = [actorId, targetId].sort((a, b) =>
        a.localeCompare(b),
      );
      const friends = target.visibility === "friends" && await tx.friendships.findFirst(
        {
          where: { user_low_id: low, user_high_id: high, deleted_at: null },
        },
      );
      if (!friends) K.fail(
        403,
        "PROFILE_PRIVATE",
        "기록 공개 범위에 접근할 수 없습니다.",
      );
    }
    const rows = await tx.project_records.findMany({
      where: {
        author_id: targetId,
        deleted_at: null,
        workspace: { deleted_at: null, project: { deleted_at: null } },
      },
      include: { author: { select: { nickname: true, deleted_at: true } } },
      orderBy: [{ recorded_at: "desc" }, { id: "desc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      workspace_id: row.workspace_id,
      author_id: row.author_id,
      author_name: row.author.deleted_at
        ? "탈퇴한 사용자"
        : (row.author.nickname ?? ""),
      source: row.source,
      body: row.body,
      duration_seconds: row.duration_seconds,
      recorded_at: row.recorded_at.toISOString(),
    }));
  }

  export function withdraw(authorization?: string): Promise<void> {
    return K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(authorization, tx);
      const owned = await tx.projects.findMany({ where: { owner_user_id: actor.id, deleted_at: null, terminated_at: null } });
      for (const project of owned) {
        const others = await tx.project_memberships.count({ where: { project_id: project.id, user_id: { not: actor.id }, left_at: null, deleted_at: null } });
        if (others) K.fail(409, "SUCCESSOR_REQUIRED", "방장 후임을 먼저 지정해야 합니다.");
      }
      const now = new Date();
      await tx.projects.updateMany({ where: { id: { in: owned.map((row) => row.id) } }, data: { terminated_at: now, ...K.changed(actor.id) } });
      await tx.project_memberships.updateMany({ where: { user_id: actor.id, left_at: null, deleted_at: null }, data: { left_at: now, ...K.changed(actor.id) } });
      await tx.auth_sessions.updateMany({ where: { user_id: actor.id, revoked_at: null }, data: { revoked_at: now, ...K.changed(actor.id) } });
      await tx.recovery_codes.updateMany({ where: { user_id: actor.id, revoked_at: null }, data: { revoked_at: now, ...K.changed(actor.id) } });
      await tx.friendships.updateMany({ where: { deleted_at: null, OR: [{ user_low_id: actor.id }, { user_high_id: actor.id }] }, data: { deleted_at: now, ...K.changed(actor.id) } });
      await tx.friend_requests.updateMany({ where: { status: "pending", OR: [{ sender_id: actor.id }, { recipient_id: actor.id }] }, data: { status: "cancelled", responded_at: now, ...K.changed(actor.id) } });
      await tx.project_invitations.updateMany({ where: { status: "pending", OR: [{ sender_id: actor.id }, { recipient_id: actor.id }] }, data: { status: "cancelled", responded_at: now, ...K.changed(actor.id) } });
      await tx.users.update({ where: { id: actor.id }, data: { deleted_at: now, handle: null, nickname: null,
        biography: null, profile_photo_object_id: null, password_hash: null, visibility: "private",
        auth_version: { increment: 1 }, ...K.changed(actor.id) } });
    });
  }
}
