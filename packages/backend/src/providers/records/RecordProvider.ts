import type {
  project_records,
  record_comments,
  record_reactions,
} from "@prisma/sdk";
import { randomUUID } from "node:crypto";

import { AuthProvider } from "../auth/AuthProvider";
import { KnittingLogContext as K } from "../common/KnittingLogContext";

export namespace RecordProvider {
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
  export interface Comment {
    id: string;
    record_id: string;
    author_id: string;
    author_name: string;
    body: string;
  }
  export interface Reaction {
    id: string;
    record_id: string;
    user_id: string;
    emoji_code: string;
  }
  export interface Create {
    source: "manual" | "timer";
    body: string | null;
    duration_seconds: number;
    recorded_at: string;
  }
  export interface Update {
    body?: string | null;
    duration_seconds?: number;
  }
  export interface Text {
    body: string;
  }

  export const view = (row: project_records, author_name: string): Record => ({
    id: row.id,
    workspace_id: row.workspace_id,
    author_id: row.author_id,
    author_name,
    source: row.source,
    body: row.body,
    duration_seconds: row.duration_seconds,
    recorded_at: row.recorded_at.toISOString(),
  });
  const commentView = (row: record_comments, author_name: string): Comment => ({
    id: row.id,
    record_id: row.record_id,
    author_id: row.author_id,
    author_name,
    body: row.body,
  });
  const reactionView = (row: record_reactions): Reaction => ({
    id: row.id,
    record_id: row.record_id,
    user_id: row.user_id,
    emoji_code: row.emoji_code,
  });

  export function duration(seconds: number): void {
    if (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > 2147483647)
      K.fail(400, "INVALID_INPUT", "작업 시간은 0 이상의 정수 초여야 합니다.");
  }

  export function text(body: string): void {
    if (!body.trim() || body.length > 20_000) K.fail(
      400,
      "INVALID_INPUT",
      "본문의 길이가 올바르지 않습니다.",
    );
  }

  export async function accessible(tx: K.Tx, actorId: string, id: string) {
    const record = await tx.project_records.findFirst({
      where: { id, deleted_at: null },
    });
    if (!record) K.fail(404, "NOT_FOUND", "기록을 찾을 수 없습니다.");
    const workspace = await K.workspace(tx, actorId, record.workspace_id);
    if (await K.blocked(tx, actorId, record.author_id)) {
      K.fail(404, "NOT_FOUND", "기록을 찾을 수 없습니다.");
    }
    return { record, workspace };
  }

