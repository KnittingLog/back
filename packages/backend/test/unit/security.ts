import assert from "node:assert/strict";

import { Security } from "../../src/providers/auth/Security";

async function main(): Promise<void> {
  assert.equal(Security.identifier("  USER.Name_1  "), "user.name_1");
  for (const input of ["ab", ".abc", "abc_", "ab..cd", "한글abc", "Kelvin", "a".repeat(33)])
    assert.throws(() => Security.identifier(input));
  const password = " 암호 Unicode Password  ";
  assert.equal(Security.password(password), password);
  for (const input of ["short", "passwordpassword", "a".repeat(129)])
    assert.throws(() => Security.password(input));
  await assert.rejects(Security.screenPassword(password, true), Security.ScreeningUnavailable);
  await assert.rejects(Security.screenPassword(password, true, async () => "breached"));
  await assert.rejects(Security.screenPassword(password, false, async () => "unavailable"), Security.ScreeningUnavailable);
  assert.equal(await Security.screenPassword(password, true, async () => "safe"), password);
  const hash = await Security.hashPassword(password);
  assert.ok(!hash.includes(password));
  assert.ok(await Security.verifyPassword(password, hash));
  assert.ok(!(await Security.verifyPassword(password.trim(), hash)));
  assert.ok(!(await Security.verifyPassword(password, "invalid")));
  const token = Security.token();
  assert.ok(token.length >= 40);
  assert.equal(Security.tokenHash(token).length, 64);
  assert.notEqual(Security.tokenHash(token), token);
  assert.notEqual(token, Security.token());
  console.log("PASS security normalization, password hashing and opaque tokens");
}

main().catch(() => {
  console.error("FAIL security normalization, password hashing and opaque tokens");
  process.exitCode = 1;
});
