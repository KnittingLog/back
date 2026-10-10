import type api from "@knittinglog/api";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import typia from "typia";

// 업무 SDK 생성 전의 테스트 계약입니다. 요청·응답 기준은 docs/api-test-contract.md입니다.
export namespace KnittingLogApi {
  export type Connection = api.IConnection;
  export interface User {
    id: string;
    handle: string;
    nickname: string;
    biography: string | null;
    visibility: "public" | "friends" | "private";
  }
  export interface Session {
    user: User;
    access_token: string;
    refresh_token: string;
  }
  export interface RecoverySession extends Session {
    recovery_code: string;
  }
  export interface Registration {
    login_id: string;
    handle: string;
    nickname: string;
    password: string;
    policy_document_ids: string[];
  }
  export interface Actor {
    connection: Connection;
    session: RecoverySession;
    input: Registration;
  }
  export interface Policy {
    id: string;
    code: string;
    version: string;
  }
  export interface Consent {
    user_id: string;
    policy_document_id: string;
    agreed_at: string;
  }
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
  export interface Counter {
    id: string;
    workspace_id: string;
    name: string;
    value: number;
    target_value: number | null;
    is_visible: boolean;
    sort_order: number;
  }
  export interface Timer {
    id: string;
    workspace_id: string;
    owner_user_id: string;
    status: "running" | "paused" | "stopped";
    started_at: string | null;
    accumulated_seconds: number;
  }
  export interface Post {
    id: string;
    author_id: string;
    author_name: string;
    body: string;
    created_at: string;
  }
  export interface PostComment {
    id: string;
    post_id: string;
    author_id: string;
    author_name: string;
    body: string;
  }
  export interface PostLike {
    id: string;
    post_id: string;
    user_id: string;
  }
  export interface Feed {
    items: Post[];
    next_cursor: string | null;
  }
  export interface Report {
    id: string;
    reporter_id: string;
    target_user_id: string | null;
    post_id: string | null;
    reason_code: "spam" | "abuse" | "inappropriate" | "privacy" | "other";
    detail: string | null;
    status: "received" | "reviewing" | "closed";
    target_snapshot: {
      schema_version: number;
      handle?: string | null;
      nickname?: string | null;
      biography?: string | null;
      author_id?: string;
      body?: string;
      source_updated_at: string;
    };
    actions: ReportAction[];
  }
  export interface ReportAction {
    id: string;
    report_id: string;
    actor_user_id: string;
    action_code: "review" | "close" | "hide_post";
    reason: string;
    result: { status: "received" | "reviewing" | "closed"; post_hidden?: boolean };
  }
  export interface Record {
    id: string;
    workspace_id: string;
    author_id: string;
    source: "manual" | "timer";
    body: string | null;
    duration_seconds: number;
    recorded_at: string;
  }
  export interface Comment {
    id: string;
    record_id: string;
    author_id: string;
    body: string;
  }
  export interface Reaction {
    id: string;
    record_id: string;
    user_id: string;
    emoji_code: string;
  }
  export interface FriendRequest {
    id: string;
    sender_id: string;
    recipient_id: string;
    status: "pending" | "accepted" | "rejected" | "cancelled";
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
  export interface Statistics {
    total_duration_seconds: number;
  }
  export interface ErrorBody {
    code: string;
    message: string;
  }

  export const invalidResponse = (): Error =>
    new Error("API 응답이 테스트 계약과 다릅니다. 응답 본문과 인증값은 출력하지 않습니다.");

