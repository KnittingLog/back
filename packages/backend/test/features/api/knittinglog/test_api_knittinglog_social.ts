import assert from "node:assert/strict";
import typia from "typia";

import { KnittingLogApi as K } from "../../../helpers/KnittingLogApi";

// V1-301~302, V1-305~306: 반대 방향 요청은 친구로 전환되고 대기 요청은 남지 않습니다.
export async function test_api_knittinglog_cross_friend_request(connection: K.Connection): Promise<void> {
  const [sender, recipient] = await Promise.all([K.register(connection), K.register(connection)]);
  const found = typia.assert<K.User[]>(await K.request(sender.connection, "GET", `/users?query=${encodeURIComponent(recipient.input.handle)}`, 200), K.invalidResponse);
  assert.ok(found.some((entry) => entry.id === recipient.session.user.id));
  for (const profile of found) K.publicProfile(profile);
  await K.request(sender.connection, "POST", "/friend-requests", 201, { recipient_id: recipient.session.user.id });
  const badge = typia.assert<{ pending_count: number }>(await K.request(recipient.connection, "GET", "/friend-requests/badge", 200), K.invalidResponse);
  assert.equal(badge.pending_count, 1);
  await K.request(recipient.connection, "POST", "/friend-requests", 200, { recipient_id: sender.session.user.id });
  for (const [actor, peer] of [[sender, recipient], [recipient, sender]]) {
    const friends = typia.assert<K.User[]>(await K.request(actor!.connection, "GET", "/friends", 200), K.invalidResponse);
    assert.equal(friends.filter((entry) => entry.id === peer!.session.user.id).length, 1);
    const pending = typia.assert<K.FriendRequest[]>(await K.request(actor!.connection, "GET", "/friend-requests?direction=received&status=pending", 200), K.invalidResponse);
    assert.equal(pending.length, 0);
  }
  await K.request(sender.connection, "DELETE", `/friends/${recipient.session.user.id}`, 204);
  const remaining = typia.assert<K.User[]>(await K.request(recipient.connection, "GET", "/friends", 200), K.invalidResponse);
  assert.equal(remaining.length, 0);
}

// 확정 정책 6.1: 차단은 공동 프로젝트보다 우선하고 제3자 초대와 멤버십을 보존합니다.
export async function test_api_knittinglog_shared_project_blocks(connection: K.Connection): Promise<void> {
  const [owner, member, third] = await Promise.all([K.register(connection), K.register(connection), K.register(connection)]);
  await K.befriend(owner, member);
  await K.befriend(owner, third);
  const project = await K.project(owner);
  await K.join(owner, member, project.id);
  const workspace = await K.workspace(member, project.id);
  const record = await K.record(member, workspace.id);
  await K.request(owner.connection, "POST", `/records/${record.id}/comments`, 201, { body: "차단 전에 작성한 댓글" });
  await K.request(owner.connection, "PUT", `/records/${record.id}/reactions/like`, 200);
  const anotherProject = await K.project(owner, [member.session.user.id, third.session.user.id]);
  await K.request(owner.connection, "POST", "/blocks", 201, { blocked_id: member.session.user.id });
  await K.error(owner.connection, "GET", `/records/${record.id}`, 404);
  await K.error(owner.connection, "POST", `/records/${record.id}/comments`, 404, { body: "차단 후 댓글" });
  const workspaces = typia.assert<K.Workspace[]>(await K.request(owner.connection, "GET", `/projects/${project.id}/workspaces`, 200), K.invalidResponse);
  assert.ok(!workspaces.some((entry) => entry.id === workspace.id), "차단한 진행상황은 목록에 포함하지 않습니다.");
  const hiddenComments = typia.assert<K.Comment[]>(await K.request(member.connection, "GET", `/records/${record.id}/comments`, 200), K.invalidResponse);
  const hiddenReactions = typia.assert<K.Reaction[]>(await K.request(member.connection, "GET", `/records/${record.id}/reactions`, 200), K.invalidResponse);
  assert.equal(hiddenComments.length, 0);
  assert.equal(hiddenReactions.length, 0);
  const memberships = typia.assert<K.Membership[]>(await K.request(owner.connection, "GET", `/projects/${project.id}/memberships`, 200), K.invalidResponse);
  assert.equal(memberships.length, 2, "차단은 공동 프로젝트 참여를 종료하지 않습니다.");
  const memberInvitations = typia.assert<K.Invitation[]>(await K.request(member.connection, "GET", "/project-invitations?status=pending", 200), K.invalidResponse);
  assert.ok(!memberInvitations.some((entry) => entry.project_id === anotherProject.id));
  const thirdInvitations = typia.assert<K.Invitation[]>(await K.request(third.connection, "GET", "/project-invitations?status=pending", 200), K.invalidResponse);
  assert.ok(thirdInvitations.some((entry) => entry.project_id === anotherProject.id));
}

