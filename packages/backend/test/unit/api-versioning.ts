import { Body, Controller, Get, INestApplication, Module, Post } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { MyBackend } from "../../src/MyBackend";
import { MonitorHealthController } from "../../src/controllers/monitors/MonitorHealthController";

// DB 없이 실제 서버와 같은 HTTP 설정의 버전 경계를 검증합니다.
@Controller({ path: "contract", version: "1" })
class ContractController {
  @Get()
  public get(): { version: number } {
    return { version: 1 };
  }

  @Post()
  public post(@Body() body: { value: string }): { length: number } {
    return { length: body.value.length };
  }
}

@Controller({ path: "storage/objects", version: "1" })
class StorageParserController {
  @Post()
  public post(@Body() body: { value: string }): { length: number } {
    return { length: body.value.length };
  }
}

@Module({ controllers: [ContractController, StorageParserController, MonitorHealthController] })
class ContractModule {}

async function main(): Promise<void> {
  const swagger = JSON.parse(await fs.readFile(path.resolve(process.cwd(), "../api/swagger.json"), "utf8")) as { paths: Record<string, unknown> };
  const neutral = ["/monitors/health", "/monitors/system", "/monitors/performance"];
  const routes = Object.keys(swagger.paths);
  const byName = (left: string, right: string) => left.localeCompare(right);
  assert.deepEqual(routes.filter((route) => neutral.includes(route)).sort(byName), [...neutral].sort(byName));
  assert.ok(routes.every((route) => neutral.includes(route) || route.startsWith("/api/v1/")),
    `업무 경로는 /api/v1/ 버전을 사용해야 합니다: ${routes.filter((route) => !neutral.includes(route) && !route.startsWith("/api/v1/")).join(", ")}`);
  assert.ok(!routes.some((route) => route.includes("internal_server_error") || route.includes("uncaught_exception")));

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
    const post = (route: string, size: number) => fetch(`${host}${route}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "a".repeat(size) }),
    });
    const normalBody = await post("/api/v1/contract", 16);
    assert.equal(normalBody.status, 201);
    assert.deepEqual(await normalBody.json(), { length: 16 });
    assert.equal((await post("/api/v1/contract", 200 * 1024)).status, 413);
    const storageBody = await post("/api/v1/storage/objects", 200 * 1024);
    assert.equal(storageBody.status, 201);
    assert.deepEqual(await storageBody.json(), { length: 200 * 1024 });
    const malformed = await fetch(`${host}/api/v1/contract`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: '{"value":"synthetic-body-sentinel"',
    });
    assert.equal(malformed.status, 400);
    assert.ok(!(await malformed.text()).includes("synthetic-body-sentinel"));
    const preflight = await fetch(`${host}/api/v1/contract`, {
      method: "OPTIONS", headers: { Origin: "https://example.invalid", "Access-Control-Request-Method": "GET" },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "*");
    for (const route of ["/contract", "/api", "/api/", "/api/contract", "/api/v2/contract", "/api/v1/monitors/health"]) {
      const response = await read(route);
      assert.equal(response.status, 404, route);
      assert.ok(response.headers.get("content-type")?.includes("application/json"), "버전 경계 오류는 JSON으로 응답합니다.");
      assert.deepEqual(await response.json(), { code: "NOT_FOUND", message: "대상을 찾을 수 없습니다." });
    }
    assert.equal((await read("/monitors/health")).status, 200);
    assert.equal((await read("/api/v1/monitors/health")).status, 404);
    console.log("PASS API-VER-001~005, API-VER-007: URI 버전과 모든 실제 경로 계약");
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof assert.AssertionError ? error.message : "버전 계약 검증 실패");
  process.exitCode = 1;
});
