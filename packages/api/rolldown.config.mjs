import ttsc from "@ttsc/unplugin/rolldown";
import path from "node:path";
import { globSync } from "tinyglobby";

// The `.mjs` build feeds the TypeScript sources straight to rolldown, which
// transpiles them natively; `@ttsc/unplugin` applies the project's ttsc
// plugins on the way in. `preserveModules` keeps the 1:1 module layout, so
// every `lib/<path>.js` from the main ttsc build gets a genuine ESM twin at
// `lib/<path>.mjs` — named exports intact, no facade chunks, no CommonJS
// transcoding. Everything outside `src/` is an external module, including the
// package's type-only imports of itself.
export default {
  input: globSync("./src/**/*.ts"),
  external: (id) => !id.startsWith(".") && !path.isAbsolute(id),
  output: {
    dir: "./lib",
    format: "esm",
    // 현재 ttsc 변환은 매핑을 반환하지 않는다. 부정확한 ESM 맵은 발행하지 않는다.
    // TypeScript 빌드가 생성하는 CommonJS 소스맵은 그대로 유지한다.
    sourcemap: false,
    entryFileNames: "[name].mjs",
    preserveModules: true,
    preserveModulesRoot: "src",
  },
  plugins: [ttsc()],
};
