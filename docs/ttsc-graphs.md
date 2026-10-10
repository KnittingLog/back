# ttsc 그래프 설정

## 목적과 범위

- `@ttsc/evidence`는 요구사항과 구현 근거의 연결을 검사한다.
- `@ttsc/graph`는 TypeScript 컴파일러가 해석한 코드 관계를 MCP로 제공한다.
- 이 프로젝트는 `LOCAL_ONLY`에서 두 기능을 실행한다.
- 프로젝트 `ttsc`, graph, evidence, lint, paths, unplugin은 카탈로그에서 `0.30.4`로 고정한다.
- 0.31.0에서는 기존 Nestia host의 emit provenance 미지원으로 `ttsx` 실행이 실패했다. 최종 0.30.4에서 실제 실행을 확인한다.
- 기존 lint 규칙은 유지한다. infer·매핑 타입의 쉼표 검사 패치도 유지한다.
- 루트 `lint.config.ts`는 생성 SDK·Prisma 코드의 기존 제외 범위를 두 패키지에 적용한다.
- 설치는 `pnpm install --frozen-lockfile --ignore-scripts`로 수행할 수 있다.
- 최초 검사는 Go 플러그인을 빌드한다. Node.js 22.15 이상과 ttsc가 번들한 Go 도구를 사용한다.
- 최초 설치와 Go 의존성 다운로드에는 네트워크 연결이 필요하다.

## Evidence Graph

설정 소유자는 `packages/backend/lint.evidence.config.ts`이다.
공유 lint 설정과 생성 SDK에는 Evidence 규칙을 추가하지 않는다.

참조 범위는 `docs/requirements.md`의 H2·H3 제목이다.
근거 범위는 KnittingLog 컨트롤러·Provider와 API·단위·통합 테스트이다.
TypeScript 파일은 해당 검사에서 사용하는 tsconfig의 Program에 포함되어야 한다.
일반 빌드와 lint는 기존 코드 규칙과 타입을 검사한다.
아래 별도 명령은 `test/tsconfig.evidence.json`으로 구현과 테스트의 전체 요구사항 연결을 검사한다.
DDL 승인과 운영 복구 등 코드만으로 증명할 수 없는 요구사항의 누락도 계속 보고한다.
CI도 빌드 다음의 독립 단계에서 같은 명령을 실행한다.

```sh
pnpm check:evidence
```

현재 규칙 수준은 `warning`이다. 근거 누락을 출력하지만 빌드를 실패시키지 않는다.
구현과 근거를 검토한 뒤 `evidence/graph`의 수준을 `error`로 바꾸면 누락이 빌드를 실패시킨다.
참조에서 제외 태그를 금지한다. 검사 통과만을 위한 포괄 인용은 추가하지 않는다.

근거는 선택된 공개 선언의 JSDoc에 작성한다. 예시는 실제 파일에 자동 적용되지 않는다.

```ts
/**
 * @evidence docs/requirements.md#7-api-버저닝 v1 경로의 공개 API를 제공한다.
 */
```

태그의 사유는 해당 선언이 실제로 수행하는 동작을 설명해야 한다.
파일 전체나 상위 제목 인용은 넓은 범위를 충족할 수 있으므로 검토가 필요하다.
기능별 추적표의 행 ID는 현재 독립 검사 단위가 아니다.
따라서 H2·H3 연결 검사는 기능 ID별 수용 검사나 API 실행 결과를 대신하지 않는다.
`documented`, `singular`, `todo`, `review` 규칙은 이번 초기 설정에서 활성화하지 않는다.

### 근거 검토 결과 (2026-10-11)

상태 전이와 피드·신고의 기존 구현 및 API 테스트에 실제 동작을 설명하는 `@evidence`를 연결했다. 별도 Evidence 경고는 20개에서 18개로 줄었다. 아래 근거를 연결한 뒤 새 격리 DB에서 HTTP 검사 44개를 통과했다.

- 상태 전이: [WorkspaceProvider](../packages/backend/src/providers/workspaces/WorkspaceProvider.ts), [업무 상태·타이머 검사](../packages/backend/test/features/api/knittinglog/test_api_knittinglog_workspaces.ts).
- 피드·신고: [CommunityProvider](../packages/backend/src/providers/community/CommunityProvider.ts), [ReportProvider](../packages/backend/src/providers/reports/ReportProvider.ts), [피드 검사](../packages/backend/test/features/api/knittinglog/test_api_knittinglog_feed.ts), [운영자 검사](../packages/backend/test/features/api/knittinglog/test_api_knittinglog_report_operator.ts).