  export function list(auth: string | undefined, workspaceId: string): Promise<Record[]> {
    return K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(auth, tx);
      await K.workspace(tx, actor.id, workspaceId);
      const rows = await tx.project_records.findMany({ where: { workspace_id: workspaceId, deleted_at: null }, orderBy: [{ recorded_at: "desc" }, { id: "desc" }] });
      const visible: Record[] = [];
      for (const row of rows) if (!await K.blocked(tx, actor.id, row.author_id)) visible.push(view(row, await K.authorName(tx, row.author_id)));
      return visible;
    });
  }

  export function get(auth: string | undefined, id: string): Promise<Record> {
    return K.transaction(async (tx) => {
      const { record } = await accessible(tx, (await AuthProvider.actor(auth, tx)).id, id);
      return view(record, await K.authorName(tx, record.author_id));
    });
  }

  export function create(auth: string | undefined, workspaceId: string, input: Create): Promise<Record> {
    K.keys(input, ["source", "body", "duration_seconds", "recorded_at"]);
    duration(input.duration_seconds);
    if (input.body !== null && input.body.length > 20_000) K.fail(
      400,
      "INVALID_INPUT",
      "본문이 너무 깁니다.",
    );
    const recorded_at = new Date(input.recorded_at);
    if (!Number.isFinite(recorded_at.getTime())) {
      K.fail(400, "INVALID_INPUT", "기록 시각이 올바르지 않습니다.");
    }
    return K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(auth, tx);
      const workspace = await K.workspace(tx, actor.id, workspaceId, true);
      if (workspace.status === "done") K.fail(409, "WORKSPACE_DONE", "완료한 작업 공간에는 새 기록을 추가할 수 없습니다.");
      const row = await tx.project_records.create({ data: { workspace_id: workspace.id, author_id: actor.id, source: input.source, body: input.body, duration_seconds: input.duration_seconds, recorded_at, ...K.audit(actor.id) } });
      await K.bump(tx, workspace.id, actor.id);
      return view(row, actor.nickname ?? "");
    });
  }

  export function update(auth: string | undefined, id: string, input: Update): Promise<Record> {
    K.keys(input, ["body", "duration_seconds"]);
    if (input.duration_seconds !== undefined) duration(input.duration_seconds);
    if (input.body !== undefined && input.body !== null && input.body.length > 20_000) K.fail(
      400,
      "INVALID_INPUT",
      "본문이 너무 깁니다.",
    );
    return K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(auth, tx);
      const { record, workspace } = await accessible(tx, actor.id, id);
      await K.consent(tx, actor.id);
      if (record.author_id !== actor.id) K.fail(403, "FORBIDDEN", "본인의 기록만 변경할 수 있습니다.");
      const updated = await tx.project_records.update({ where: { id }, data: { ...input, ...K.changed(actor.id) } });
      await K.bump(tx, workspace.id, actor.id);
      return view(updated, actor.nickname ?? "");
    });
  }

  export function remove(auth: string | undefined, id: string): Promise<void> {
    return K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(auth, tx);
      const { record, workspace } = await accessible(tx, actor.id, id);
      await K.consent(tx, actor.id);
      if (record.author_id !== actor.id) K.fail(403, "FORBIDDEN", "본인의 기록만 삭제할 수 있습니다.");
      await tx.project_records.update({ where: { id }, data: { deleted_at: new Date(), deletion_operation_id: randomUUID(), ...K.changed(actor.id) } });
      await K.bump(tx, workspace.id, actor.id);
    });
  }

  export function comments(auth: string | undefined, id: string): Promise<Comment[]> {
    return K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(auth, tx);
      await accessible(tx, actor.id, id);
      const rows = await tx.record_comments.findMany({ where: { record_id: id, deleted_at: null }, orderBy: [{ created_at: "asc" }, { id: "asc" }] });
      const visible: Comment[] = [];
      for (const row of rows) if (!await K.blocked(tx, actor.id, row.author_id)) visible.push(commentView(row, await K.authorName(tx, row.author_id)));
      return visible;
    });
  }

  export function comment(auth: string | undefined, id: string, input: Text): Promise<Comment> {
    K.keys(input, ["body"]);
    text(input.body);
    return K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(auth, tx);
      const { workspace } = await accessible(tx, actor.id, id);
      await K.consent(tx, actor.id);
      const row = await tx.record_comments.create({ data: { record_id: id, author_id: actor.id, body: input.body, ...K.audit(actor.id) } });
      await K.bump(tx, workspace.id, actor.id);
      return commentView(row, actor.nickname ?? "");
    });
  }

  export function removeComment(auth: string | undefined, id: string): Promise<void> {
    return K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(auth, tx);
      const comment = await tx.record_comments.findFirst({ where: { id, deleted_at: null } });
      if (!comment) K.fail(404, "NOT_FOUND", "댓글을 찾을 수 없습니다.");
      const { workspace } = await accessible(tx, actor.id, comment.record_id);
      await K.consent(tx, actor.id);
      if (comment.author_id !== actor.id) K.fail(403, "FORBIDDEN", "본인의 댓글만 삭제할 수 있습니다.");
      await tx.record_comments.update({ where: { id }, data: { deleted_at: new Date(), deletion_operation_id: randomUUID(), ...K.changed(actor.id) } });
      await K.bump(tx, workspace.id, actor.id);
    });
  }

  export function reactions(auth: string | undefined, id: string): Promise<Reaction[]> {
    return K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(auth, tx);
      await accessible(tx, actor.id, id);
      const rows = await tx.record_reactions.findMany({ where: { record_id: id, deleted_at: null } });
      const visible: Reaction[] = [];
      for (const row of rows) if (!await K.blocked(tx, actor.id, row.user_id)) visible.push(reactionView(row));
      return visible;
    });
  }

  export function react(auth: string | undefined, id: string, emoji: string, remove = false): Promise<Reaction> {
    const allowed = ["like", "heart", "clap", "celebrate", "wow"] as const;
    if (!(allowed as readonly string[]).includes(emoji)) {
      K.fail(400, "INVALID_INPUT", "허용하지 않은 반응 코드입니다.");
    }
    const emoji_code = emoji as typeof allowed[number];
    return K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(auth, tx);
      const { workspace } = await accessible(tx, actor.id, id);
      await K.consent(tx, actor.id);
      const existing = await tx.record_reactions.findUnique({ where: { record_id_user_id_emoji_code: { record_id: id, user_id: actor.id, emoji_code } } });
      const row = existing
        ? await tx.record_reactions.update({ where: { id: existing.id }, data: { deleted_at: remove ? new Date() : null, ...K.changed(actor.id) } })
        : await tx.record_reactions.create({ data: { record_id: id, user_id: actor.id, emoji_code, deleted_at: remove ? new Date() : null, ...K.audit(actor.id) } });
      await K.bump(tx, workspace.id, actor.id);
      return reactionView(row);
    });
  }
}
