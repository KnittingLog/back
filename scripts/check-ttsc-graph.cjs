const assert = require("node:assert/strict");
const path = require("node:path");
const { createRequire } = require("node:module");

const root = path.resolve(__dirname, "..");
const graphRequire = createRequire(
  require.resolve("@ttsc/graph/package.json", {
    paths: [path.join(root, "packages/backend")],
  }),
);
const { Client } = graphRequire("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = graphRequire(
  "@modelcontextprotocol/sdk/client/stdio.js",
);

// SDK의 기본 상속 목록에 없는 컴파일러 설정만 전달한다. 다른 서비스의 비밀값은 추가하지 않는다.
const compilerEnvKeys = new Set([
  "GOCACHE", "GOMODCACHE", "GOFLAGS", "GOTOOLCHAIN", "GOOS", "GOARCH",
  "GOROOT", "GOPATH", "GOENV", "GOEXPERIMENT", "GODEBUG", "GOPROXY",
  "GOSUMDB", "GOPRIVATE", "GONOPROXY", "GONOSUMDB", "CC", "CXX",
  "PKG_CONFIG", "GOAMD64", "GOARM", "GOARM64", "GO386", "GOMIPS",
  "GOMIPS64", "GOPPC64", "GORISCV64", "GOWASM", "GOFIPS140",
  "GO_EXTLINK_ENABLED", "GCCGO", "GCCGOTOOLDIR", "AR", "FC",
]);
const compilerEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => /^(TTSC_|CGO_)/.test(key) || compilerEnvKeys.has(key),
  ),
);

async function check(name, tsconfig) {
  const client = new Client({ name: "knittinglog-graph-check", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      `packages/${name}/node_modules/@ttsc/graph/lib/bin.js`,
      "--cwd",
      `packages/${name}`,
      "--tsconfig",
      tsconfig,
    ],
    cwd: root,
    env: compilerEnv,
    stderr: "inherit",
  });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert(tools.some((tool) => tool.name === "inspect_typescript_graph"));
    const response = await client.callTool(
      {
        name: "inspect_typescript_graph",
        arguments: {
          question: "프로젝트의 파일과 코드 관계 수를 확인한다.",
          draft: {
            reason: "연결 확인에는 개요 조회만 필요하다.",
            type: "overview",
          },
          review: "파일 본문이나 서비스 실행은 필요하지 않다.",
          request: { type: "overview", aspect: "layers" },
        },
      },
      undefined,
      { timeout: 120_000 },
    );
    assert(!response.isError, JSON.stringify(response));
    const { result } = response.structuredContent;
    assert.equal(result.type, "overview");
    assert(result.counts.files > 0);
    assert(result.counts.nodes > 0);
    assert(result.counts.edges > 0);
    console.log(`${name}: ${JSON.stringify(result.counts)}`);
  } finally {
    await client.close();
  }
}

(async () => {
  await check("backend", "test/tsconfig.json");
  await check("api", "tsconfig.json");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
