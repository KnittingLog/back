# 뜨개로그 API SDK

`@knittinglog/api`는 Nestia가 백엔드 컨트롤러에서 생성한 TypeScript SDK입니다. 계정·인증·프로젝트 등 `/api/v1` 업무 API와 기존 `/monitors` API를 포함합니다. BBS 샘플 API는 제공하지 않습니다.

npm 발행은 수행하지 않았습니다. 이 저장소의 workspace에서는 소스 진입점을 사용합니다. 외부 배포의 ESM·CommonJS·타입 진입점은 `publishConfig`에 정의돼 있습니다. 최신 업무 SDK의 tarball과 외부 소비자 검증은 별도입니다.

## 사용 예시

`host`는 서버 원점입니다. SDK가 `/api/v1`을 포함한 경로를 추가합니다. 인증이 필요한 호출에는 유효한 Bearer 토큰을 전달합니다. 인증 토큰과 응답은 로그에 출력하지 않습니다.

```ts
import api from "@knittinglog/api";

async function loadMemberships(host: string, accessToken: string) {
  const connection: api.IConnection = {
    host,
    headers: { Authorization: `Bearer ${accessToken}` },
  };
  return api.functional.api.v1.users.me.memberships(connection);
}
```

내 참여 이력 호출은 현재·종료한 자신의 프로젝트 참여 기간을 최신순으로 반환합니다. 중복 컨트롤러 제거 후 기존 `users.me.memberships.memberships(connection)`과 `users.me.memberships.get(connection)`은 제거됐습니다. 위 단일 호출로 수정해야 합니다. HTTP 경로와 응답 필드는 유지합니다.

## 생성과 검증

저장소 루트에서 `pnpm -C packages/backend build:sdk`로 SDK와 OpenAPI를 재생성합니다. `pnpm build`는 SDK와 백엔드를 빌드합니다. 실행 전 합성 로컬 환경 설정을 준비합니다. 생성 소스는 수동으로 수정하지 않습니다.

2026-10-11에 SDK 생성·빌드와 loopback 내 참여 이력 호출을 확인했습니다. 해당 호출 검사의 인증·DB는 모의 구현입니다. 정책·모니터·인증 경계의 SDK 호출은 실제 격리 API에서 확인했습니다. 외부 클라이언트 수정·실기기·npm 발행·배포는 검증하지 않았습니다.

전체 절차와 검증 한계는 저장소의 [SDK 절차](../../docs/sdk-procedure.md)와 [구현 검증 기록](../../docs/implementation-validation.md#내-참여-이력-조회-통합-2026-10-11)을 확인합니다. 이 링크는 저장소에서 사용합니다. npm tarball에는 저장소의 `docs` 폴더를 포함하지 않습니다.
