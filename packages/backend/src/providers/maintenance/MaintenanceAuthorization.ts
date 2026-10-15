import { AuthProvider } from "../auth/AuthProvider";
import { KnittingLogContext as K } from "../common/KnittingLogContext";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function configured(name: string): Set<string> {
  const raw = process.env[name];
  const values = raw?.split(",").map((value) => value.trim().toLowerCase());
  if (!values?.length || values.some((value) => !UUID.test(value)) || new Set(values).size !== values.length)
    K.fail(503, "MAINTENANCE_AUTH_UNAVAILABLE", "복구 운영 권한 설정을 확인할 수 없습니다.");
  return new Set(values);
}

export namespace MaintenanceAuthorization {
  export async function approver(tx: K.Tx, authorization: string | undefined): Promise<string> {
    const actor = await AuthProvider.actor(authorization, tx);
    if (!isApprover(actor.id))
      K.fail(403, "FORBIDDEN", "복구 승인 권한이 필요합니다.");
    return actor.id;
  }

  export async function executor(tx: K.Tx, authorization: string | undefined): Promise<string> {
    const actor = await AuthProvider.actor(authorization, tx);
    if (!configured("KNITTINGLOG_MAINTENANCE_EXECUTOR_USER_IDS").has(actor.id.toLowerCase()))
      K.fail(403, "FORBIDDEN", "복구 실행 권한이 필요합니다.");
    return actor.id;
  }

  export function isExecutor(id: string): boolean {
    return configured("KNITTINGLOG_MAINTENANCE_EXECUTOR_USER_IDS").has(id.toLowerCase());
  }

  export function isApprover(id: string): boolean {
    return configured("KNITTINGLOG_MAINTENANCE_APPROVER_USER_IDS").has(id.toLowerCase());
  }
}
