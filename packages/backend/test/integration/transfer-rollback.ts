import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import typia from "typia";

import { MyBackend } from "../../src/MyBackend";
import { MyGlobal } from "../../src/MyGlobal";
import { MyModule } from "../../src/MyModule";
import { ProjectProvider } from "../../src/providers/projects/ProjectProvider";
import { assertIsolatedPostgresUrl } from "../helpers/IsolatedPostgres";
import { KnittingLogApi as K } from "../helpers/KnittingLogApi";

let stage = "대상 확인";

async function snapshot() {
  const db = MyGlobal.prisma;
  const orderBy = { id: "asc" as const };
  return Promise.all([
    db.projects.findMany({ orderBy }),
    db.project_memberships.findMany({ orderBy }),
    db.project_workspaces.findMany({ orderBy }),
    db.project_invitations.findMany({ orderBy }),
    db.workspace_transfers.findMany({ orderBy }),
    db.command_receipts.findMany({ orderBy }),
    db.project_counters.findMany({ orderBy }),
    db.project_records.findMany({ orderBy }),
    db.record_comments.findMany({ orderBy }),
    db.record_reactions.findMany({ orderBy }),
    db.project_timers.findMany({ orderBy }),
  ]);
}

/**
 * 이관 이력 저장 직전에 DB 오류를 주입하고 앞선 업무 변경의 롤백을 확인합니다.
 * 운영 복구와 역이관 수용을 대신하지 않습니다.
 */