// V1-303~304, DB-FK-004: 수신자만 처리하고 송신자만 취소할 수 있습니다.
export async function test_api_knittinglog_friend_request_authority(connection: K.Connection): Promise<void> {
  const [sender, recipient, outsider] = await Promise.all([K.register(connection), K.register(connection), K.register(connection)]);
  const sent = typia.assert<K.FriendRequest>(await K.request(sender.connection, "POST", "/friend-requests", 201, { recipient_id: recipient.session.user.id }), K.invalidResponse);
  await K.error(outsider.connection, "POST", `/friend-requests/${sent.id}/accept`, 403);
  await K.error(sender.connection, "POST", `/friend-requests/${sent.id}/accept`, 403);
  await K.error(recipient.connection, "DELETE", `/friend-requests/${sent.id}`, 403);
  const rejected = typia.assert<K.FriendRequest>(await K.request(recipient.connection, "POST", `/friend-requests/${sent.id}/reject`, 200), K.invalidResponse);
  assert.equal(rejected.status, "rejected");
  const again = typia.assert<K.FriendRequest>(await K.request(sender.connection, "POST", "/friend-requests", 201, { recipient_id: recipient.session.user.id }), K.invalidResponse);
  assert.notEqual(again.id, sent.id);
  await K.request(sender.connection, "DELETE", `/friend-requests/${again.id}`, 204);
  const inbox = typia.assert<K.FriendRequest[]>(await K.request(recipient.connection, "GET", "/friend-requests?direction=received&status=pending", 200), K.invalidResponse);
  assert.equal(inbox.length, 0);
  await K.error(sender.connection, "POST", "/friend-requests", 400, { recipient_id: sender.session.user.id });
}

// DB-FK-006, DB-DS-004: 같은 방향의 동시 요청은 대기 행을 중복 생성하지 않습니다.
export async function test_api_knittinglog_concurrent_friend_requests(connection: K.Connection): Promise<void> {
  const [sender, recipient] = await Promise.all([K.register(connection), K.register(connection)]);
  const responses = await Promise.all([0, 1].map(() => K.outcome(sender.connection, "POST", "/friend-requests", { recipient_id: recipient.session.user.id })));
  assert.deepEqual(responses.map((entry) => entry.status).sort((a, b) => a - b), [201, 409]);
  const pending = typia.assert<K.FriendRequest[]>(await K.request(recipient.connection, "GET", "/friend-requests?direction=received&status=pending", 200), K.invalidResponse);
  assert.equal(pending.length, 1);
}

// V1-902~903: 차단은 양방향 노출을 막고 반대 방향의 차단을 대신 해제하지 않습니다.
export async function test_api_knittinglog_directional_blocks(connection: K.Connection): Promise<void> {
  const [left, right] = await Promise.all([K.register(connection), K.register(connection)]);
  await K.befriend(left, right);
  await K.request(left.connection, "POST", "/blocks", 201, { blocked_id: right.session.user.id });
  for (const [actor, peer] of [[left, right], [right, left]]) {
    const friends = typia.assert<K.User[]>(await K.request(actor!.connection, "GET", "/friends", 200), K.invalidResponse);
    assert.equal(friends.length, 0);
    await K.error(actor!.connection, "GET", `/users/${peer!.session.user.id}`, 404);
    await K.error(actor!.connection, "POST", "/friend-requests", 403, { recipient_id: peer!.session.user.id });
    const found = typia.assert<K.User[]>(await K.request(actor!.connection, "GET", `/users?query=${encodeURIComponent(peer!.input.handle)}`, 200), K.invalidResponse);
    assert.ok(!found.some((entry) => entry.id === peer!.session.user.id));
  }
  await K.request(right.connection, "POST", "/blocks", 201, { blocked_id: left.session.user.id });
  await K.request(left.connection, "DELETE", `/blocks/${right.session.user.id}`, 204);
  await K.error(left.connection, "GET", `/users/${right.session.user.id}`, 404);
  await K.request(right.connection, "DELETE", `/blocks/${left.session.user.id}`, 204);
  K.publicProfile(await K.request(left.connection, "GET", `/users/${right.session.user.id}`, 200));
  const friends = typia.assert<K.User[]>(await K.request(left.connection, "GET", "/friends", 200), K.invalidResponse);
  assert.equal(friends.length, 0, "차단 해제는 친구 관계를 자동 복구하지 않습니다.");
}

// 확정 정책 6.1: 차단은 두 사용자 사이의 대기 친구 요청만 종료합니다.
export async function test_api_knittinglog_block_request_cleanup(connection: K.Connection): Promise<void> {
  const [recipient, blocked, third] = await Promise.all([K.register(connection), K.register(connection), K.register(connection)]);
  const pending = typia.assert<K.FriendRequest>(await K.request(blocked.connection, "POST", "/friend-requests", 201, {
    recipient_id: recipient.session.user.id,
  }), K.invalidResponse);
  const retained = typia.assert<K.FriendRequest>(await K.request(third.connection, "POST", "/friend-requests", 201, {
    recipient_id: recipient.session.user.id,
  }), K.invalidResponse);
  await K.request(recipient.connection, "POST", "/blocks", 201, { blocked_id: blocked.session.user.id });
  const inbox = typia.assert<K.FriendRequest[]>(await K.request(recipient.connection, "GET", "/friend-requests?direction=received&status=pending", 200), K.invalidResponse);
  assert.deepEqual(inbox.map((entry) => entry.id), [retained.id]);
  await K.error(recipient.connection, "POST", `/friend-requests/${pending.id}/accept`, 403);
  const badge = typia.assert<{ pending_count: number }>(await K.request(recipient.connection, "GET", "/friend-requests/badge", 200), K.invalidResponse);
  assert.equal(badge.pending_count, 1);
  await K.request(recipient.connection, "DELETE", `/blocks/${blocked.session.user.id}`, 204);
  const afterUnblock = typia.assert<K.FriendRequest[]>(await K.request(recipient.connection, "GET", "/friend-requests?direction=received&status=pending", 200), K.invalidResponse);
  assert.deepEqual(afterUnblock.map((entry) => entry.id), [retained.id], "차단 해제로 대기 요청을 복구하지 않습니다.");
}
