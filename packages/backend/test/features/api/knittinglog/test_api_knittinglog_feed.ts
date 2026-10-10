import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import typia from "typia";

import { KnittingLogApi as K } from "../../../helpers/KnittingLogApi";

async function post(actor: K.Actor): Promise<K.Post> {
  return typia.assert<K.Post>(await K.request(actor.connection, "POST", "/posts", 201, { body: `테스트 게시글 ${randomUUID()}` }), K.invalidResponse);
}

// V1-208·804~805: 게시글은 프로필 범위와 독립적이며 댓글·좋아요는 차단을 우선합니다.
export async function test_api_knittinglog_post_interactions(connection: K.Connection): Promise<void> {
  const [author, peer] = await Promise.all([K.register(connection), K.register(connection)]);
  await K.request(author.connection, "PATCH", "/users/me", 200, { visibility: "private" });
  const post = typia.assert<K.Post>(await K.request(author.connection, "POST", "/posts", 201, { body: "비공개 프로필의 공개 게시글" }), K.invalidResponse);
  const publicPosts = typia.assert<K.Post[]>(await K.request(peer.connection, "GET", `/users/${author.session.user.id}/posts`, 200), K.invalidResponse);
  assert.ok(publicPosts.some((entry) => entry.id === post.id));
  const likes = await Promise.all([0, 1].map(async () => typia.assert<K.PostLike>(await K.request(peer.connection, "PUT", `/posts/${post.id}/likes`, 200), K.invalidResponse)));
  assert.equal(likes[0]!.id, likes[1]!.id, "좋아요를 중복 생성하지 않습니다.");
  const comment = typia.assert<K.PostComment>(await K.request(peer.connection, "POST", `/posts/${post.id}/comments`, 201, { body: "게시글 댓글" }), K.invalidResponse);
  await K.error(author.connection, "DELETE", `/post-comments/${comment.id}`, 403);
  const comments = typia.assert<K.PostComment[]>(await K.request(author.connection, "GET", `/posts/${post.id}/comments`, 200), K.invalidResponse);
  assert.deepEqual(comments.map((entry) => entry.id), [comment.id]);
  await K.request(peer.connection, "DELETE", `/post-comments/${comment.id}`, 204);
  await K.request(peer.connection, "DELETE", `/posts/${post.id}/likes`, 204);
  await K.request(peer.connection, "POST", "/blocks", 201, { blocked_id: author.session.user.id });
  await K.error(peer.connection, "GET", `/users/${author.session.user.id}/posts`, 404);
  await K.error(peer.connection, "POST", `/posts/${post.id}/comments`, 404, { body: "차단 후 댓글" });
  await K.error(peer.connection, "PUT", `/posts/${post.id}/likes`, 404);
}

// V1-801~802, 확정 정책 6.4: 피드는 작성 시각과 UUID 순서를 사용하며 페이지를 중복하지 않습니다.
export async function test_api_knittinglog_feed_cursor(connection: K.Connection): Promise<void> {
  const [author, reader] = await Promise.all([K.register(connection), K.register(connection)]);
  await K.request(author.connection, "PATCH", "/users/me", 200, { visibility: "private" });
  const created: K.Post[] = [];
  for (let index = 0; index < 3; index += 1) created.push(await post(author));
  const ids = new Set(created.map((entry) => entry.id));
  const seen = new Set<string>();
  const previousCursors = new Set<string>();
  let cursor: string | null = null;
  let previous: K.Post | undefined;
  for (let page = 0; page < 10; page += 1) {
    const query: string = cursor === null ? "?limit=2" : `?limit=2&cursor=${encodeURIComponent(cursor)}`;
    const feed: K.Feed = typia.assert<K.Feed>(await K.request(reader.connection, "GET", `/feed${query}`, 200), K.invalidResponse);
    assert.ok(feed.items.length <= 2);
    for (const item of feed.items) {
      assert.ok(!seen.has(item.id), "커서 페이지가 게시글을 중복 반환했습니다.");
      assert.ok(Number.isFinite(Date.parse(item.created_at)), "게시글 작성 시각이 필요합니다.");
      if (previous !== undefined) {
        const newer = Date.parse(previous.created_at);
        const older = Date.parse(item.created_at);
        assert.ok(newer > older || (newer === older && previous.id > item.id), "피드 정렬이 작성 시각·UUID 내림차순과 다릅니다.");
      }
      previous = item;
      seen.add(item.id);
    }
    if ([...ids].every((id) => seen.has(id))) break;
    if (feed.next_cursor === null) break;
    assert.ok(feed.items.length > 0, "빈 페이지에 다음 커서를 반환했습니다.");
    assert.ok(!previousCursors.has(feed.next_cursor), "같은 커서가 반복됐습니다.");
    previousCursors.add(feed.next_cursor);
    cursor = feed.next_cursor;
  }
  assert.ok([...ids].every((id) => seen.has(id)), "비공개 프로필의 게시글도 피드에 노출해야 합니다. 테스트용 피드 규모도 확인하세요.");
}

