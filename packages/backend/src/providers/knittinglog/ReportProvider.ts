import type { Prisma, report_actions, reports } from "@prisma/sdk";
import type { tags } from "typia";

import { AuthProvider } from "./AuthProvider";
import { CommunityProvider } from "./CommunityProvider";
import { KnittingLogContext as K } from "./KnittingLogContext";
import { SocialProvider } from "./SocialProvider";

export namespace ReportProvider {
  export interface Input {
    reason_code: "spam" | "abuse" | "inappropriate" | "privacy" | "other";
    detail?: string | null;
    target_user_id?: (string & tags.Format<"uuid">) | null;
    post_id?: (string & tags.Format<"uuid">) | null;
    block_target?: boolean;
  }
  export interface Receipt {
    id: string;
    reporter_id: string;
    target_user_id: string | null;
    post_id: string | null;
    reason_code: Input["reason_code"];
    detail: string | null;
    status: "received" | "reviewing" | "closed";
  }
  export type Status = Receipt["status"];
  export interface OperatorQuery {
    status?: Status;
  }
  export interface ActionInput {
    operation_id: string & tags.Format<"uuid">;
    action_code: "review" | "close" | "hide_post";
    reason: string;
    expected_status?: Status;
  }
  export interface Action {
    id: string;
    report_id: string;
    actor_user_id: string;
    action_code: ActionInput["action_code"];
    reason: string;
    result: { status: Status; post_hidden?: boolean };
  }
  export interface Evidence {
    schema_version: number;
    handle?: string | null;
    nickname?: string | null;
    biography?: string | null;
    author_id?: string;
    body?: string;
    source_updated_at: string;
  }
  export interface Detail extends Receipt {
    target_snapshot: Evidence;
    actions: Action[];
  }

