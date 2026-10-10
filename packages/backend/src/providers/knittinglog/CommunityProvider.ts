import type { post_comments, post_likes, posts, Prisma } from "@prisma/sdk";
import { randomUUID } from "node:crypto";
import type { tags } from "typia";

import { AuthProvider } from "./AuthProvider";
import { KnittingLogContext as K } from "./KnittingLogContext";

export namespace CommunityProvider {
  export interface Post {
    id: string;
    author_id: string;
    author_name: string;
    body: string;
    created_at: string;
  }
  export interface Comment {
    id: string;
    post_id: string;
    author_id: string;
    author_name: string;
    body: string;
  }
  export interface Like {
    id: string;
    post_id: string;
    user_id: string;
  }
  export interface Body {
    body: string;
  }
  export interface Query {
    limit?: number & tags.Type<"uint32"> & tags.Minimum<1> & tags.Maximum<100>;
    cursor?: string;
  }
  export interface Feed {
    items: Post[];
    next_cursor: string | null;
  }

  async function authorName(tx: K.Tx, id: string): Promise<string> {
    const user = await tx.users.findUnique({ where: { id } });
    if (!user) K.fail(
      500,
      "DATA_INTEGRITY",
      "작성자 참조를 확인할 수 없습니다.",
    );
    return K.publicUser(user).nickname;
  }
  export const view = async (tx: K.Tx, row: posts): Promise<Post> => ({
    id: row.id,
    author_id: row.author_id,
    author_name: await authorName(tx, row.author_id),
    body: row.body,
    created_at: row.created_at.toISOString(),
  });
  const commentView = async (tx: K.Tx, row: post_comments): Promise<Comment> => ({
    id: row.id,
    post_id: row.post_id,
    author_id: row.author_id,
    author_name: await authorName(tx, row.author_id),
    body: row.body,
  });
  const likeView = (row: post_likes): Like => ({
    id: row.id,
    post_id: row.post_id,
    user_id: row.user_id,
  });

  function body(input: Body): void {
    K.keys(input, ["body"]);
    if (!input.body.trim()) K.fail(400, "INVALID_INPUT", "본문을 입력하세요.");
  }

  // 접수·댓글·좋아요도 잠금 후 동일한 부모 접근 검사를 사용합니다.
  export async function accessible(tx: K.Tx, actorId: string, id: string): Promise<posts> {
    const post = await tx.posts.findFirst({ where: { id, deleted_at: null } });
    if (!post || await K.blocked(tx, actorId, post.author_id))
      K.fail(404, "NOT_FOUND", "게시글을 찾을 수 없습니다.");
    return post;
  }

