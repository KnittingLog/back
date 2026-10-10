import type { users } from "@prisma/sdk";
import { randomUUID } from "node:crypto";

import { MyGlobal } from "../../MyGlobal";
import { KnittingLogContext as K } from "../common/KnittingLogContext";
import { PolicyProvider } from "../policies/PolicyProvider";
import { Security } from "./Security";

export namespace AuthProvider {
  export interface User {
    id: string;
    handle: string;
    nickname: string;
    biography: string | null;
    visibility: "public" | "friends" | "private";
  }
  export interface Session {
    user: User;
    access_token: string;
    refresh_token: string;
  }
  export interface RegistrationSession extends Session {
    recovery_code: string;
  }
  export interface Registration {
    login_id: string;
    handle: string;
    nickname: string;
    password: string;
    policy_document_ids: string[];
  }
  export interface Login {
    login_id: string;
    password: string;
  }
  export interface Refresh {
    refresh_token: string;
  }
  export interface Recovery {
    login_id: string;
    recovery_code: string;
    password: string;
  }
  export interface Password {
    password: string;
  }
  export interface RecoveryCode {
    recovery_code: string;
  }

  export let passwordVerifier: Security.PasswordVerifier | undefined;
  const attempts = new Map<string, { count: number; reset: number }>();
  const dummyPassword = Security.hashPassword(
    "계정 존재를 숨기는 고정 검증용 문자열",
  );

  function attempt(kind: string, identifier: string): void {
    const now = Date.now();
    for (const [key, entry] of attempts) if (entry.reset <= now) attempts.delete(
      key,
    );
    const key = Security.tokenHash(
      `${kind}:${identifier.trim().toLowerCase()}`,
    );
    const entry = attempts.get(key) ?? { count: 0, reset: now + 600_000 };
    entry.count++;
    attempts.set(key, entry);
    if (entry.count > 10) K.fail(
      429,
      "AUTH_RATE_LIMIT",
      "잠시 후 다시 시도하세요.",
    );
  }

  export function identifier(input: string): string {
    try {
      return Security.identifier(input);
    } catch {
      return K.fail(
        400,
        "INVALID_IDENTIFIER",
        "계정 식별자의 형식이 올바르지 않습니다.",
      );
    }
  }

  async function passwordHash(input: string): Promise<string> {
    try {
      await Security.screenPassword(
        input,
        MyGlobal.mode === "real",
        passwordVerifier,
      );
    } catch (error) {
      if (error instanceof Security.ScreeningUnavailable)
        K.fail(
          503,
          "PASSWORD_SCREENING_UNAVAILABLE",
          "비밀번호 보안 검증을 사용할 수 없습니다.",
        );
      K.fail(
        400,
        "INVALID_PASSWORD",
        "비밀번호가 허용된 보안 기준을 충족하지 않습니다.",
      );
    }
    return Security.hashPassword(input);
  }

  const invalidCredentials = (): never => K.fail(
    401,
    "INVALID_CREDENTIALS",
    "인증 정보를 확인하세요.",
  );

