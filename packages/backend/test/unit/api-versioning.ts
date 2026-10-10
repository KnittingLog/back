import { Controller, Get, INestApplication, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import assert from "node:assert/strict";

import { MyBackend } from "../../src/MyBackend";
import { MonitorHealthController } from "../../src/controllers/monitors/MonitorHealthController";

// DB 없이 실제 서버와 같은 HTTP 설정의 버전 경계를 검증합니다.
@Controller({ path: "contract", version: "1" })
class ContractController {
  @Get()
  public get(): { version: number } {
    return { version: 1 };
  }
}

@Module({ controllers: [ContractController, MonitorHealthController] })
class ContractModule {}

async function main(): Promise<void> {
  const app = await NestFactory.create(ContractModule, { logger: false });
  try {
    const backend = MyBackend as typeof MyBackend & {
      configure?: (application: INestApplication) => void;
    };
    backend.configure?.(app);
    await app.listen(0, "127.0.0.1");
    const host = await app.getUrl();
    const read = (route: string) => fetch(`${host}${route}`, { redirect: "error" });
    assert.equal((await read("/api/v1/contract")).status, 200);
    assert.deepEqual(await (await read("/api/v1/contract")).json(), { version: 1 });
    for (const route of ["/contract", "/api/contract", "/api/v2/contract"]) {
      assert.equal((await read(route)).status, 404, route);
    }
    assert.equal((await read("/monitors/health")).status, 200);
    assert.equal((await read("/api/v1/monitors/health")).status, 404);
    console.log("PASS API-VER-001~005: URI 버전과 기존 모니터 경계");
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof assert.AssertionError ? error.message : "버전 계약 검증 실패");
  process.exitCode = 1;
});