// V1-801, V1-902: 기존 커서를 사용해도 현재 차단 상태를 다시 적용합니다.
export async function test_api_knittinglog_feed_current_block(connection: K.Connection): Promise<void> {
  const [author, reader, control] = await Promise.all([K.register(connection), K.register(connection), K.register(connection)]);
  const hidden = await post(author);
  const kept = await post(control);
  const first = typia.assert<K.Feed>(await K.request(reader.connection, "GET", "/feed?limit=1", 200), K.invalidResponse);
  assert.equal(first.items.length, 1);
  assert.ok(first.next_cursor !== null, "커서 검증에 다음 페이지가 필요합니다.");
  await K.request(reader.connection, "POST", "/blocks", 201, { blocked_id: author.session.user.id });
  await K.error(reader.connection, "GET", `/posts/${hidden.id}`, 404);
  const after = typia.assert<K.Feed>(await K.request(reader.connection, "GET", `/feed?limit=100&cursor=${encodeURIComponent(first.next_cursor)}`, 200), K.invalidResponse);
  assert.ok(!after.items.some((entry) => entry.author_id === author.session.user.id));
  const visible = typia.assert<K.Post>(await K.request(reader.connection, "GET", `/posts/${kept.id}`, 200), K.invalidResponse);
  assert.equal(visible.id, kept.id, "차단은 제3자의 게시글을 숨기지 않습니다.");
}

// V1-803~805: 작성자 삭제, 댓글 권한, 좋아요 멱등성과 부모 삭제 노출을 검증합니다.
export async function test_api_knittinglog_post_parent_deletion(connection: K.Connection): Promise<void> {
  const [author, reader] = await Promise.all([K.register(connection), K.register(connection)]);
  const created = await post(author);
  await K.error(reader.connection, "DELETE", `/posts/${created.id}`, 403);
  const edit = await K.outcome(author.connection, "PATCH", `/posts/${created.id}`, { body: "지원하지 않는 수정" });
  assert.equal(edit.status, 404, "초기 버전은 게시글 수정 API를 제공하지 않습니다.");
  const comment = typia.assert<{ id: string; post_id: string; author_id: string; body: string }>(
    await K.request(reader.connection, "POST", `/posts/${created.id}/comments`, 201, { body: "독자의 댓글" }), K.invalidResponse,
  );
  assert.equal(comment.author_id, reader.session.user.id);
  await K.error(author.connection, "DELETE", `/post-comments/${comment.id}`, 403);
  await K.request(reader.connection, "DELETE", `/post-comments/${comment.id}`, 204);
  const comments = typia.assert<{ id: string }[]>(await K.request(author.connection, "GET", `/posts/${created.id}/comments`, 200), K.invalidResponse);
  assert.ok(!comments.some((entry) => entry.id === comment.id));
  const likes = await Promise.all([0, 1].map(async () => typia.assert<{ id: string; post_id: string; user_id: string }>(
    await K.request(reader.connection, "PUT", `/posts/${created.id}/likes`, 200), K.invalidResponse,
  )));
  assert.equal(likes[0]!.id, likes[1]!.id);
  assert.equal(likes[0]!.user_id, reader.session.user.id);
  await K.request(reader.connection, "DELETE", `/posts/${created.id}/likes`, 204);
  const unchanged = typia.assert<K.Post>(await K.request(author.connection, "GET", `/posts/${created.id}`, 200), K.invalidResponse);
  assert.equal(unchanged.body, created.body);
  await K.request(author.connection, "DELETE", `/posts/${created.id}`, 204);
  await K.error(reader.connection, "GET", `/posts/${created.id}`, 404);
  await K.error(reader.connection, "POST", `/posts/${created.id}/comments`, 404, { body: "삭제 후 댓글" });
  await K.error(reader.connection, "PUT", `/posts/${created.id}/likes`, 404);
}

// 확정 정책 6.3: 탈퇴한 작성자의 게시글·댓글은 보존하고 이름만 익명화합니다.
export async function test_api_knittinglog_withdrawn_author_display(connection: K.Connection): Promise<void> {
  const [author, observer] = await Promise.all([K.register(connection), K.register(connection)]);
  const created = await post(author);
  const comment = typia.assert<K.PostComment>(await K.request(author.connection, "POST", `/posts/${created.id}/comments`, 201, { body: "탈퇴 후에도 보존할 댓글" }), K.invalidResponse);
  assert.equal(created.author_name, author.session.user.nickname);
  assert.equal(comment.author_name, author.session.user.nickname);
  await K.request(author.connection, "DELETE", "/users/me", 204);
  const retained = typia.assert<K.Post>(await K.request(observer.connection, "GET", `/posts/${created.id}`, 200), K.invalidResponse);
  assert.equal(retained.id, created.id);
  assert.equal(retained.author_id, author.session.user.id);
  assert.equal(retained.author_name, "탈퇴한 사용자");
  assert.equal(retained.body, created.body);
  const comments = typia.assert<K.PostComment[]>(await K.request(observer.connection, "GET", `/posts/${created.id}/comments`, 200), K.invalidResponse);
  const preserved = comments.find((entry) => entry.id === comment.id)!;
  assert.equal(preserved.author_name, "탈퇴한 사용자");
  assert.equal(preserved.body, comment.body);
  const feed = typia.assert<K.Feed>(await K.request(observer.connection, "GET", "/feed?limit=100", 200), K.invalidResponse);
  assert.equal(feed.items.find((entry) => entry.id === created.id)!.author_name, "탈퇴한 사용자");
}