  async function operator(tx: K.Tx, authorization: string | undefined): Promise<string> {
    const actor = await AuthProvider.actor(authorization, tx);
    const configured = process.env.KNITTINGLOG_OPERATOR_USER_IDS;
    const ids = configured?.split(",").map((id) =>
      id.trim().toLowerCase(),
    ) ?? [];
    const valid = ids.length > 0 && ids.every((id) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id),
    );
    if (!valid || !ids.includes(actor.id)) {
      K.fail(403, "FORBIDDEN", "신고 운영 권한이 필요합니다.");
    }
    return actor.id;
  }

  function evidence(row: reports): Evidence {
    const value = row.target_snapshot;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      K.fail(500, "DATA_INTEGRITY", "신고 증거를 확인할 수 없습니다.");
    }
    const common = {
      schema_version: value.schema_version,
      source_updated_at: value.source_updated_at,
    };
    if (common.schema_version !== 1 || typeof common.source_updated_at !== "string") K.fail(
      500,
      "DATA_INTEGRITY",
      "신고 증거 형식이 올바르지 않습니다.",
    );
    if (row.post_id !== null) {
      if (typeof value.author_id !== "string" || typeof value.body !== "string") K.fail(
        500,
        "DATA_INTEGRITY",
        "게시글 증거를 확인할 수 없습니다.",
      );
      return {
        schema_version: 1,
        source_updated_at: common.source_updated_at,
        author_id: value.author_id,
        body: value.body,
      };
    }
    if ((value.handle !== null && typeof value.handle !== "string") ||
        (value.nickname !== null && typeof value.nickname !== "string") ||
        (value.biography !== null && typeof value.biography !== "string")) K.fail(
          500,
          "DATA_INTEGRITY",
          "사용자 증거를 확인할 수 없습니다.",
        );
    return {
      schema_version: 1,
      source_updated_at: common.source_updated_at,
      handle: value.handle,
      nickname: value.nickname,
      biography: value.biography,
    };
  }

  const actionView = (row: report_actions): Action => ({
    id: row.id,
    report_id: row.report_id,
    actor_user_id: row.created_by,
    action_code: row.action_code as ActionInput["action_code"],
    reason: row.reason,
    result: row.result as Action["result"],
  });
  async function detail(tx: K.Tx, row: reports): Promise<Detail> {
    return { id: row.id, reporter_id: row.reporter_id, target_user_id: row.target_user_id,
      post_id: row.post_id, reason_code: row.reason_code, detail: row.detail, status: row.status,
      target_snapshot: evidence(row), actions: (await tx.report_actions.findMany({ where: { report_id: row.id },
        orderBy: [{ created_at: "asc" }, { id: "asc" }],
      })).map(actionView) };
  }

  export async function queue(authorization: string | undefined, query: OperatorQuery): Promise<Detail[]> {
    K.keys(query, ["status"]);
    return K.transaction(async (tx) => {
      await operator(tx, authorization);
      const rows = await tx.reports.findMany({ where: { deleted_at: null, ...(query.status ? { status: query.status } : {}) },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
      });
      return Promise.all(rows.map((row) => detail(tx, row)));
    });
  }

  export async function inspect(authorization: string | undefined, id: string): Promise<Detail> {
    return K.transaction(async (tx) => {
      await operator(tx, authorization);
      const row = await tx.reports.findFirst({ where: { id, deleted_at: null } });
      if (!row) K.fail(404, "NOT_FOUND", "신고를 찾을 수 없습니다.");
      return detail(tx, row);
    });
  }

  export async function action(authorization: string | undefined, reportId: string, input: ActionInput): Promise<Action> {
    K.keys(input, ["operation_id", "action_code", "reason", "expected_status"]);
    if (!input.reason.trim()) K.fail(
      400,
      "INVALID_INPUT",
      "조치 사유를 입력하세요.",
    );
    return K.transaction(async (tx) => {
      const actorId = await operator(tx, authorization);
      await K.consent(tx, actorId);
      return K.command(tx, actorId, input.operation_id, "report_action", { report_id: reportId, ...input }, async () => {
        const row = await tx.reports.findFirst({ where: { id: reportId, deleted_at: null } });
        if (!row) K.fail(404, "NOT_FOUND", "신고를 찾을 수 없습니다.");
        if (input.expected_status !== undefined && row.status !== input.expected_status) K.fail(409, "REPORT_STATE", "신고 상태가 변경됐습니다.");
        if (row.status === "closed") K.fail(409, "REPORT_STATE", "종결한 신고는 변경할 수 없습니다.");
        let result: Action["result"];
        if (input.action_code === "hide_post") {
          if (row.post_id === null) K.fail(409, "REPORT_TARGET", "게시글 신고만 숨김 처리할 수 있습니다.");
          const post = await tx.posts.findUnique({ where: { id: row.post_id } });
          if (!post) K.fail(404, "NOT_FOUND", "신고 대상 게시글을 찾을 수 없습니다.");
          if (post.deleted_at === null) await tx.posts.update({ where: { id: post.id }, data: {
            deleted_at: new Date(), deletion_operation_id: input.operation_id, ...K.changed(actorId),
          } });
          result = { status: row.status, post_hidden: true };
        } else {
          if (input.action_code === "review" && row.status !== "received") K.fail(409, "REPORT_STATE", "이미 검토 중인 신고입니다.");
          const status = input.action_code === "review" ? "reviewing" : "closed";
          await tx.reports.update({ where: { id: reportId }, data: {
            status, closed_at: status === "closed" ? new Date() : null, ...K.changed(actorId),
          } });
          result = { status };
        }
        return actionView(await tx.report_actions.create({ data: {
          id: input.operation_id, report_id: reportId, action_code: input.action_code,
          reason: input.reason, result, ...K.audit(actorId),
        } }));
      });
    });
  }

  export async function create(authorization: string | undefined, input: Input): Promise<Receipt> {
    K.keys(input, [
      "reason_code",
      "detail",
      "target_user_id",
      "post_id",
      "block_target",
    ]);
    if (!(["spam", "abuse", "inappropriate", "privacy", "other"] as string[]).includes(
      input.reason_code,
    ))
      K.fail(400, "INVALID_INPUT", "신고 사유가 올바르지 않습니다.");
    const userId = input.target_user_id ?? null;
    const postId = input.post_id ?? null;
    if ((userId === null) === (postId === null)) K.fail(
      400,
      "INVALID_INPUT",
      "신고 대상은 하나만 지정해야 합니다.",
    );
    const detail = input.detail ?? null;
    if (input.reason_code === "other" && !detail?.trim()) K.fail(
      400,
      "INVALID_INPUT",
      "기타 신고는 상세 내용을 입력해야 합니다.",
    );
    return K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(authorization, tx);
      await K.consent(tx, actor.id);
      let targetId: string;
      let snapshot: Prisma.InputJsonObject;
      if (userId !== null) {
        const user = await tx.users.findFirst({ where: { id: userId, deleted_at: null } });
        if (!user || await K.blocked(tx, actor.id, userId)) K.fail(404, "NOT_FOUND", "신고 대상을 찾을 수 없습니다.");
        targetId = user.id;
        snapshot = {
          schema_version: 1, handle: user.handle, nickname: user.nickname,
          biography: user.biography, source_updated_at: user.updated_at.toISOString(),
        };
      } else {
        const post = await CommunityProvider.accessible(tx, actor.id, postId!);
        targetId = post.author_id;
        snapshot = { schema_version: 1, author_id: post.author_id, body: post.body, source_updated_at: post.updated_at.toISOString() };
      }
      const row = await tx.reports.create({ data: {
        reporter_id: actor.id, target_user_id: userId, post_id: postId,
        reason_code: input.reason_code, detail, target_snapshot: snapshot, ...K.audit(actor.id),
      } });
      if (input.block_target) await SocialProvider.blockIn(tx, actor.id, targetId);
      return { id: row.id, reporter_id: row.reporter_id, target_user_id: row.target_user_id,
        post_id: row.post_id, reason_code: row.reason_code, detail: row.detail, status: row.status };
    });
  }
}