async function main(): Promise<void> {
  assert.equal(process.env.MODE, "local");
  assert.equal(process.env.KNITTINGLOG_TEST_ALLOW_WRITES, "1");
  assert.equal(process.env.KNITTINGLOG_TEST_POSTGRES_PORT, "50801");
  assertIsolatedPostgresUrl(process.env.POSTGRES_URL ?? "", "50801");
  const expected = process.env.KNITTINGLOG_TEST_DATA_DIRECTORY;
  assert.ok(expected && /^\/private\/tmp\/knittinglog-tdd\.[^/]+\/postgres$/.test(expected));
  let app: INestApplication | undefined;
  let functionCreated = false;
  let triggerCreated = false;
  try {
    const [identity] = await MyGlobal.prisma.$queryRaw<{ directory: string; port: number; address: string; database: string }[]>`
      SELECT current_setting('data_directory') AS directory, inet_server_port() AS port,
        host(inet_server_addr()) AS address, current_database() AS database`;
    assert.deepEqual(identity, { directory: expected, port: 50801, address: "127.0.0.1", database: "knittinglog_tdd" });
    app = await NestFactory.create(MyModule, { logger: false });
    MyBackend.configure(app);
    await app.listen(0, "127.0.0.1");
    stage = "업무 fixture 준비";
    const connection: K.Connection = { host: await app.getUrl() };
    const owner = await K.register(connection);
    const member = await K.register(connection);
    const invitee = await K.register(connection);
    await K.befriend(owner, member);
    await K.befriend(owner, invitee);
    const project = await K.project(owner);
    await K.join(owner, member, project.id);
    const invitation = typia.assert<K.Invitation>(await K.request(owner.connection, "POST", `/projects/${project.id}/invitations`, 201, {
      recipient_id: invitee.session.user.id,
    }), K.invalidResponse);
    const work = await K.workspace(owner, project.id);
    const record = await K.record(owner, work.id);
    const comment = typia.assert<K.Comment>(await K.request(member.connection, "POST", `/records/${record.id}/comments`, 201, { body: "롤백 검사 댓글" }), K.invalidResponse);
    const reaction = typia.assert<K.Reaction>(await K.request(member.connection, "PUT", `/records/${record.id}/reactions/like`, 200), K.invalidResponse);
    const beforeTimer = await K.workspace(owner, project.id);
    const timer = typia.assert<K.Timer>(await K.request(owner.connection, "POST", `/workspaces/${work.id}/timer/start`, 201, {
      operation_id: randomUUID(), expected_version: beforeTimer.version,
    }), K.invalidResponse);
    const beforeWork = await K.workspace(owner, project.id);
    const input: ProjectProvider.Move = {
      operation_id: typia.assert<ProjectProvider.Uuid>(randomUUID()),
      workspace_id: typia.assert<ProjectProvider.Uuid>(work.id), expected_version: beforeWork.version,
      successor_user_id: typia.assert<ProjectProvider.Uuid>(member.session.user.id),
    };
    const before = await snapshot();

    // 새 일회용 클러스터에만 설치합니다. 운영 코드에 실패 주입 훅을 추가하지 않습니다.
    stage = "실패 주입 설치";
    await MyGlobal.prisma.$executeRaw`CREATE FUNCTION projects.tf_qa_fail_transfer() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA_TRANSFER_ROLLBACK'; END; $$`;
    functionCreated = true;
    await MyGlobal.prisma.$executeRaw`CREATE TRIGGER qa_fail_transfer BEFORE INSERT ON projects.workspace_transfers
      FOR EACH ROW EXECUTE FUNCTION projects.tf_qa_fail_transfer()`;
    triggerCreated = true;
    stage = "오류 주입과 전체 롤백";
    await assert.rejects(ProjectProvider.move(`Bearer ${owner.session.access_token}`, project.id, undefined, input), (error: unknown) =>
      error instanceof Error && error.message.includes("QA_TRANSFER_ROLLBACK"));
    assert.deepEqual(await snapshot(), before, "방장·개인 프로젝트·멤버십·작업 공간·초대·이력·명령·개인 데이터가 모두 롤백되어야 합니다.");
    await MyGlobal.prisma.$executeRaw`DROP TRIGGER qa_fail_transfer ON projects.workspace_transfers`;
    triggerCreated = false;
    await MyGlobal.prisma.$executeRaw`DROP FUNCTION projects.tf_qa_fail_transfer()`;
    functionCreated = false;

    stage = "같은 명령 재시도와 관계 보존";
    const moved = typia.assert<K.Transfer>(await K.request(owner.connection, "POST", `/projects/${project.id}/leave`, 200, input), K.invalidResponse);
    assert.equal(moved.id, input.operation_id);
    assert.deepEqual(await K.request(owner.connection, "POST", `/projects/${project.id}/leave`, 200, input), moved);
    assert.equal(await MyGlobal.prisma.projects.count(), before[0].length + 1);
    assert.equal(await MyGlobal.prisma.workspace_transfers.count({ where: { id: input.operation_id } }), 1);
    assert.equal(await MyGlobal.prisma.command_receipts.count({ where: { id: input.operation_id } }), 1);
    assert.equal((await MyGlobal.prisma.projects.findUniqueOrThrow({ where: { id: project.id } })).owner_user_id, member.session.user.id);
    assert.equal((await MyGlobal.prisma.project_invitations.findUniqueOrThrow({ where: { id: invitation.id } })).status, "cancelled");
    assert.equal((await K.workspace(owner, moved.to_project_id)).id, work.id);
    assert.equal((await MyGlobal.prisma.record_comments.findUniqueOrThrow({ where: { id: comment.id } })).record_id, record.id);
    assert.equal((await MyGlobal.prisma.record_reactions.findUniqueOrThrow({ where: { id: reaction.id } })).record_id, record.id);
    assert.equal((await MyGlobal.prisma.project_timers.findUniqueOrThrow({ where: { id: timer.id } })).workspace_id, work.id);
    console.log("PASS 이관 중간 실패의 11개 테이블 롤백·동일 작업 재시도·중복 방지·댓글/반응/타이머 보존");
  } finally {
    try {
      if (triggerCreated) await MyGlobal.prisma.$executeRaw`DROP TRIGGER qa_fail_transfer ON projects.workspace_transfers`;
      if (functionCreated) await MyGlobal.prisma.$executeRaw`DROP FUNCTION projects.tf_qa_fail_transfer()`;
    } finally {
      try { await app?.close(); } finally { await MyGlobal.prisma.$disconnect(); }
    }
  }
}

main().catch((error: unknown) => {
  let detail = "";
  if (error instanceof assert.AssertionError && typeof error.actual === "number" && typeof error.expected === "number")
    detail = ` actual=${error.actual} expected=${error.expected}`;
  console.error(`FAIL 격리 이관 롤백 검사: ${stage}${detail}`);
  process.exitCode = 1;
});
