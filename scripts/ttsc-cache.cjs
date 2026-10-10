const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const [command, ...args] = process.argv.slice(2);
const packages = {
  ttsc: "ttsc",
  ttsx: "ttsc",
  "ttsc-graph": "@ttsc/graph",
  rolldown: "rolldown",
  nestia: "nestia",
};
const env = { ...process.env };
// 명시한 캐시와 Go 설정은 보존한다. 기본 캐시만 설치 디렉터리 밖으로 옮긴다.
env.TTSC_CACHE_DIR ||= path.join(root, ".cache", "ttsc");

let binary;
let childArgs;
if (command === "node") {
  binary = process.execPath;
  childArgs = args;
} else if (Object.hasOwn(packages, command)) {
  const manifest = require.resolve(`${packages[command]}/package.json`, {
    paths: [process.cwd(), path.join(root, "packages/backend")],
  });
  binary = process.execPath;
  childArgs = [
    path.resolve(path.dirname(manifest), require(manifest).bin[command]),
    ...args,
  ];
} else {
  console.error("지원하는 명령: ttsc, ttsx, ttsc-graph, rolldown, nestia, node");
  process.exit(2);
}

// 작업 디렉터리, 표준 입출력, 종료 코드와 신호를 원래 도구에 전달한다.
const child = spawn(binary, childArgs, { env, stdio: "inherit" });
const interrupt = () => child.kill("SIGINT");
const terminate = () => child.kill("SIGTERM");
process.on("SIGINT", interrupt);
process.on("SIGTERM", terminate);
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", terminate);
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
