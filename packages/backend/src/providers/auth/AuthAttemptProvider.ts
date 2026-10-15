import { HttpException } from "@nestjs/common";

import { MyGlobal } from "../../MyGlobal";
import { KnittingLogContext as K } from "../common/KnittingLogContext";
import { Security } from "./Security";

const PRINCIPAL_ID = "00000000-0000-4000-8000-000000000101";
const PRINCIPAL_CODE = "auth_attempt_limiter";
const LIMIT = 10;

export interface Store {
  consume(key: string): Promise<number>;
}

export function key(kind: string, identifier: string): string {
  return Security.tokenHash(`${kind}:${identifier.trim().toLowerCase()}`);
}

export function createLimiter(store: Store) {
  return {
    async attempt(kind: string, identifier: string): Promise<void> {
      let count: number;
      try {
        count = await store.consume(key(kind, identifier));
      } catch {
        K.fail(
          503,
          "AUTH_RATE_LIMIT_UNAVAILABLE",
          "인증 요청을 확인할 수 없습니다.",
        );
      }
      if (count > LIMIT) K.fail(
        429,
        "AUTH_RATE_LIMIT",
        "잠시 후 다시 시도하세요.",
      );
    },
  };
}

export function createDatabaseStore(client: typeof MyGlobal.prisma): Store {
  return {
    async consume(attemptKey: string): Promise<number> {
      await client.$executeRaw`
        DELETE FROM accounts.auth_attempt_limits
        WHERE id IN (
          SELECT id FROM accounts.auth_attempt_limits
          WHERE expires_at <= clock_timestamp() - interval '10 minutes'
            AND attempt_key <> ${attemptKey}
          ORDER BY expires_at, id
          LIMIT 100
          FOR UPDATE SKIP LOCKED
        )`;

      return client.$transaction(async (tx) => {
        await tx.$executeRaw`
          INSERT INTO accounts.system_principals (id, code, created_by, updated_by)
          VALUES (
            ${PRINCIPAL_ID}::uuid, ${PRINCIPAL_CODE},
            ${PRINCIPAL_ID}::uuid, ${PRINCIPAL_ID}::uuid
          ) ON CONFLICT (id) DO NOTHING`;
        const principal = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM accounts.system_principals
          WHERE id = ${PRINCIPAL_ID}::uuid
            AND code = ${PRINCIPAL_CODE}
            AND deleted_at IS NULL
          FOR SHARE`;
        if (principal.length !== 1)
          throw new Error("시스템 감사 주체를 확인할 수 없습니다.");

        const rows = await tx.$queryRaw<{ attempt_count: number }[]>`
          WITH db_clock AS (
            SELECT clock_timestamp() AS db_now
          )
          INSERT INTO accounts.auth_attempt_limits (
            id, attempt_key, attempt_count, window_started_at, expires_at,
            created_at, created_by, updated_at, updated_by
          )
          SELECT gen_random_uuid(), ${attemptKey}, 1, db_clock.db_now,
            db_clock.db_now + interval '10 minutes', db_clock.db_now,
            ${PRINCIPAL_ID}::uuid, db_clock.db_now, ${PRINCIPAL_ID}::uuid
          FROM db_clock
          WHERE true
          ON CONFLICT (attempt_key) DO UPDATE SET
            attempt_count = CASE
              WHEN accounts.auth_attempt_limits.expires_at <= (SELECT db_now FROM db_clock) THEN 1
              ELSE LEAST(accounts.auth_attempt_limits.attempt_count + 1, 11)
            END,
            window_started_at = CASE
              WHEN accounts.auth_attempt_limits.expires_at <= (SELECT db_now FROM db_clock)
                THEN (SELECT db_now FROM db_clock)
              ELSE accounts.auth_attempt_limits.window_started_at
            END,
            expires_at = CASE
              WHEN accounts.auth_attempt_limits.expires_at <= (SELECT db_now FROM db_clock)
                THEN (SELECT db_now FROM db_clock) + interval '10 minutes'
              ELSE accounts.auth_attempt_limits.expires_at
            END,
            updated_at = (SELECT db_now FROM db_clock),
            updated_by = ${PRINCIPAL_ID}::uuid
          RETURNING attempt_count`;
        if (rows.length !== 1)
          throw new Error("인증 시도 횟수를 저장하지 못했습니다.");
        return rows[0]!.attempt_count;
      });
    },
  };
}

const databaseLimiter = createLimiter(createDatabaseStore(MyGlobal.prisma));

export async function attempt(kind: string, identifier: string): Promise<void> {
  try {
    await databaseLimiter.attempt(kind, identifier);
  } catch (error) {
    if (error instanceof HttpException) throw error;
    K.fail(
      503,
      "AUTH_RATE_LIMIT_UNAVAILABLE",
      "인증 요청을 확인할 수 없습니다.",
    );
  }
}
