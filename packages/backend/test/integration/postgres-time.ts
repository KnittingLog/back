import assert from "node:assert/strict";

import { MyGlobal } from "../../src/MyGlobal";
import { KnittingLogContext as K } from "../../src/providers/common/KnittingLogContext";
import { assertIsolatedPostgresUrl } from "../helpers/IsolatedPostgres";

async function main(): Promise<void> {
  assertIsolatedPostgresUrl(process.env.POSTGRES_URL ?? "");
  try {
    await K.transaction(async (tx) => {
      const [identity] = await tx.$queryRaw<{ directory: string }[]>`SELECT current_setting('data_directory') AS directory`;
      assert.ok(identity?.directory.startsWith("/private/tmp/knittinglog-tdd."));
      const [row] = await tx.$queryRaw<{ instant: Date }[]>`SELECT '2020-01-01T00:00:00Z'::timestamptz AS instant`;
      assert.equal(row?.instant.toISOString(), "2020-01-01T00:00:00.000Z");
    });
    console.log("PASS PostgreSQL timestamptz UTC round-trip");
  } finally {
    await MyGlobal.prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof assert.AssertionError ? error.message : "UTC 시각 검증 실패");
  process.exitCode = 1;
});
