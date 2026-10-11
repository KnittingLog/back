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

  // 로컬 기본 차단 목록입니다. 운영 모드는 유출 비밀번호 제공자도 검사합니다.
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
  export async function pwnedPassword(value: string, request: typeof fetch = fetch): ReturnType<PasswordVerifier> {
    // SHA-1은 제공자 조회에만 사용합니다. 비밀번호 저장에는 scrypt를 유지합니다.
    const hash = createHash("sha1").update(value, "utf8").digest("hex").toUpperCase();
    try {
      const response = await request(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, {
        headers: { "Add-Padding": "true", "User-Agent": "KnittingLog-password-screening" },
        redirect: "error", signal: AbortSignal.timeout(5_000),
      });
      if (response.status !== 200 || !response.body) {
        await response.body?.cancel();
        return "unavailable";
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { value: chunk, done } = await reader.read();
          if (done) break;
          size += chunk.byteLength;
          if (size > 256 * 1024) {
            await reader.cancel();
            return "unavailable";
          }
          chunks.push(chunk);
        }
      } finally {
        reader.releaseLock();
      }
      const lines = Buffer.concat(chunks).toString("utf8").split(/\r?\n/);
      if (lines[lines.length - 1] === "") lines.pop();
      if (!lines.length) return "unavailable";
      let breached = false;
      for (const line of lines) {
        const row = /^([A-F0-9]{35}):([0-9]+)$/.exec(line);
        if (!row || !Number.isSafeInteger(Number(row[2]))) return "unavailable";
        if (row[1] === hash.slice(5) && Number(row[2]) > 0) breached = true;
      }
      return breached ? "breached" : "safe";
    } catch {
      return "unavailable";
    }
  }

  export async function screenPassword(value: string, production: boolean, verifier: PasswordVerifier | undefined = production ? pwnedPassword : undefined): Promise<string> {
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