18개는 H2·H3 단위의 근거 연결 누락이다. 18개 기능이 모두 미구현이라는 뜻은 아니다. 일부 제목에는 구현한 조항과 미검증 조항이 함께 있다. 일부 정적 DB 근거는 현재 TypeScript 선택 범위 밖의 Prisma·SQL·검사 스크립트에 있다. 포괄 태그로 이 차이를 숨기지 않는다.

| 남은 제목 | 유지 이유 |
|---|---|
| DB 표준, 4.1~4.6, 승인한 구조 설계 | 정적 설계·격리 DB 증거와 DDL 승인·운영 반영·실제 복구는 다른 범위이다. 전체 제목의 충족을 표시하지 않는다. |
| 공통 규칙, 기능별 추적표, 나가기·추방 이관, 정책 분석 | ID별 수용 범위와 이관·공개 범위의 전체 경계를 보장하지 않는다. 중간 오류 주입과 UI 범위의 공백도 남아 있다. |
| 확정 업무 정책, 6.1~6.3, 6.5 | 권한·타이머·인증의 통과 부분만으로 복구 도구·클라이언트 동작·전체 유출 비밀번호 공급자·운영 복원을 충족했다고 표시할 수 없다. |
| API 버저닝 | 현재 v1과 오류 계약은 검사했다. 구버전 폐기 승인·이관 기록과 병행 버전 계약 수용은 현재 검사 범위가 아니다. |

