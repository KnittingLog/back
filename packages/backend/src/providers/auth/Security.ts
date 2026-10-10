import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export namespace Security {
  export function identifier(input: string): string {
    const trimmed = input.trim();
    const value = trimmed.toLowerCase();
    if (!/^[\x00-\x7f]+$/.test(
      trimmed,
    ) || value.length < 3 || value.length > 32 ||
        !/^[a-z0-9][a-z0-9_.]*[a-z0-9]$/.test(value) || value.includes(".."))
      throw new Error("계정 식별자의 형식이 올바르지 않습니다.");
    return value;
  }

  // 초기 로컬 차단 목록입니다. 전체 유출 목록 제공자의 수용 검증은 별도입니다.
  const prohibited = new Set([
    "password",
    "passwordpassword",
    "password123456789",
    "123456789012345",
    "12345678901234567890",
    "qwertyuiopasdfgh",
    "letmeinletmeinletmein",
  ]);
  export function password(value: string): string {
    const length = [...value].length;
    if (length < 15 || length > 128 || prohibited.has(
      value.toLowerCase().trim(),
    ))
      throw new Error("비밀번호가 허용된 보안 기준을 충족하지 않습니다.");
    return value;
  }

  export type PasswordVerifier = (password: string) => Promise<"safe" | "breached" | "unavailable">;
  export class ScreeningUnavailable extends Error {}
  export async function screenPassword(value: string, production: boolean, verifier?: PasswordVerifier): Promise<string> {
    password(value);
    if (!verifier) {
      if (production) throw new ScreeningUnavailable(
        "비밀번호 검증 제공자가 준비되지 않았습니다.",
      );
      return value;
    }
    const decision = await verifier(value).catch(() => "unavailable" as const);
    if (decision === "breached") throw new Error(
      "비밀번호가 허용된 보안 기준을 충족하지 않습니다.",
    );
    if (decision !== "safe") throw new ScreeningUnavailable(
      "비밀번호 검증 제공자가 준비되지 않았습니다.",
    );
    return value;
  }

  const derive = (value: string, salt: string): Promise<Buffer> =>
    new Promise((resolve, reject) => {
      scrypt(
        value,
        salt,
        64,
        { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
        (error, hash) => error ? reject(error) : resolve(hash),
      );
    });

  export async function hashPassword(value: string): Promise<string> {
    const salt = randomBytes(16).toString("hex");
    return `scrypt$131072$8$1$${salt}$${(await derive(value, salt)).toString("hex")}`;
  }

  export async function verifyPassword(value: string, encoded: string): Promise<boolean> {
    const pieces = encoded.split("$");
    if (
      pieces.length !== 6 ||
      pieces.slice(0, 4).join("$") !== "scrypt$131072$8$1" ||
      !/^[0-9a-f]{32}$/.test(pieces[4]!) ||
      !/^[0-9a-f]{128}$/.test(pieces[5]!)
    ) {
      return false;
    }
    return timingSafeEqual(
      await derive(value, pieces[4]!),
      Buffer.from(pieces[5]!, "hex"),
    );
  }

  export const token = (): string => randomBytes(32).toString("base64url");
  export const tokenHash = (value: string): string => createHash("sha256").update(value).digest(
    "hex",
  );
}
