import { friend_requests } from "../../prisma/client";
import { KnittingLogContext as K } from "./KnittingLogContext";
import { AuthProvider } from "./AuthProvider";

export namespace SocialProvider {
  export interface Request {
    id: string;
    sender_id: string;
    recipient_id: string;
    status: "pending" | "accepted" | "rejected" | "cancelled";
  }
  export const view = (row: friend_requests): Request => ({
    id: row.id,
    sender_id: row.sender_id,
    recipient_id: row.recipient_id,
    status: row.status,
  });

  const pair = (a: string, b: string) => {
    const ids = [a, b].sort((left, right) => left.localeCompare(right));
    return { user_low_id: ids[0]!, user_high_id: ids[1]! };
  };

  export async function areFriends(tx: K.Tx, a: string, b: string): Promise<boolean> {
    return !(await K.blocked(tx, a, b)) && !!(await tx.friendships.findFirst({
      where: { ...pair(a, b), deleted_at: null },
    }));
  }

  async function link(tx: K.Tx, a: string, b: string): Promise<void> {
    const ids = pair(a, b);
    await tx.friendships.upsert({
      where: { user_low_id_user_high_id: ids },
      create: { ...ids, ...K.audit(a) },
      update: { deleted_at: null, ...K.changed(a) },
    });
  }

  async function verified(tx: K.Tx, authorization: string | undefined, write = false): Promise<string> {
    const actor = await AuthProvider.actor(authorization, tx);
    if (write) await K.consent(tx, actor.id);
    return actor.id;
  }

  export async function requests(authorization: string | undefined, query: {
    direction?: "sent" | "received"; status?: Request["status"];
  }): Promise<Request[]> {
    return K.transaction(async (tx) => {
      const actorId = await verified(tx, authorization);
      const rows = await tx.friend_requests.findMany({ where: {
        ...(query.direction === "sent" ? { sender_id: actorId } : { recipient_id: actorId }),
        ...(query.status ? { status: query.status } : {}), deleted_at: null,
      }, orderBy: [{ created_at: "desc" }, { id: "desc" }] });
      const visible: Request[] = [];
      for (const row of rows) {
        const peer = row.sender_id === actorId ? row.recipient_id : row.sender_id;
        if (!(await K.blocked(tx, actorId, peer)) && await tx.users.findFirst({ where: { id: peer, deleted_at: null } })) visible.push(view(row));
      }
      return visible;
    });
  }

  export async function badge(authorization: string | undefined): Promise<{ pending_count: number }> {
    return {
      pending_count: (await requests(authorization, { direction: "received", status: "pending" })).length,
    };
  }

  export async function request(authorization: string | undefined, recipientId: string): Promise<{ status: 200 | 201; value: Request }> {
    return K.transaction(async (tx) => {
      const actorId = await verified(tx, authorization, true);
      if (recipientId === actorId) K.fail(400, "SELF_RELATION", "자신에게 친구 요청을 보낼 수 없습니다.");
      if (!await tx.users.findFirst({ where: { id: recipientId, deleted_at: null } })) K.fail(404, "NOT_FOUND", "대상을 찾을 수 없습니다.");
      if (await K.blocked(tx, actorId, recipientId)) K.fail(403, "BLOCKED", "차단 관계에서는 요청할 수 없습니다.");
      if (await areFriends(tx, actorId, recipientId)) K.fail(409, "ALREADY_FRIENDS", "이미 친구입니다.");
      const pending = await tx.friend_requests.findFirst({ where: { deleted_at: null, status: "pending", OR: [
        { sender_id: actorId, recipient_id: recipientId }, { sender_id: recipientId, recipient_id: actorId },
      ] } });
      if (pending) {
        if (pending.sender_id === actorId) K.fail(409, "PENDING_REQUEST", "대기 중인 요청이 있습니다.");
        await link(tx, actorId, recipientId);
        const accepted = await tx.friend_requests.update({ where: { id: pending.id }, data: { status: "accepted", responded_at: new Date(), ...K.changed(actorId) } });
        return { status: 200, value: view(accepted) };
      }
      return { status: 201, value: view(await tx.friend_requests.create({ data: { sender_id: actorId, recipient_id: recipientId, ...K.audit(actorId) } })) };
    });
  }

  export async function respond(authorization: string | undefined, id: string, status: "accepted" | "rejected"): Promise<Request> {
    return K.transaction(async (tx) => {
      const actorId = await verified(tx, authorization, true);
      const row = await tx.friend_requests.findFirst({ where: { id, deleted_at: null } });
      if (!row) K.fail(404, "NOT_FOUND", "요청을 찾을 수 없습니다.");
      if (row.recipient_id !== actorId) K.fail(403, "FORBIDDEN", "수신자만 요청을 처리할 수 있습니다.");
      if (!await tx.users.findFirst({ where: { id: row.sender_id, deleted_at: null } }) || await K.blocked(tx, actorId, row.sender_id)) K.fail(403, "FORBIDDEN", "요청을 처리할 수 없습니다.");
      if (row.status !== "pending") K.fail(409, "REQUEST_STATE", "대기 중인 요청이 아닙니다.");
      if (status === "accepted") await link(tx, actorId, row.sender_id);
      return view(
        await tx.friend_requests.update({ where: { id }, data: { status, responded_at: new Date(), ...K.changed(actorId) } }),
      );
    });
  }

