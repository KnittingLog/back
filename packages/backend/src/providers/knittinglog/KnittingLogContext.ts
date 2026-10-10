import { HttpException } from "@nestjs/common";
import { Prisma, users } from "@prisma/sdk";
import { createHash } from "node:crypto";

import { MyGlobal } from "../../MyGlobal";

export namespace KnittingLogContext {
  export type Tx = Prisma.TransactionClient;

  export function fail(status: number, code: string, message: string): never {
    throw new HttpException({ code, message }, status);
  }

  export function audit(actorId: string) {
    const now = new Date();
    return {
      created_by: actorId,
      updated_by: actorId,
      created_at: now,
      updated_at: now,
    };
  }
  export const changed = (actorId: string) => ({
    updated_by: actorId,
    updated_at: new Date(),
  });

  export async function transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await MyGlobal.prisma.$transaction(async (tx) => {
          // 초기 버전은 공통 잠금을 먼저 획득합니다. 잠금 세분화는 별도 성능 변경으로 검증합니다.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(704251, 1)`;
          return work(tx);
        }, { maxWait: 10_000, timeout: 30_000 });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
        throw error;
      }
    }
  }

  export async function active(tx: Tx, actorId: string): Promise<users> {
    const actor = await tx.users.findFirst({
      where: { id: actorId, deleted_at: null },
    });
    if (!actor) fail(401, "UNAUTHORIZED", "유효한 계정이 필요합니다.");
    return actor;
  }

  export async function blocked(tx: Tx, left: string, right: string): Promise<boolean> {
    if (left === right) return false;
    return await tx.user_blocks.count({
      where: {
        deleted_at: null,
        OR: [
          { blocker_id: left, blocked_id: right },
          { blocker_id: right, blocked_id: left },
        ],
      },
    }) > 0;
  }

  export function publicUser(user: users) {
    return {
      id: user.id,
      handle: user.deleted_at ? "" : (user.handle ?? ""),
      nickname: user.deleted_at ? "탈퇴한 사용자" : (user.nickname ?? ""),
      biography: user.deleted_at ? null : user.biography,
      visibility: user.visibility,
    };
  }

  export async function authorName(tx: Tx, userId: string): Promise<string> {
    const author = await tx.users.findUnique({
      where: { id: userId },
      select: { nickname: true, deleted_at: true },
    });
    return !author || author.deleted_at
      ? "탈퇴한 사용자"
      : (author.nickname ?? "");
  }

  export async function consent(tx: Tx, actorId: string): Promise<void> {
    const documents = await tx.policy_documents.findMany({
      where: {
        deleted_at: null,
        language: "ko",
        effective_at: { lte: new Date() },
      },
      orderBy: { effective_at: "desc" },
    });
    if (!documents.length) fail(
      503,
      "POLICY_UNAVAILABLE",
      "현재 정책 문서를 확인할 수 없습니다.",
    );
    const seen = new Set<string>();
    const consents = await tx.policy_consents.findMany({
      where: { user_id: actorId, deleted_at: null },
      include: { document: true },
    });
    for (const document of documents) {
      if (seen.has(document.code)) continue;
      seen.add(document.code);
      const required = documents.find(
        (entry) => entry.code === document.code && entry.requires_reconsent,
      );
      const agreed = consents.some((entry) => entry.document.code === document.code && entry.document.language === "ko" &&
        entry.document.effective_at <= document.effective_at &&
        (!required || entry.document.effective_at >= required.effective_at));
      if (!agreed) fail(
        403,
        "CONSENT_REQUIRED",
        "현재 정책에 동의해야 합니다.",
      );
    }
  }

  export async function workspace(tx: Tx, actorId: string, id: string, write = false) {
    await active(tx, actorId);
    const workspace = await tx.project_workspaces.findFirst({
      where: { id, deleted_at: null },
    });
    if (!workspace) fail(404, "NOT_FOUND", "작업 공간을 찾을 수 없습니다.");
    const project = await tx.projects.findFirst({
      where: { id: workspace.project_id, deleted_at: null, terminated_at: null },
    });
    const membership = await tx.project_memberships.findFirst({
      where: {
        project_id: workspace.project_id,
        user_id: actorId,
        left_at: null,
        deleted_at: null,
      },
    });
    if (!project || !membership || await blocked(
      tx,
      actorId,
      workspace.owner_user_id,
    ))
      fail(404, "NOT_FOUND", "작업 공간을 찾을 수 없습니다.");
    const owner = await tx.users.findFirst({
      where: { id: workspace.owner_user_id, deleted_at: null },
    });
    const ownerMembership = await tx.project_memberships.findFirst({
      where: {
        project_id: workspace.project_id,
        user_id: workspace.owner_user_id,
        left_at: null,
        deleted_at: null,
      },
    });
    if (!owner || !ownerMembership) fail(
      404,
      "NOT_FOUND",
      "작업 공간을 찾을 수 없습니다.",
    );
    if (write) {
      await consent(tx, actorId);
      if (workspace.owner_user_id !== actorId) fail(
        403,
        "FORBIDDEN",
        "본인의 작업 공간만 변경할 수 있습니다.",
      );
    }
    return workspace;
  }

  export const version = (actual: number, expected: number): void => {
    if (!Number.isSafeInteger(expected) || expected < 0) fail(
      400,
      "INVALID_INPUT",
      "변경 번호가 올바르지 않습니다.",
    );
    if (actual !== expected) fail(
      409,
      "VERSION_CONFLICT",
      "작업 공간이 변경됐습니다.",
    );
  };

  export async function bump(tx: Tx, workspaceId: string, actorId: string): Promise<void> {
    await tx.project_workspaces.update({
      where: { id: workspaceId },
      data: { version: { increment: 1 }, ...changed(actorId) },
    });
  }

  function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value !== null && typeof value === "object") return Object.fromEntries(
      Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(
        ([key, entry]) => [key, canonical(entry)],
      ),
    );
    return value;
  }

  export async function command<T>(tx: Tx, actorId: string, id: string, kind: string, input: unknown, work: () => Promise<T>): Promise<T> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      id,
    ))
      fail(400, "INVALID_INPUT", "작업 식별자가 올바르지 않습니다.");
    const hash = createHash("sha256").update(JSON.stringify(canonical(input))).digest(
      "hex",
    );
    const previous = await tx.command_receipts.findUnique({ where: { id } });
    if (previous) {
      if (previous.actor_user_id !== actorId || previous.command_type !== kind || previous.request_hash !== hash)
        fail(409, "OPERATION_CONFLICT", "작업 식별자의 입력이 다릅니다.");
      return (previous.result as { value: T }).value;
    }
    const result = await work();
    await tx.command_receipts.create({
      data: {
        id,
        actor_user_id: actorId,
        command_type: kind,
        request_hash: hash,
        result: { value: JSON.parse(JSON.stringify(result ?? null)) } as Prisma.InputJsonValue,
        ...audit(actorId),
      },
    });
    return result;
  }

  export function keys(input: object, allowed: string[]): void {
    if (Object.keys(input).some((key) => !allowed.includes(key)))
      fail(400, "INVALID_INPUT", "허용하지 않은 입력 필드입니다.");
  }
}
