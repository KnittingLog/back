import assert from "node:assert/strict";
import path from "node:path";

import { MyGlobal } from "../../src/MyGlobal";
import { assertIsolatedPostgresUrl } from "../helpers/IsolatedPostgres";

const { Client } = require(require.resolve("pg", {
  paths: [path.dirname(require.resolve("@prisma/adapter-pg"))],
})) as { Client: new (input: { connectionString: string; options: string }) => {
  connectionParameters: { host: string; port: number; options: string };
} };

// pg 설정만 검사합니다. DB 연결과 환경값 조회는 하지 않습니다.
let failures = 0;
function check(name: string, work: () => void): void {
  try {
    work();
    console.log(`PASS ${name}`);
  } catch {
    failures++;
    console.error(`FAIL ${name}`);
  }
}

const fixture = "postgresql://127.0.0.1:50799/knittinglog_tdd";
check("isolated PostgreSQL target rejects query overrides before connection", () => {
  assertIsolatedPostgresUrl(fixture);
  assertIsolatedPostgresUrl(fixture.replace("postgresql:", "postgres:"));
  for (const uri of [
    `${fixture}?host=example.invalid&port=5432`, `${fixture}?host=127.0.0.1&port=5432`,
    `${fixture}?options=-c%20timezone%3DAsia%2FSeoul`, `${fixture}#fragment`,
    fixture.replace("postgresql:", "http:"), fixture.replace("50799", "5432"),
    fixture.replace("knittinglog_tdd", "other_database"),
  ]) assert.throws(() => assertIsolatedPostgresUrl(uri));
});

check("PostgreSQL URL options cannot override session UTC", () => {
  const cases = [fixture,
    `${fixture}?options=-c%20timezone%3DAsia%2FSeoul`,
    `${fixture}?options=-c%20statement_timeout%3D1000`,
  ];
  for (const uri of cases) {
    const normalized = MyGlobal.postgresConnectionString(uri);
    const client = new Client({ connectionString: normalized, options: "-c timezone=UTC" });
    assert.equal(client.connectionParameters.host, "127.0.0.1");
    assert.equal(client.connectionParameters.port, 50799);
    assert.ok(client.connectionParameters.options.endsWith("-c timezone=UTC"));
    if (uri.includes("statement_timeout"))
      assert.ok(client.connectionParameters.options.includes("-c statement_timeout=1000"));
  }
});

process.exitCode = failures ? 1 : 0;
