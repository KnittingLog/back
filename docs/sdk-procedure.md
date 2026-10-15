# 업무 API SDK 절차

## 현재 상태

- `packages/api`는 Nestia가 생성한 업무 API와 모니터 SDK입니다. 계정·인증·프로젝트 등 `/api/v1` 계약을 포함합니다. 샘플 모니터 API만 있는 상태가 아닙니다.
- 현재 패키지 이름은 `@knittinglog/api`입니다. npm scope 사용 승인과 발행은 별도입니다. npm 발행은 수행하지 않았습니다.
- SDK 생성의 기준은 [Nestia 설정](../packages/backend/nestia.config.ts)과 등록한 컨트롤러입니다. 생성 소스와 OpenAPI는 수동으로 수정하지 않습니다.
- 2026-10-15에 SDK 생성과 전체 빌드를 통과했습니다. 생성기는 컨트롤러 21개와 경로·라우트 선언 102개를 분석했습니다. 이 수는 고유 URL 수나 기능 ID 수가 아닙니다.
- 실제 SDK의 정책·모니터·인증 경계 호출을 격리 API에서 확인했습니다. 내 참여 이력 SDK 호출은 DB 없는 loopback 회귀 검사에서 확인했습니다. 그 검사의 인증·DB는 모의 구현입니다.
- 콘텐츠 복구·역이관·물리삭제와 파일 업로드·다운로드·제거의 신규 SDK 호출도 새 격리 DB·실제 HTTP에서 확인했습니다. 호출은 생성된 `Props` 객체에 `input`과 경로 매개변수를 넣습니다. Base64 파일 DTO를 사용하며, SDK에 없는 원시 바이너리 전송으로 대체하지 않습니다.
- [초기 샘플 SDK tarball 검사](verification.md#sdk-재현-결과)는 과거 결과입니다. 최신 업무 SDK의 pack·외부 소비자·실기기 수용은 다시 확인해야 합니다.
- 최근 실행 결과와 한계는 [구현 검증 기록](implementation-validation.md#복구파일분산-인증-보완-2026-10-15)이 소유합니다.


## 생성과 검사

1. 컨트롤러 등록, Nestia 설정과 `packages/api/package.json`을 확인합니다. 실제 환경 파일의 값을 로그에 출력하지 않습니다.
2. `pnpm -C packages/backend build:sdk`로 SDK와 OpenAPI를 생성합니다. 빌드에 필요한 환경은 접속 불가한 합성 CI DB 설정을 사용합니다.
3. 경로·메서드·버전·응답 타입과 SDK 공개 함수를 비교합니다. 다른 API의 계약이 바뀌면 원인을 확인합니다.
4. `pnpm lint`와 `pnpm build`를 실행합니다. 일반 빌드는 업무 DB를 초기화하는 검사가 아닙니다.
5. DB 없는 회귀 검사는 `pnpm -C packages/backend ttsx --project test/tsconfig.json test/unit/account-memberships.ts`로 실행합니다. 실제 업무 인증·DB 검사는 승인된 `test:integration:isolated`로 분리합니다.

## 내 참여 이력 호출 변경

`GET /api/v1/users/me/memberships`는 AccountController가 담당합니다. 기존 HTTP 경로와 응답 필드는 유지합니다. 현재·종료한 자신의 프로젝트 참여 기간을 `created_at DESC, id DESC`로 반환합니다.

SDK 호출은 다음 하나를 사용합니다.

```ts
await api.functional.api.v1.users.me.memberships(connection);
```

중복 컨트롤러 제거 후 Nestia가 공개 함수를 단일 호출로 생성했습니다. 기존 `users.me.memberships.memberships(connection)`과 `users.me.memberships.get(connection)`을 사용하는 클라이언트는 위 호출로 수정해야 합니다. 기존 중첩 함수를 직접 import한 소비자도 확인해야 합니다. 호환 별칭은 추가하지 않았습니다.

## Pack과 외부 소비자 검증

1. 최신 소스를 빌드한 뒤 `pnpm -C packages/api pack --pack-destination <임시 폴더>`로 tarball을 만듭니다. `prepack`이 빌드를 다시 수행합니다. npm 발행은 포함하지 않습니다.
2. tarball 안의 `package.json`에서 `publishConfig`가 실제 `main`·`module`·`types`·`exports`에 반영됐는지 확인합니다. 모든 대상 파일이 tarball에 있어야 합니다.
3. `catalog:` 의존성의 치환과 비밀값·환경 파일·서버 구현 코드의 부재를 확인합니다.
4. 승인된 격리 소비자에서 ESM·CommonJS import와 타입 해석을 확인합니다. workspace 소스 import 성공을 tarball 검사로 대신하지 않습니다.
5. 내 참여 이력의 새 호출과 실제 HTTP 응답을 소비자에서 확인합니다. 클라이언트 저장소 수정과 실기기 검증은 별도 범위입니다.

이번 문서 최신화에서는 pack·소비자 검사·npm 발행·클라이언트 수정·배포를 수행하지 않았습니다. 기존 임시 tarball의 성공을 최신 업무 SDK의 성공으로 표시하지 않습니다.