  export async function get(authorization: string | undefined, id: string): Promise<Post> {
    return K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(authorization, tx);
      return view(tx, await accessible(tx, actor.id, id));
    });
  }

  export async function create(authorization: string | undefined, input: Body): Promise<Post> {
    body(input);
    return K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(authorization, tx);
      await K.consent(tx, actor.id);
      return view(
        tx,
        await tx.posts.create({ data: { author_id: actor.id, body: input.body, ...K.audit(actor.id) } }),
      );
    });
  }

  export async function remove(authorization: string | undefined, id: string): Promise<void> {
    await K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(authorization, tx);
      await K.consent(tx, actor.id);
      const post = await accessible(tx, actor.id, id);
      if (post.author_id !== actor.id) K.fail(403, "FORBIDDEN", "작성자만 게시글을 삭제할 수 있습니다.");
      // 부모 삭제는 댓글의 직접 삭제 상태를 바꾸지 않습니다.
      await tx.posts.update({ where: { id }, data: {
        deleted_at: new Date(), deletion_operation_id: randomUUID(), ...K.changed(actor.id),
      } });
    });
  }

  export async function byUser(authorization: string | undefined, userId: string): Promise<Post[]> {
    return K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(authorization, tx);
      if (!await tx.users.findFirst({ where: { id: userId, deleted_at: null } }) || await K.blocked(tx, actor.id, userId))
        K.fail(404, "NOT_FOUND", "사용자를 찾을 수 없습니다.");
      const rows = await tx.posts.findMany({ where: { author_id: userId, deleted_at: null },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
      });
      return Promise.all(rows.map((row) => view(tx, row)));
    });
  }

  function cursor(input: string): { created_at: Date; id: string } {
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(input)) {
        throw new Error("커서 인코딩이 올바르지 않습니다.");
      }
      const decoded: unknown = JSON.parse(
        Buffer.from(input, "base64url").toString("utf8"),
      );
      if (!Array.isArray(decoded) || decoded.length !== 2 ||
          typeof decoded[0] !== "string" || typeof decoded[1] !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            decoded[1],
          )) throw new Error("커서 필드가 올바르지 않습니다.");
      const date = new Date(decoded[0]);
      if (!Number.isFinite(
        date.getTime(),
      ) || date.toISOString() !== decoded[0]) throw new Error(
        "커서 시각이 올바르지 않습니다.",
      );
      return { created_at: date, id: decoded[1] };
    } catch {
      return K.fail(400, "INVALID_CURSOR", "피드 커서가 올바르지 않습니다.");
    }
  }

  export async function feed(authorization: string | undefined, query: Query): Promise<Feed> {
    K.keys(query, ["limit", "cursor"]);
    const limit = query.limit ?? 20;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      K.fail(400, "INVALID_INPUT", "피드 조회 수는 1~100이어야 합니다.");
    const boundary = query.cursor === undefined
      ? undefined
      : cursor(query.cursor);
    return K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(authorization, tx);
      const blocks = await tx.user_blocks.findMany({ where: {
        deleted_at: null, OR: [{ blocker_id: actor.id }, { blocked_id: actor.id }],
      } });
      const excluded = blocks.map((entry) => entry.blocker_id === actor.id ? entry.blocked_id : entry.blocker_id);
      const where: Prisma.postsWhereInput = {
        deleted_at: null, author_id: { notIn: excluded },
        ...(boundary ? { OR: [
          { created_at: { lt: boundary.created_at } },
          { created_at: boundary.created_at, id: { lt: boundary.id } },
        ] } : {}),
      };
      const rows = await tx.posts.findMany({ where, orderBy: [{ created_at: "desc" }, { id: "desc" }], take: limit + 1 });
      const items = await Promise.all(rows.slice(0, limit).map((row) => view(tx, row)));
      const last = items[items.length - 1];
      const next_cursor = rows.length > limit && last ? Buffer.from(JSON.stringify([last.created_at, last.id])).toString("base64url") : null;
      return { items, next_cursor };
    });
  }

  export async function comments(authorization: string | undefined, postId: string): Promise<Comment[]> {
    return K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(authorization, tx);
      await accessible(tx, actor.id, postId);
      const comments = await tx.post_comments.findMany({ where: { post_id: postId, deleted_at: null },
        orderBy: [{ created_at: "asc" }, { id: "asc" }],
      });
      const result: Comment[] = [];
      for (const entry of comments) if (!await K.blocked(tx, actor.id, entry.author_id)) result.push(await commentView(tx, entry));
      return result;
    });
  }

  export async function comment(authorization: string | undefined, postId: string, input: Body): Promise<Comment> {
    body(input);
    return K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(authorization, tx);
      await K.consent(tx, actor.id);
      await accessible(tx, actor.id, postId);
      return commentView(
        tx,
        await tx.post_comments.create({ data: { post_id: postId, author_id: actor.id, body: input.body, ...K.audit(actor.id) } }),
      );
    });
  }

  export async function removeComment(authorization: string | undefined, id: string): Promise<void> {
    await K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(authorization, tx);
      await K.consent(tx, actor.id);
      const row = await tx.post_comments.findFirst({ where: { id, deleted_at: null } });
      if (!row) K.fail(404, "NOT_FOUND", "댓글을 찾을 수 없습니다.");
      await accessible(tx, actor.id, row.post_id);
      if (await K.blocked(tx, actor.id, row.author_id)) K.fail(404, "NOT_FOUND", "댓글을 찾을 수 없습니다.");
      if (row.author_id !== actor.id) K.fail(403, "FORBIDDEN", "작성자만 댓글을 삭제할 수 있습니다.");
      await tx.post_comments.update({ where: { id }, data: { deleted_at: new Date(), deletion_operation_id: randomUUID(), ...K.changed(actor.id) } });
    });
  }

  export async function like(authorization: string | undefined, postId: string): Promise<Like> {
    return K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(authorization, tx);
      await K.consent(tx, actor.id);
      await accessible(tx, actor.id, postId);
      const row = await tx.post_likes.upsert({
        where: { post_id_user_id: { post_id: postId, user_id: actor.id } },
        create: { post_id: postId, user_id: actor.id, ...K.audit(actor.id) },
        update: { deleted_at: null, ...K.changed(actor.id) },
      });
      return likeView(row);
    });
  }

  export async function unlike(authorization: string | undefined, postId: string): Promise<void> {
    await K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(authorization, tx);
      await K.consent(tx, actor.id);
      await accessible(tx, actor.id, postId);
      await tx.post_likes.updateMany({ where: { post_id: postId, user_id: actor.id, deleted_at: null },
        data: { deleted_at: new Date(), ...K.changed(actor.id) },
      });
    });
  }
}