  export function assertLocal(connection: Connection): void {
    const target = new URL(connection.host);
    assert.ok(["http:", "https:"].includes(target.protocol), "HTTP API 주소가 필요합니다.");
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname), "로컬 API만 허용합니다.");
    assert.ok(!target.username && !target.password, "주소에 인증 정보를 넣지 않습니다.");
    assert.equal(target.pathname, "/", "API 주소에는 경로를 넣지 않습니다.");
    assert.ok(!target.search && !target.hash, "API 주소에는 쿼리와 앵커를 넣지 않습니다.");
    assert.ok(connection.simulate !== true, "모의 응답을 사용하지 않습니다.");
    assert.equal(process.env.KNITTINGLOG_TEST_ALLOW_WRITES, "1", "격리된 API의 쓰기 테스트 동의가 필요합니다.");
  }

  export async function outcome(
    connection: Connection,
    method: string,
    route: string,
    body?: unknown,
    versioned = true,
  ): Promise<{ status: number; body: unknown }> {
    assertLocal(connection);
    const headers = new Headers();
    for (const [name, value] of Object.entries(connection.headers ?? {})) {
      if (value !== undefined) headers.set(name, String(value));
    }
    if (body !== undefined) headers.set("content-type", "application/json");
    const path = versioned ? `/api/v1${route}` : route;
    const response = await fetch(new URL(path, connection.host), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 204 || (!versioned && route === "/monitors/health" && response.status === 200)) {
      assert.equal(await response.text(), "", "본문이 없는 응답은 비어 있어야 합니다.");
      return { status: response.status, body: undefined };
    }
    assert.ok(response.headers.get("content-type")?.includes("application/json"), "JSON 응답이 필요합니다.");
    return { status: response.status, body: await response.json() };
  }

  export async function request(connection: Connection, method: string, route: string, status: number, body?: unknown): Promise<unknown> {
    const response = await outcome(connection, method, route, body);
    assert.equal(response.status, status, `${method} ${route} 상태 코드 불일치`);
    return response.body;
  }

  export function uuid(value: string): void {
    assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  }

  export function publicProfile(value: unknown): User {
    const user = typia.assert<User>(value, invalidResponse);
    const visit = (input: unknown): void => {
      if (input === null || typeof input !== "object") return;
      for (const [key, child] of Object.entries(input)) {
        assert.ok(!["login_id", "password", "password_hash", "refresh_token_hash", "access_token", "refresh_token", "recovery_code", "recovery_code_hash"].includes(key), "공개 응답에 비공개 계정 필드가 있습니다.");
        visit(child);
      }
    };
    visit(value);
    uuid(user.id);
    return user;
  }

  export async function error(connection: Connection, method: string, route: string, status: number, body?: unknown): Promise<ErrorBody> {
    return typia.assert<ErrorBody>(await request(connection, method, route, status, body), invalidResponse);
  }

  export async function register(connection: Connection): Promise<Actor> {
    const policies = typia.assert<Policy[]>(await request(connection, "GET", "/policy-documents", 200), invalidResponse);
    assert.ok(policies.length > 0, "FIXTURE_BLOCKED: 동의할 정책 문서가 필요합니다.");
    const suffix = randomUUID().replaceAll("-", "").slice(0, 24);
    const input: Registration = {
      login_id: `qa_l_${suffix}`,
      handle: `qa_h_${suffix}`,
      nickname: `qa_${suffix.slice(0, 8)}`,
      password: `Qa!${randomUUID()}aA1`,
      policy_document_ids: policies.map((policy) => policy.id),
    };
    const session = typia.assert<RecoverySession>(await request(connection, "POST", "/auth/register", 201, input), invalidResponse);
    uuid(session.user.id);
    assert.ok(session.access_token.length > 0 && session.refresh_token.length > 0, "가입 토큰이 필요합니다.");
    assert.ok(session.recovery_code.length >= 20, "안전한 복구 코드가 필요합니다.");
    return { input, session, connection: { ...connection, headers: { Authorization: `Bearer ${session.access_token}` } } };
  }

  export async function project(actor: Actor, invitees: string[] = []): Promise<Project> {
    return typia.assert<Project>(await request(actor.connection, "POST", "/projects", 201, {
      name: `qa_project_${randomUUID()}`,
      invitee_user_ids: invitees,
    }), invalidResponse);
  }

  export async function workspace(actor: Actor, projectId: string): Promise<Workspace> {
    const workspaces = typia.assert<Workspace[]>(await request(actor.connection, "GET", `/projects/${projectId}/workspaces`, 200), invalidResponse);
    const owned = workspaces.filter((entry) => entry.owner_user_id === actor.session.user.id);
    assert.equal(owned.length, 1, "개인 작업 공간은 하나여야 합니다.");
    return owned[0]!;
  }

  export async function counters(actor: Actor, workspaceId: string): Promise<Counter[]> {
    return typia.assert<Counter[]>(await request(actor.connection, "GET", `/workspaces/${workspaceId}/counters`, 200), invalidResponse);
  }

  export async function befriend(sender: Actor, recipient: Actor): Promise<void> {
    const sent = typia.assert<FriendRequest>(await request(sender.connection, "POST", "/friend-requests", 201, { recipient_id: recipient.session.user.id }), invalidResponse);
    await request(recipient.connection, "POST", `/friend-requests/${sent.id}/accept`, 200);
  }

  export async function join(owner: Actor, member: Actor, projectId: string): Promise<Membership> {
    const invitation = typia.assert<Invitation>(await request(owner.connection, "POST", `/projects/${projectId}/invitations`, 201, { recipient_id: member.session.user.id }), invalidResponse);
    return typia.assert<Membership>(await request(member.connection, "POST", `/project-invitations/${invitation.id}/accept`, 200), invalidResponse);
  }

  export async function record(actor: Actor, workspaceId: string, seconds = 60): Promise<Record> {
    return typia.assert<Record>(await request(actor.connection, "POST", `/workspaces/${workspaceId}/records`, 201, {
      source: "manual", body: "테스트 작업 기록", duration_seconds: seconds, recorded_at: new Date().toISOString(),
    }), invalidResponse);
  }

  export function fixtureCode(name: "KNITTINGLOG_TEST_EMOJI_CODE" | "KNITTINGLOG_TEST_REPORT_REASON_CODE"): string {
    return name === "KNITTINGLOG_TEST_EMOJI_CODE" ? "like" : "spam";
  }

  export function identifier(): string {
    return `qa_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
  }
}