검사 범위와 `warning` 수준, 제외 태그 금지는 유지했다. 빌드의 경고 0개와 Evidence의 미충족 18개는 서로 다른 결과이다. 실행 결과와 운영 한계는 [구현 검증 기록](implementation-validation.md#도메인-구조-변경-후-통합-검사-2026-10-11)에 기록한다.

## Compiler Knowledge Graph

프로젝트 전용 Codex 설정은 `.codex/config.toml`에 있다.
전역 Codex 설정은 변경하지 않는다.

| MCP 이름 | 검사 대상 |
|---|---|
| `ttsc-graph-backend` | backend 구현과 테스트: `test/tsconfig.json` |
| `ttsc-graph-api` | 생성 SDK와 API 타입: `tsconfig.json` |

두 서버는 설치된 로컬 `@ttsc/graph`를 직접 실행한다.
CLI·MCP는 `.cache/ttsc`의 영속 캐시를 사용한다. 캐시 설정·버전 선택·실행 검증은 [ttsc-cache.md](ttsc-cache.md)가 소유한다.
시작 시 `npx` 다운로드를 수행하지 않는다.
각 서버는 `inspect_typescript_graph` 도구를 제공한다.
MCP 초기화 응답에 도구 사용 지침이 포함된다.

Codex는 신뢰한 프로젝트의 `.codex/config.toml`만 읽는다.
설정 추가 후 클라이언트를 다시 시작하고 MCP 연결 상태를 확인한다.
현재 작업 공간의 절대 경로를 `cwd`로 고정했다.
저장소를 이동하면 두 `cwd`를 새 로컬 경로로 변경한다.

```sh
codex mcp get ttsc-graph-backend --json
codex mcp get ttsc-graph-api --json
pnpm check:graph
```

`check:graph`는 두 서버의 MCP 초기화·도구 목록·실제 개요 조회를 검사한 뒤 연결을 닫는다.
파일·노드·관계 수가 0이면 검사를 실패시킨다.
다른 MCP 클라이언트에는 아래 실행 명령을 등록할 수 있다.
이 명령은 stdio 서버이므로 대화형 코드 조회 화면을 열지 않는다.

```sh
pnpm graph:backend
pnpm graph:api
```

## 검증 한계

그래프 조회는 코드 관계를 확인한다. DB 무결성·API 동작·운영 수용을 증명하지 않는다.
Evidence 경고가 없는 상태도 근거 사유의 진실성이나 테스트 성공을 증명하지 않는다.
DB·API·운영 검증은 기존 수용 절차로 별도 수행한다.

## 이전 0.31.0 검증 기록

2026-10-10에 이 로컬 작업 공간에서 확인했다.

| 검사 | 결과 |
|---|---|
| `pnpm install --frozen-lockfile --ignore-scripts --offline` | 통과 |
| backend `ttsc -p tsconfig.json --noEmit` | 통과. 근거 누락 경고 20개 |
| `pnpm check:evidence` | 통과. 테스트 타입 검사 포함. 근거 누락 경고 20개 |
| `pnpm -C packages/api lint` | 통과 |
| `pnpm check:graph` | 두 서버의 초기화·도구 목록·개요 조회 통과 |
| backend 그래프 | 파일 185개, 노드 7,898개, 관계 47,699개 |
| API 그래프 | 파일 77개, 노드 1,595개, 관계 3,618개 |
| 별도 임시 Evidence 테스트 | `error` 수준에서 근거 누락은 종료 코드 2. 유효한 태그 추가 후 종료 코드 0 |
| `pnpm -C packages/api build:rolldown` | 통과. `SOURCEMAP_BROKEN` 경고 있음 |

이전 번들 빌드는 sourcemap 정확성을 검증하지 않았다.
현재 ESM 빌드는 매핑을 반환하지 않는 ttsc 변환의 부정확한 소스맵을 발행하지 않는다.
CommonJS 빌드의 TypeScript 소스맵은 유지한다. `SOURCEMAP_BROKEN` 로그를 필터링하지 않는다.
번들러가 생성한 `.ttsc/records`는 Git 추적에서 제외한다.
기존 Nestia·Typia의 peer 버전 경고는 이번 설정에서 변경하지 않았다.
현재 실행 중인 Codex 대화에서 MCP 도구가 다시 로드되었는지는 검증하지 않았다.
서비스·DB·API 테스트와 원격 CI는 실행하지 않았다.

## 최종 0.30.4 검증 기록

0.31.0의 native emit provenance 요구와 기존 Nestia host의 불일치로 런타임 probe가 실패했다.
최종 버전은 가장 가까운 이전 공식 안정 릴리스 0.30.4이다.
Nestia·프로젝트 Typia·TypeScript 버전과 lint 정책은 변경하지 않았다.
0.30.4 lint 패치에는 같은 infer·매핑 타입 보호 조건을 적용했다. 이전 패치 파일도 보존했다.

| 검사 | 최종 결과 |
|---|---|
| compiler·graph·evidence·lint·paths·unplugin | 모두 0.30.4로 고정·해석됨 |
| frozen·ignore-scripts·offline 설치 | 종료 0. 바이너리 8개의 해시·mtime 보존 |
| backend 기본·테스트 noEmit | 종료 0. Evidence 누락 경고 20개 유지 |
| API noEmit | 종료 0 |
| backend ttsx probe, 직접·런처 | 기존 test tsconfig에 포함되는 임시 파일로 실제 출력, 종료 0. 파일 제거와 원본 해시 보존 확인 |
| `pnpm check:graph` | 두 MCP 초기화·도구 목록·실제 개요 조회 성공 |
| backend 그래프 | 파일 185개, 노드 6,490개, 관계 46,113개 |
| API 그래프 | 파일 77개, 노드 897개, 관계 2,756개 |
| API Rolldown | 종료 0. `SOURCEMAP_BROKEN` 경고 43개 유지 |
| `git diff --check` | 성공 |

node·edge 수는 이전 0.31.0과 다르다. 버전별 그래프 표현 차이를 소스 삭제나 동작 동일성의 증거로 해석하지 않는다.
검사 스크립트는 조정자 승인으로 SDK transport에 필터링한 compiler 환경만 전달한다.
MCP 설정의 서버 명령·cwd·tsconfig·timeout은 바꾸지 않았다.
환경 전달 수정 전의 graph 요청은 기본 node_modules 캐시를 빌드하다 120초 timeout으로 실패했다.
이를 최종 성공 기록에 섞지 않는다. 수정 후와 frozen 설치 후의 실제 조회는 빌드 안내 없이 성공했다.
잠금 프로토콜 차이·cold 비용·캐시 크기·정확한 원인과 한계는 [ttsc-cache.md](ttsc-cache.md)에 기록했다.
기존 live editor·MCP 서버는 재시작하지 않았다. 현재 대화의 도구 재로드는 검증하지 않았다.
probe 성공은 문자열 출력만 검증했다. 서비스·DB·전체 API 테스트·SDK/Prisma 생성·원격 CI·배포는 실행하지 않았다.

## 공식 자료

- [Evidence 설정](https://ttsc.dev/docs/setup/evidence/)
- [Evidence 범위와 설정](https://ttsc.dev/docs/evidence/claims/)
- [Evidence 태그](https://ttsc.dev/docs/evidence/tags/)
- [Compiler Knowledge Graph 설정](https://ttsc.dev/docs/setup/graph/)
- [Codex MCP 설정](https://developers.openai.com/codex/mcp)
- [Codex 프로젝트 설정](https://developers.openai.com/codex/config-basic)