  export async function cancel(authorization: string | undefined, id: string): Promise<void> {
    await K.transaction(async (tx) => {
      const actorId = await verified(tx, authorization, true);
      const row = await tx.friend_requests.findFirst({ where: { id, deleted_at: null } });
      if (!row) K.fail(404, "NOT_FOUND", "요청을 찾을 수 없습니다.");
      if (row.sender_id !== actorId) K.fail(403, "FORBIDDEN", "송신자만 요청을 취소할 수 있습니다.");
      if (row.status !== "pending") K.fail(409, "REQUEST_STATE", "대기 중인 요청이 아닙니다.");
      await tx.friend_requests.update({ where: { id }, data: { status: "cancelled", responded_at: new Date(), ...K.changed(actorId) } });
    });
  }

  export async function friends(authorization: string | undefined): Promise<ReturnType<typeof K.publicUser>[]> {
    return K.transaction(async (tx) => {
      const actorId = await verified(tx, authorization);
      const rows = await tx.friendships.findMany({ where: { deleted_at: null, OR: [{ user_low_id: actorId }, { user_high_id: actorId }] } });
      const result: ReturnType<typeof K.publicUser>[] = [];
      for (const row of rows) {
        const peer = row.user_low_id === actorId
          ? row.user_high_id
          : row.user_low_id;
        const user = await tx.users.findFirst({ where: { id: peer, deleted_at: null } });
        if (user && !await K.blocked(tx, actorId, peer)) result.push(K.publicUser(user));
      }
      return result;
    });
  }

  export async function unfriend(authorization: string | undefined, userId: string): Promise<void> {
    await K.transaction(async (tx) => {
      const actorId = await verified(tx, authorization, true);
      await tx.friendships.updateMany({ where: { ...pair(actorId, userId), deleted_at: null }, data: { deleted_at: new Date(), ...K.changed(actorId) } });
    });
  }

  // 신고의 선택적 차단도 같은 트랜잭션에서 이 함수를 사용합니다.
  export async function blockIn(tx: K.Tx, actorId: string, userId: string): Promise<{ blocked_id: string }> {
    if (actorId === userId) K.fail(
      400,
      "SELF_RELATION",
      "자신을 차단할 수 없습니다.",
    );
    if (!await tx.users.findFirst({
      where: {
        id: userId,
        deleted_at: null,
      },
    })) K.fail(404, "NOT_FOUND", "대상을 찾을 수 없습니다.");
    const now = new Date();
    await tx.user_blocks.upsert({
      where: {
        blocker_id_blocked_id: { blocker_id: actorId, blocked_id: userId },
      },
      create: { blocker_id: actorId, blocked_id: userId, ...K.audit(actorId) },
      update: { deleted_at: null, ...K.changed(actorId) },
    });
    await tx.friendships.updateMany({
      where: { ...pair(actorId, userId), deleted_at: null },
      data: { deleted_at: now, ...K.changed(actorId) },
    });
    const between = [
      { sender_id: actorId, recipient_id: userId },
      { sender_id: userId, recipient_id: actorId },
    ];
    await tx.friend_requests.updateMany({
      where: { status: "pending", deleted_at: null, OR: between },
      data: { status: "cancelled", responded_at: now, ...K.changed(actorId) },
    });
    await tx.project_invitations.updateMany({
      where: { status: "pending", deleted_at: null, OR: between },
      data: { status: "cancelled", responded_at: now, ...K.changed(actorId) },
    });
    return { blocked_id: userId };
  }

  export async function block(authorization: string | undefined, userId: string): Promise<{ blocked_id: string }> {
    return K.transaction(async (tx) => {
      const actorId = await verified(tx, authorization, true);
      return blockIn(tx, actorId, userId);
    });
  }

  export async function blocks(authorization: string | undefined): Promise<ReturnType<typeof K.publicUser>[]> {
    return K.transaction(async (tx) => {
      const actorId = await verified(tx, authorization);
      const rows = await tx.user_blocks.findMany({ where: { blocker_id: actorId, deleted_at: null } });
      const result: ReturnType<typeof K.publicUser>[] = [];
      for (const row of rows) {
        const user = await tx.users.findFirst({ where: { id: row.blocked_id, deleted_at: null } });
        if (user) result.push(K.publicUser(user));
      }
      return result;
    });
  }

  export async function unblock(authorization: string | undefined, userId: string): Promise<void> {
    await K.transaction(async (tx) => {
      const actorId = await verified(tx, authorization, true);
      await tx.user_blocks.updateMany({ where: { blocker_id: actorId, blocked_id: userId, deleted_at: null }, data: { deleted_at: new Date(), ...K.changed(actorId) } });
    });
  }
}
