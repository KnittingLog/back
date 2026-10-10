import path from "node:path";

import { evidence, type ITtscEvidenceGraphConfig } from "@ttsc/evidence";
import type { ITtscLintConfig } from "@ttsc/lint";

const graph: ITtscEvidenceGraphConfig = {
  claims: [
    {
      name: "knittinglog-requirements",
      type: "typescript",
      root: __dirname,
      files: [
        "src/controllers/KnittingLogModule.ts",
        "src/controllers/common/KnittingLogExceptionFilter.ts",
        "src/controllers/{auth,accounts,policies,social,projects,workspaces,records,community,reports}/v1/**/*.ts",
        "src/providers/{auth,accounts,policies,social,projects,workspaces,records,community,reports}/**/*.ts",
        "src/providers/common/KnittingLogContext.ts",
        "test/features/api/knittinglog/**/*.ts",
        "test/unit/**/*.ts",
        "test/integration/**/*.ts",
      ],
      reference: {
        type: "markdown",
        root: path.resolve(__dirname, "../.."),
        files: ["docs/requirements.md"],
        symbol: ["h2", "h3"],
        noEvidenceExclude: true,
      },
    },
  ],
};

const config = {
  extends: "./lint.config.ts",
  plugins: { evidence },
  rules: {
    // 기존 구현의 근거를 검토하기 전에는 누락을 경고로 보고한다.
    "evidence/graph": ["warning", graph],
  },
} satisfies ITtscLintConfig;

export default config;
