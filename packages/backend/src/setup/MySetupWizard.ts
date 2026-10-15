import cp from "node:child_process";
import fs from "node:fs";
import { MyGlobal } from "../MyGlobal";

export namespace MySetupWizard {
  export async function schema(): Promise<void> {
    if (MyGlobal.testing === false)
      throw new Error(
        "Error on SetupWizard.schema(): unable to create database schema in non-test mode.",
      );
    // migrations 폴더 없이 초기화한 뒤 검토 대상인 diff와 설계 제약을 적용합니다.
    cp.execSync("pnpm exec prisma migrate reset --force --schema=prisma/schema", { stdio: "inherit" });
    const schema = cp.execSync(
      "pnpm exec prisma migrate diff --from-empty --to-schema prisma/schema --script",
      { encoding: "utf8" },
    );
    const constraints = fs.readFileSync("prisma/design-constraints.sql", "utf8");
    for (const statement of `${schema}\n${constraints}`.split(/;\s*(?:\r?\n|$)/)) {
      const query = statement.trim();
      if (query.length > 0) await MyGlobal.prisma.$executeRawUnsafe(query);
    }

    await MyGlobal.prisma.$executeRawUnsafe(
      `GRANT SELECT ON ALL TABLES IN SCHEMA ${MyGlobal.env.POSTGRES_SCHEMA} TO ${MyGlobal.env.POSTGRES_USERNAME_READONLY}`,
    );
  }

  export async function seed(): Promise<void> {}
}
