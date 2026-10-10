import type { ITtscLintConfig } from "@ttsc/lint";

export default {
  extends: "./config/lint.config.ts",
  // 패키지 간 참조에도 생성 코드의 기존 제외 범위를 유지한다.
  ignores: [
    "packages/api/src/functional/**/*.ts",
    "packages/backend/src/prisma/**/*.ts",
  ],
} satisfies ITtscLintConfig;
