import assert from "node:assert/strict";
import { assert as assertType, is, TypeGuardError } from "typia";

// 정상값과 잘못된 값으로 실제 변환과 런타임 거부를 함께 검사한다.
export async function test_api_monitor_typia_transform(): Promise<void> {
  const input = { value: 1 };
  assert.deepEqual(assertType<{ value: number }>(input), input);
  assert.equal(is<{ value: number }>({ value: "1" }), false);
  assert.throws(
    () => assertType<{ value: number }>({ value: "1" }),
    TypeGuardError,
  );
}