  export function actor(authorization?: string, tx?: K.Tx): Promise<users> {
    if (!tx) return K.transaction((connection) =>
      actor(authorization, connection),
    );
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization ?? "");
    if (!match) invalidCredentials();
    return authenticated(tx, Security.tokenHash(match![1]!));
  }

  async function authenticated(tx: K.Tx, hash: string): Promise<users> {
    const session = await tx.auth_sessions.findUnique({
      where: { access_token_hash: hash },
    });
    const now = Date.now();
    if (!session || session.revoked_at || session.deleted_at ||
        session.expires_at.getTime() <= now || session.access_expires_at.getTime() <= now)
      invalidCredentials();
    const user = await tx.users.findUnique({ where: { id: session!.user_id } });
    if (!user || user.deleted_at || !user.password_hash) invalidCredentials();
    return user!;
  }

  export async function issue(tx: K.Tx, user: users): Promise<Session> {
    const access_token = Security.token();
    const refresh_token = Security.token();
    await tx.auth_sessions.create({
      data: {
        user_id: user.id,
        access_token_hash: Security.tokenHash(access_token),
        refresh_token_hash: Security.tokenHash(refresh_token),
        access_expires_at: new Date(Date.now() + 900_000),
        expires_at: new Date(Date.now() + 30 * 86400_000),
        ...K.audit(user.id),
      },
    });
    return { user: K.publicUser(user), access_token, refresh_token };
  }

  export async function recoveryCode(tx: K.Tx, userId: string): Promise<string> {
    const recovery_code = Security.token();
    await tx.recovery_codes.updateMany({
      where: {
        user_id: userId,
        used_at: null,
        revoked_at: null,
        deleted_at: null,
      },
      data: { revoked_at: new Date(), ...K.changed(userId) },
    });
    await tx.recovery_codes.create({
      data: {
        user_id: userId,
        code_hash: Security.tokenHash(recovery_code),
        ...K.audit(userId),
      },
    });
    return recovery_code;
  }

  export async function register(input: Registration): Promise<RegistrationSession> {
    K.keys(input, [
      "login_id",
      "handle",
      "nickname",
      "password",
      "policy_document_ids",
    ]);
    const login_id = identifier(input.login_id);
    const handle = identifier(input.handle);
    const nickname = input.nickname.trim();
    if (!nickname || [...nickname].length > 100) K.fail(
      400,
      "INVALID_NICKNAME",
      "닉네임의 길이가 올바르지 않습니다.",
    );
    const password_hash = await passwordHash(input.password);
    return K.transaction(async (tx) => {
      const reserved = await tx.user_identifiers.findFirst({ where: { OR: [
        { kind: "login_id", value: login_id }, { kind: "handle", value: handle },
      ] } });
      const existing = await tx.users.findFirst({ where: { OR: [{ login_id }, { handle }] } });
      if (reserved || existing) K.fail(409, "IDENTIFIER_RESERVED", "사용할 수 없는 계정 식별자입니다.");
      const id = randomUUID();
      const user = await tx.users.create({ data: { id, login_id, handle, nickname, password_hash, ...K.audit(id) } });
      await tx.user_identifiers.createMany({ data: [
        { user_id: id, kind: "login_id", value: login_id, ...K.audit(id) },
        { user_id: id, kind: "handle", value: handle, ...K.audit(id) },
      ] });
      await PolicyProvider.agree(tx, id, input.policy_document_ids);
      return { ...await issue(tx, user), recovery_code: await recoveryCode(tx, id) };
    });
  }

  export function login(input: Login): Promise<Session> {
    K.keys(input, ["login_id", "password"]);
    attempt("login", input.login_id);
    let login_id: string;
    try {
      login_id = Security.identifier(input.login_id);
    } catch {
      return invalidCredentials();
    }
    return K.transaction(async (tx) => {
      const user = await tx.users.findUnique({ where: { login_id } });
      const valid = await Security.verifyPassword(input.password, user?.password_hash ?? await dummyPassword);
      if (!user || user.deleted_at || !valid) invalidCredentials();
      return issue(tx, user!);
    });
  }

  export function refresh(input: Refresh): Promise<Session> {
    K.keys(input, ["refresh_token"]);
    return K.transaction(async (tx) => {
      const session = await tx.auth_sessions.findUnique({ where: { refresh_token_hash: Security.tokenHash(input.refresh_token) } });
      if (!session || session.revoked_at || session.deleted_at || session.expires_at.getTime() <= Date.now()) invalidCredentials();
      const user = await tx.users.findUnique({ where: { id: session!.user_id } });
      if (!user || user.deleted_at || !user.password_hash) invalidCredentials();
      await tx.auth_sessions.update({ where: { id: session!.id }, data: { revoked_at: new Date(), ...K.changed(user!.id) } });
      return issue(tx, user!);
    });
  }

  export function logout(authorization: string | undefined, input: Refresh): Promise<void> {
    K.keys(input, ["refresh_token"]);
    return K.transaction(async (tx) => {
      const user = await actor(authorization, tx);
      const session = await tx.auth_sessions.findUnique({ where: { refresh_token_hash: Security.tokenHash(input.refresh_token) } });
      if (!session || session.user_id !== user.id || session.revoked_at ||
          session.access_token_hash !== Security.tokenHash(authorization!.slice(7))) invalidCredentials();
      await tx.auth_sessions.update({ where: { id: session!.id }, data: { revoked_at: new Date(), ...K.changed(user.id) } });
    });
  }

  export async function recover(input: Recovery): Promise<RegistrationSession> {
    K.keys(input, ["login_id", "recovery_code", "password"]);
    attempt("recovery", input.login_id);
    let login_id: string;
    try {
      login_id = Security.identifier(input.login_id);
    } catch {
      return invalidCredentials();
    }
    const password_hash = await passwordHash(input.password);
    return K.transaction(async (tx) => {
      const user = await tx.users.findUnique({ where: { login_id } });
      const code = await tx.recovery_codes.findUnique({ where: { code_hash: Security.tokenHash(input.recovery_code) } });
      if (!user || user.deleted_at || !code || code.user_id !== user.id || code.used_at || code.revoked_at || code.deleted_at)
        invalidCredentials();
      await tx.recovery_codes.update({ where: { id: code!.id }, data: { used_at: new Date(), ...K.changed(user!.id) } });
      const updated = await tx.users.update({ where: { id: user!.id }, data: { password_hash, auth_version: { increment: 1 }, ...K.changed(user!.id) } });
      await tx.auth_sessions.updateMany({ where: { user_id: user!.id, revoked_at: null }, data: { revoked_at: new Date(), ...K.changed(user!.id) } });
      return { ...await issue(tx, updated), recovery_code: await recoveryCode(tx, user!.id) };
    });
  }

  export function reissue(authorization: string | undefined, input: Password): Promise<RecoveryCode> {
    K.keys(input, ["password"]);
    return K.transaction(async (tx) => {
      const user = await actor(authorization, tx);
      attempt("reissue", user.id);
      if (!await Security.verifyPassword(input.password, user.password_hash!)) invalidCredentials();
      return { recovery_code: await recoveryCode(tx, user.id) };
    });
  }
}
