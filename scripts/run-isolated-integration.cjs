const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const backend = path.join(root, "packages/backend");
const port = 50801;
const user = "knittinglog_test";
const database = "knittinglog_tdd";
let active;
let interrupted = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
  interrupted = true;
  active?.kill("SIGTERM");
});

async function main() {
  assert.equal(process.env.KNITTINGLOG_TEST_ALLOW_WRITES, "1", "격리 DB 쓰기 승인이 필요합니다");
  for (const key of ["POSTGRES_URL", "KNITTINGLOG_TEST_URL", "PGSERVICE", "PGSERVICEFILE"]) {
    assert(!process.env[key], `${key} 외부 연결 설정은 사용할 수 없습니다`);
  }
  // 기존 서버가 있으면 중지하거나 재사용하지 않습니다.
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(port, "127.0.0.1", () => probe.close(resolve));
  });
  const directory = fs.mkdtempSync("/private/tmp/knittinglog-tdd.");
  fs.chmodSync(directory, 0o700);
  const data = path.join(directory, "postgres");
  const socket = path.join(directory, "socket");
  fs.mkdirSync(socket, { mode: 0o700 });
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !key.startsWith("PG") && !key.startsWith("KNITTINGLOG_") && !key.startsWith("POSTGRES_")));
  Object.assign(env, {
    MODE: "local", API_PORT: "3000", SYSTEM_PASSWORD: "ci-test-only-placeholder",
    POSTGRES_URL: `postgresql://${user}@127.0.0.1:${port}/${database}`,
    POSTGRES_HOST: "127.0.0.1", POSTGRES_PORT: String(port), POSTGRES_DATABASE: database,
    POSTGRES_SCHEMA: "public", POSTGRES_USERNAME: user, POSTGRES_USERNAME_READONLY: user,
    POSTGRES_PASSWORD: "isolated-test-only-placeholder", KNITTINGLOG_TEST_ALLOW_WRITES: "1",
    KNITTINGLOG_TEST_POSTGRES_PORT: String(port),
    PGCONNECT_TIMEOUT: "5", TTSC_CACHE_DIR: path.join(root, ".cache/ttsc"),
  });
  const results = [];
  const run = async (label, command, args, options = {}) => {
    if (interrupted && !options.cleanup) throw new Error("검사가 중지되었습니다");
    const log = path.join(directory, `${label}.log`);
    const fd = fs.openSync(log, "w", 0o600);
    const start = Date.now();
    try {
      const chunks = [];
      const child = spawn(command, args, { cwd: backend, env: options.env ?? env, stdio: ["pipe", options.captureStdout ? "pipe" : fd, fd] });
      active = child;
      if (options.captureStdout) child.stdout.on("data", chunk => {
        chunks.push(chunk);
        fs.writeSync(fd, chunk);
      });
      child.stdin.on("error", () => {});
      child.stdin.end(options.input ?? "");
      const code = await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("close", resolve);
      });
      results.push({ label, code, seconds: Math.round((Date.now() - start) / 1000), log });
      fs.writeFileSync(path.join(directory, "results.json"), JSON.stringify(results, null, 2));
      assert((options.codes ?? [0]).includes(code), `${label} 실패. 로그: ${log}`);
      console.log(`PASS ${label}`);
      return options.captureStdout ? Buffer.concat(chunks).toString("utf8") : fs.readFileSync(log, "utf8");
    } finally {
      active = undefined;
      fs.closeSync(fd);
    }
  };
  const psqlArgs = ["-X", "-h", "127.0.0.1", "-p", String(port), "-U", user, "-v", "ON_ERROR_STOP=1"];
  const psql = (label, db, input, extra = [], options = {}) =>
    run(label, "psql", [...psqlArgs, "-d", db, ...extra], { ...options, input });
  let started = false;
  console.log(`격리 검사 자료: ${directory}`);
  try {
    await run("initdb", "initdb", ["-D", data, "-U", user, "--auth=trust", "--encoding=UTF8", "--locale=C"]);
    // 시작이 일부만 성공해도 새로 만든 클러스터의 종료를 시도합니다.
    started = true;
    await run("start", "pg_ctl", ["-D", data, "-l", path.join(directory, "postgres.log"), "-o",
      `-h 127.0.0.1 -p ${port} -k ${socket} -c timezone=UTC -c unix_socket_permissions=0700`, "-w", "start"]);
    const identity = await psql("identity", "postgres", "SELECT current_setting('data_directory'), inet_server_addr(), inet_server_port();", ["-A", "-t"]);
    assert.equal(identity.trim(), `${data}|127.0.0.1|${port}`, "새 클러스터의 실제 연결 대상이 다릅니다");
    await run("createdb", "createdb", ["-h", "127.0.0.1", "-p", String(port), "-U", user, database]);
    const cli = require.resolve("prisma/build/index.js", { paths: [backend] });
    const sql = await run("schema", process.execPath, [cli, "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema", "--script"], { captureStdout: true });
    assert(!/\bFOREIGN\s+KEY\b|\bREFERENCES\b/i.test(sql), "생성 SQL에 물리 FK가 있습니다");
    await psql("apply-schema", database, sql, ["--single-transaction"]);
    await psql("apply-constraints", database, fs.readFileSync(path.join(backend, "prisma/design-constraints.sql"), "utf8"), ["--single-transaction"]);
    const constraints = path.join(backend, "test/integration/erd-constraints.sql");
    const missingDirectory = await run("guard-missing-directory", "psql", [...psqlArgs, "-d", database, "-f", constraints], { codes: [3] });
    assert.match(missingDirectory, /검사할 일회용 클러스터 경로가 필요합니다/);
    const targetArgs = ["-v", `expected_data_directory=${data}`, "-v", `expected_port=${port}`];
    const wrongDirectory = await run("guard-wrong-directory", "psql", [...psqlArgs, "-d", database, "-v", "expected_data_directory=/private/tmp/knittinglog-tdd.invalid/postgres", "-v", `expected_port=${port}`, "-f", constraints], { codes: [3] });
    assert.match(wrongDirectory, /일회용 검증 클러스터가 아닙니다/);
    const wrongPort = await run("guard-wrong-port", "psql", [...psqlArgs, "-d", database, ...targetArgs, "-v", "expected_port=50799", "-f", constraints], { codes: [3] });
    assert.match(wrongPort, /일회용 검증 클러스터가 아닙니다/);
    const noApprovalEnv = { ...env };
    delete noApprovalEnv.KNITTINGLOG_TEST_ALLOW_WRITES;
    const missingApproval = await run("guard-missing-approval", "psql", [...psqlArgs, "-d", database, ...targetArgs, "-f", constraints], { env: noApprovalEnv, codes: [3] });
    assert.match(missingApproval, /격리 DB 쓰기 승인이 필요합니다/);
    const deniedApproval = await run("guard-denied-approval", "psql", [...psqlArgs, "-d", database, ...targetArgs, "-f", constraints], { env: { ...env, KNITTINGLOG_TEST_ALLOW_WRITES: "0" }, codes: [3] });
    assert.match(deniedApproval, /일회용 검증 클러스터가 아닙니다/);
    const socketTarget = await run("guard-unix-socket", "psql", ["-X", "-h", socket, "-p", String(port), "-U", user,
      "-v", "ON_ERROR_STOP=1", "-d", database, ...targetArgs, "-f", constraints], { codes: [3] });
    assert.match(socketTarget, /일회용 검증 클러스터가 아닙니다/);
    await run("erd-constraints", "psql", [...psqlArgs, "-d", database, ...targetArgs, "-f", constraints]);
    await psql("constraint-rollback", database, `DO $$ DECLARE v_table record; v_count bigint; BEGIN
      FOR v_table IN SELECT schemaname, tablename FROM pg_tables
        WHERE schemaname IN ('accounts','social','projects','community') LOOP
        EXECUTE format('SELECT count(*) FROM %I.%I', v_table.schemaname, v_table.tablename) INTO v_count;
        IF v_count <> 0 THEN RAISE EXCEPTION '제약 검사 데이터가 롤백되지 않았습니다'; END IF;
      END LOOP;
    END $$;`);
    await psql("seed", database, `INSERT INTO accounts.policy_documents(id,code,version,title,body,effective_at,created_by,updated_by)
      SELECT gen_random_uuid(), code, '1', code, 'isolated-test-only', now() - interval '1 day',
      '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'
      FROM unnest(ARRAY['terms','privacy']) AS code;`, ["--single-transaction"]);
    for (const [label, file] of [
      ["postgres-time", "test/integration/postgres-time.ts"],
      ["policy-gates", "test/integration/policy-gates.ts"],
      ["isolated-api", "test/isolated-api.ts"],
    ]) {
      const output = await run(label, process.execPath, [path.join(root, "scripts/ttsc-cache.cjs"), "ttsx", "--project", "test/tsconfig.json", file]);
      console.log(output.trim());
    }
  } finally {
    if (started) await run("stop", "pg_ctl", ["-D", data, "-w", "stop", "-m", "fast"], { cleanup: true });
    console.log(`검사 데이터와 로그를 보존했습니다: ${directory}`);
  }
}

main().catch(error => {
  console.error(error.code === "EADDRINUSE" ? "검사 포트를 이미 사용 중입니다. 기존 서버는 변경하지 않았습니다." : error.message);
  process.exitCode = 1;
});
