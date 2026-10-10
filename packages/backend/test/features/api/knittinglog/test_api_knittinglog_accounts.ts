import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import typia from "typia";

import { KnittingLogApi as K } from "../../../helpers/KnittingLogApi";

// V1-101~104, V1-108: 고유 계정과 정책 버전 동의를 검증합니다.
export async function test_api_knittinglog_registration(connection: K.Connection): Promise<void> {
  const actor = await K.register(connection);
  assert.equal(actor.session.user.handle, actor.input.handle);
  assert.equal(actor.session.user.nickname, actor.input.nickname);
  assert.equal(actor.session.user.visibility, "public");
  const consents = typia.assert<K.Consent[]>(await K.request(actor.connection, "GET", "/users/me/policy-consents", 200), K.invalidResponse);
  assert.deepEqual(consents.map((entry) => entry.policy_document_id).sort((a, b) => a.localeCompare(b)), [...actor.input.policy_document_ids].sort((a, b) => a.localeCompare(b)));
  for (const consent of consents) {
    assert.equal(consent.user_id, actor.session.user.id);
    assert.ok(Number.isFinite(Date.parse(consent.agreed_at)), "동의 시각이 필요합니다.");
  }
  await K.error(connection, "POST", "/auth/register", 409, { ...actor.input, handle: K.identifier() });
  await K.error(connection, "POST", "/auth/register", 409, { ...actor.input, login_id: K.identifier() });
  const observer = await K.register(connection);
  const profile = K.publicProfile(await K.request(observer.connection, "GET", `/users/${actor.session.user.id}`, 200));
  assert.equal(profile.id, actor.session.user.id);
  assert.ok(!JSON.stringify(profile).includes(actor.input.login_id), "로그인 ID가 공개됐습니다.");
}

// V1-105~106, V1-109: 로그인 실패는 계정 존재를 노출하지 않고 폐기한 토큰을 거부합니다.
export async function test_api_knittinglog_auth_session(connection: K.Connection): Promise<void> {
  const actor = await K.register(connection);
  const unknown = await K.error(connection, "POST", "/auth/login", 401, { login_id: K.identifier(), password: actor.input.password });
  const mismatch = await K.error(connection, "POST", "/auth/login", 401, { login_id: actor.input.login_id, password: `Wrong!${randomUUID()}` });
  assert.ok(unknown.code === mismatch.code && unknown.message === mismatch.message, "로그인 실패가 계정 존재를 구분합니다.");
  const login = typia.assert<K.Session>(await K.request(connection, "POST", "/auth/login", 200, {
    login_id: actor.input.login_id, password: actor.input.password,
  }), K.invalidResponse);
  assert.equal(login.user.id, actor.session.user.id);
  const refreshed = typia.assert<K.Session>(await K.request(connection, "POST", "/auth/refresh", 200, { refresh_token: login.refresh_token }), K.invalidResponse);
  assert.equal(refreshed.user.id, actor.session.user.id);
  assert.ok(refreshed.access_token.length > 0 && refreshed.refresh_token.length > 0, "갱신 토큰이 필요합니다.");
  const authenticated = { ...connection, headers: { Authorization: `Bearer ${refreshed.access_token}` } };
  await K.request(authenticated, "POST", "/auth/logout", 204, { refresh_token: refreshed.refresh_token });
  await K.error(authenticated, "GET", "/users/me", 401);
  await K.error(connection, "POST", "/auth/refresh", 401, { refresh_token: refreshed.refresh_token });
}

