import { MyBackend } from "../MyBackend";

const EXTENSION = __filename.substr(-2);
if (EXTENSION === "js") require("source-map-support/register");

async function main(): Promise<void> {
  // BACKEND SEVER LATER
  const backend: MyBackend = new MyBackend();
  await backend.open();

  // POST-PROCESS
  process.send?.("ready");
  process.on("SIGTERM", () => {
    void (async () => {
      await backend.close();
      process.exit(0);
    })();
  });
  const failure = (): void => {
    console.error("예기치 않은 오류로 서버를 종료합니다.");
    void backend.close().finally(() => process.exit(1));
  };
  global.process.on("uncaughtException", failure);
  global.process.on("unhandledRejection", failure);
}
main().catch(() => {
  console.error("서버 시작에 실패했습니다. 실행 설정을 확인하세요.");
  process.exit(-1);
});
