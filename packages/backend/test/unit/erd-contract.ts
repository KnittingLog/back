import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * @evidence docs/requirements.md#41-적용-범위 현재 업무 스키마의 ASCII 식별자와 도메인 분리를 실제 DMMF·생성 SQL에서 검사합니다.
 * @evidence docs/requirements.md#42-네이밍-규칙 현재 모델·필드·ENUM·제약·인덱스의 이름과 63바이트 한계를 검사합니다. 없는 시퀀스·함수·파티션을 도입하지 않습니다.
 */
export function verifyDatabaseNaming(): void {
  const backend = path.resolve(__dirname, "../..");
  const result = execFileSync(process.execPath, [path.join(backend, "scripts/check-erd.cjs")], {
    cwd: backend, encoding: "utf8",
    env: { ...process.env, POSTGRES_URL: "postgresql://schema_check:schema_check@127.0.0.1:1/schema_check" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  console.log(result.trim());
}

try {
  verifyDatabaseNaming();
} catch {
  console.error("FAIL ERD 정적 저장 계약; 실제 DB에는 연결하지 않습니다.");
  process.exitCode = 1;
}