// V1-110: 탈퇴한 계정은 기존 세션으로 업무 접근과 토큰 갱신을 할 수 없습니다.
export async function test_api_knittinglog_account_withdrawal(connection: K.Connection): Promise<void> {
  const actor = await K.register(connection);
  await K.request(actor.connection, "DELETE", "/users/me", 204);
  await K.error(actor.connection, "GET", "/users/me", 401);
  await K.error(connection, "POST", "/auth/refresh", 401, { refresh_token: actor.session.refresh_token });
  await K.error(connection, "POST", "/auth/login", 401, { login_id: actor.input.login_id, password: actor.input.password });
  await K.error(connection, "POST", "/auth/recovery", 401, {
    login_id: actor.input.login_id, recovery_code: actor.session.recovery_code, password: `새 비밀번호 ${randomUUID()}`,
  });
  await K.error(connection, "POST", "/auth/register", 409, { ...actor.input, handle: K.identifier() });
  await K.error(connection, "POST", "/auth/register", 409, { ...actor.input, login_id: K.identifier() });
}

// V1-201~203, V1-206: 공개 ID와 소개는 변경할 수 있지만 감사 주체는 입력할 수 없습니다.
export async function test_api_knittinglog_profile(connection: K.Connection): Promise<void> {
  const actor = await K.register(connection);
  const peer = await K.register(connection);
  for (const visibility of ["private", "friends", "public"] as const) {
    const profile = K.publicProfile(await K.request(actor.connection, "PATCH", "/users/me", 200, { visibility }));
    assert.equal(profile.visibility, visibility);
  }
  const handle = K.identifier();
  const profile = K.publicProfile(await K.request(actor.connection, "PATCH", "/users/me", 200, { handle, biography: "새 소개" }));
  assert.equal(profile.handle, handle);
  assert.equal(profile.biography, "새 소개");
  await K.error(actor.connection, "PATCH", "/users/me", 409, { handle: peer.session.user.handle });
  await K.error(actor.connection, "PATCH", "/users/me", 400, { created_by: peer.session.user.id });
  const current = K.publicProfile(await K.request(actor.connection, "GET", "/users/me", 200));
  assert.equal(current.handle, handle);
  await K.error(peer.connection, "PATCH", "/users/me", 409, { handle: actor.input.handle });
  const returned = K.publicProfile(await K.request(actor.connection, "PATCH", "/users/me", 200, { handle: actor.input.handle }));
  assert.equal(returned.handle, actor.input.handle, "같은 계정의 과거 handle 복귀를 허용합니다.");
  await K.error(actor.connection, "PATCH", "/users/me", 400, { login_id: K.identifier() });
}

// 확정 정책 6.3: 식별자 정규화와 비밀번호 원문 처리를 검증합니다.
export async function test_api_knittinglog_account_validation(connection: K.Connection): Promise<void> {
  const actor = await K.register(connection);
  for (const invalid of ["ab", "a".repeat(33), "_abc", "abc_", "a..b", "한글계정", "a-b"]) {
    await K.error(connection, "POST", "/auth/register", 400, {
      ...actor.input, login_id: invalid, handle: K.identifier(),
    });
    await K.error(actor.connection, "PATCH", "/users/me", 400, { handle: invalid });
  }
  for (const password of ["short", "x".repeat(129), "passwordpassword"]) {
    await K.error(connection, "POST", "/auth/register", 400, {
      ...actor.input, login_id: K.identifier(), handle: K.identifier(), password,
    });
  }
  const identifier = K.identifier();
  const password = ` 공백과Unicode비밀번호_${randomUUID()} `;
  const normalized = typia.assert<K.RecoverySession>(await K.request(connection, "POST", "/auth/register", 201, {
    ...actor.input, login_id: ` ${identifier.toUpperCase()} `, handle: ` ${identifier.toUpperCase()} `, password,
  }), K.invalidResponse);
  assert.equal(normalized.user.handle, identifier);
  await K.request(connection, "POST", "/auth/login", 200, { login_id: identifier, password });
  await K.error(connection, "POST", "/auth/login", 401, { login_id: identifier, password: password.trim() });
  await K.error(connection, "POST", "/auth/register", 409, {
    ...actor.input, login_id: identifier, handle: K.identifier(),
  });
}

// V1-107, 확정 정책 6.3: 복구 코드는 한 번 사용하며 모든 이전 세션을 무효화합니다.
export async function test_api_knittinglog_password_recovery(connection: K.Connection): Promise<void> {
  const actor = await K.register(connection);
  const password = `새 비밀번호 ${randomUUID()}`;
  const payload = { login_id: actor.input.login_id, recovery_code: actor.session.recovery_code, password };
  await K.error(connection, "POST", "/auth/recovery", 401, { ...payload, recovery_code: randomUUID() });
  const recovered = typia.assert<K.RecoverySession>(await K.request(connection, "POST", "/auth/recovery", 200, payload), K.invalidResponse);
  assert.equal(recovered.user.id, actor.session.user.id);
  assert.ok(recovered.recovery_code.length >= 20 && recovered.recovery_code !== actor.session.recovery_code, "복구는 새 코드를 발급합니다.");
  await K.error(connection, "POST", "/auth/recovery", 401, payload);
  await K.error(actor.connection, "GET", "/users/me", 401);
  await K.error(connection, "POST", "/auth/refresh", 401, { refresh_token: actor.session.refresh_token });
  await K.error(connection, "POST", "/auth/login", 401, { login_id: actor.input.login_id, password: actor.input.password });
  const authenticated = { ...connection, headers: { Authorization: `Bearer ${recovered.access_token}` } };
  await K.error(authenticated, "POST", "/auth/recovery-code", 401, { password: actor.input.password });
  const rotated = typia.assert<{ recovery_code: string }>(await K.request(authenticated, "POST", "/auth/recovery-code", 200, { password }), K.invalidResponse);
  assert.ok(rotated.recovery_code.length >= 20 && rotated.recovery_code !== recovered.recovery_code, "재발급은 새 코드를 발급합니다.");
  await K.error(connection, "POST", "/auth/recovery", 401, { ...payload, recovery_code: recovered.recovery_code });
  const races = await Promise.all([0, 1].map(() => K.outcome(connection, "POST", "/auth/recovery", {
    login_id: actor.input.login_id, recovery_code: rotated.recovery_code, password: `재설정 ${randomUUID()}`,
  })));
  assert.deepEqual(races.map((entry) => entry.status).sort((a, b) => a - b), [200, 401], "복구 코드의 동시 사용을 한 번만 허용합니다.");
}

// 확정 정책 6.3: 재동의는 현재 정책만 기록하며 과거 문서를 임의로 입력할 수 없습니다.
export async function test_api_knittinglog_policy_reconsent(connection: K.Connection): Promise<void> {
  const actor = await K.register(connection);
  const policies = typia.assert<K.Policy[]>(await K.request(connection, "GET", "/policy-documents", 200), K.invalidResponse);
  const input = { policy_document_ids: policies.map((entry) => entry.id) };
  const first = typia.assert<K.Consent[]>(await K.request(actor.connection, "POST", "/users/me/policy-consents", 200, input), K.invalidResponse);
  const repeated = typia.assert<K.Consent[]>(await K.request(actor.connection, "POST", "/users/me/policy-consents", 200, input), K.invalidResponse);
  assert.deepEqual(repeated, first, "같은 재동의는 기존 동의 시각을 유지합니다.");
  await K.error(actor.connection, "POST", "/users/me/policy-consents", 400, { policy_document_ids: [randomUUID()] });
  const afterInvalid = typia.assert<K.Consent[]>(await K.request(actor.connection, "GET", "/users/me/policy-consents", 200), K.invalidResponse);
  assert.deepEqual(afterInvalid, first, "거부된 재동의는 기존 동의를 변경하지 않습니다.");
}

// DB-FK-004: 인증 누락은 업무 데이터의 조회와 생성을 거부해야 합니다.
export async function test_api_knittinglog_anonymous_access(connection: K.Connection): Promise<void> {
  await K.error(connection, "GET", "/users/me", 401);
  await K.error(connection, "GET", "/projects", 401);
  await K.error(connection, "POST", "/projects", 401, { name: "권한 없는 프로젝트", invitee_user_ids: [] });
}
