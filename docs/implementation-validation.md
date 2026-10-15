# 구현 검증 기록

이 문서는 시점별 실행 기록이다. 과거의 미구현·미검증 항목이 최근 보완에서 바뀔 수 있다. 현재 적용 내용과 추가 작업은 [구현 현황과 추가 작업 명세](implementation-status.md)를 먼저 확인한다.

## 기준과 실행 대상

- 검증일은 2026-10-10입니다. 실행 모드는 `LOCAL_ONLY`이고 호스트는 `luke-choiui-MacBookAir.local`입니다.
- 기능의 기준 문서는 [확정 요구사항](requirements.md)입니다. 저장 계약은 [테이블 설계](erd-design.md), HTTP 계약과 요구사항 추적은 [API 테스트 계약](api-test-contract.md)에서 관리합니다.
- 서브 에이전트가 저장 계약, 계정·인증, API 계약·커뮤니티를 나누어 구현했습니다. ERD의 RED와 GREEN을 먼저 확인하고 업무 API를 개발했습니다.
- 실제 DB 검증 대상은 새로 만든 PostgreSQL 18.4 클러스터입니다. 주소는 `127.0.0.1:50799`, DB는 `knittinglog_tdd`, 데이터 경로는 `/private/tmp/knittinglog-tdd.TBW2BM/postgres`입니다.
- 생성 SQL과 보완 제약 SQL은 이 DB에만 적용했습니다. 기존 DB와 운영 DB에 마이그레이션을 적용하지 않았습니다. 실제 환경 파일도 변경하지 않았습니다.
- API 테스트는 실제 Nest 서버와 실제 PostgreSQL을 사용했습니다. 모의 HTTP 응답을 사용하지 않았습니다. 계정과 운영자 세션은 테스트 중 새로 발급했습니다.
- 설치된 도구를 직접 실행했습니다. pnpm의 레지스트리 서명 조회 실패를 우회하지 않았고 의존성이나 잠금 파일을 변경하지 않았습니다.

## TDD 증거

| 범위 | RED | GREEN과 증거의 한계 |
|---|---|---|
| ERD 저장 계약 | 타이머·명령 영수증·예약 식별자·복구 코드·시스템 주체·신고 조치 모델 누락 6개 | 모델 27개, 논리 관계 47개, CHECK 설계 34개, 부분 고유 인덱스 설계 4개. 물리 FK는 0개입니다. |
| 업무 HTTP 계약 | 구현 전 모니터 200, 정책 API 404. 실제 변환 설정의 기준 실행은 43개 실패와 운영자 fixture 부재 1개 BLOCKED | 실제 API 44개 통과, 실패 0개, BLOCKED 0개. 전체 실행을 반복했고 마지막 실행에는 생성 SDK 호출도 포함했습니다. |
| 작성자 표시·운영자 권한 | 탈퇴한 작성자의 응답 필드 불일치, 일반 사용자의 운영 API 상태 코드 불일치 | 작성자 익명 표시, 운영 권한, 신고 검토·숨김·종결·재시도·증거 불변 테스트 통과 |
| 서버 타이머 | 일시정지한 미완료 타이머가 있는 작업 공간을 done으로 변경할 때 409 대신 200 | 상태 변경 거부와 타이머 보존, 종료 후 완료 허용 통과 |
| 시각 저장·조회 | `2020-01-01T09:00:00Z`와 기대값 `2020-01-01T00:00:00Z` 불일치 | DB 세션 UTC 고정 후 실제 PostgreSQL 시각 왕복 통과 |
| 필수 정책 재동의 | 과거의 필수 재동의 버전을 뒤의 선택적 버전으로 우회할 수 있음 | 필수 동의 누락 거부와 최신 버전 동의 허용 통과. 검사 데이터는 전체 롤백했습니다. |
| 격리 DB 대상·UTC 옵션 | URL 쿼리의 접속 대상 재지정과 timezone 옵션 덮어쓰기 검사 2개 실패 | 연결 전 쿼리·앵커 거부, 기존 옵션 보존과 마지막 UTC 옵션 검사 2개 통과. 이 검사는 DB 연결 없이 수행합니다. |
| 계정 보안·공개 투영 | 보안 규칙과 공개 필드 선행 검사 실패 | 비밀번호·해시·복구 코드 보안 검사와 공개 필드 검사 통과. 투영 단위 테스트는 실제 DB 조인 증거가 아닙니다. |
| API 버저닝 | v1 정상 경로가 200 대신 404 | v1 허용, 버전 누락·미지원 404, 기존 모니터 경로 유지 통과 |
| 시작 실패 로그 | 합성 환경값 표식이 시작 오류 출력에 포함됨 | 비밀값 없이 일반 오류만 출력하고 비정상 종료하는 검사 통과. 빈 임시 폴더에서 실제 환경 파일 없이 실행합니다. |

초기 임시 설정에서 실행한 39개 실패에는 typia 변환 누락이 있었습니다. 이 실행을 기능 39개의 RED로 계산하지 않습니다. 재동의 검사의 첫 fixture 오류와 서버 실행 권한 오류도 기능 RED에서 제외합니다. BLOCKED는 실패와 통과를 대신하지 않습니다.

## 최종 검사

아래 상대 경로 명령은 패키지 디렉터리에서 실행합니다. DB를 사용하는 명령에는 위 격리 대상의 합성 로컬 설정을 전달했습니다. 실제 환경 파일의 값을 복사하지 않았습니다.

| 실행 위치 | 명령·검사 | 결과 |
|---|---|---|
| backend | `node_modules/.bin/prisma validate --schema prisma/schema` | 통과. 연결 불가 로컬 URL로 정적 검사했습니다. |
| backend | `node_modules/.bin/prisma generate --schema prisma/schema` | Prisma 7.10.0 클라이언트와 prisma-markdown 4.0.0 ERD 생성 통과 |
| backend | `node scripts/check-erd.cjs` | 모델·관계·감사 필드·보완 SQL·물리 FK 부재 통과 |
| backend | `node_modules/.bin/ttsc -p tsconfig.json` | 백엔드 컴파일 통과 |
| backend | `node_modules/.bin/ttsc -p test/tsconfig.json --noEmit` | 전체 테스트 타입 검사 통과 |
| backend | `node_modules/.bin/ttsx --project test/tsconfig.json test/isolated-api.ts` | `KNITTINGLOG_TEST_ALLOW_WRITES=1`과 확인한 격리 설정에서 44개 통과. 실제 SDK의 정책·모니터 호출과 익명 인증 거부도 통과 |
| backend | `node_modules/.bin/ttsx --project test/tsconfig.json test/unit/{security,account-projections,postgres-target,startup-redaction,api-versioning}.ts` | 각 파일을 따로 실행해 통과. 중괄호 표기는 파일 목록이며 하나의 실행 명령이 아닙니다. |
| backend | `node_modules/.bin/ttsx --project test/tsconfig.json test/integration/postgres-time.ts` | 실제 시각 왕복 통과 |
| backend | `node_modules/.bin/ttsx --project test/tsconfig.json test/integration/policy-gates.ts` | 필수 재동의 경계 통과, 전체 롤백 |
| 저장소 루트 | `psql -h 127.0.0.1 -p 50799 -U knittinglog_test -d knittinglog_tdd -f packages/backend/test/integration/erd-constraints.sql` | 실제 CHECK 거부 34개, 부분 고유 인덱스 거부·종료 이력 허용 4개 통과. 물리 FK 0개. 전체 롤백 |
| backend | `node_modules/.bin/nestia all` | SDK와 OpenAPI 생성 통과. 클론 DTO로 백엔드 런타임 의존을 제거했습니다. |
| api | `node_modules/.bin/ttsc -p tsconfig.json` | SDK 타입 검사·컴파일 통과 |
| api | `node_modules/.bin/rolldown -c` | ESM 빌드 통과. 변환 플러그인의 sourcemap 경고는 남아 있습니다. |
| 저장소 루트 | OpenAPI 경로 검사 | 경로 68개 중 업무 경로 65개는 모두 `/api/v1`, 모니터 경로 3개는 기존 경로입니다. 메서드를 포함한 생성 라우트는 90개입니다. |
| 저장소 루트 | `git diff --check`, 문서 링크·코드 블록 검사 | 통과 |

DB 제약 SQL은 행 내부 제약을 확인하려고 가짜 참조를 사용합니다. 이 결과는 FK 대신 수행하는 전체 업무 관계 검증이나 백업 복원 증거가 아닙니다. 기존 DB 초기화와 마이그레이션 폴더 삭제를 포함한 `pnpm test` 및 `webpack:test`는 실행하지 않았습니다.

## 로컬 실행 상태

- 최신 컴파일 결과를 `http://127.0.0.1:37011`에서 실행했습니다. 공개 정책 조회 주소는 `http://127.0.0.1:37011/api/v1/policy-documents`입니다.
- API는 loopback에만 바인딩합니다. 실행 폴더는 빈 임시 테스트 폴더이고 합성 설정을 명시적으로 전달했습니다. 운영자 허용 목록은 비어 있습니다.
- 최신 서버에서 health와 v1 정책 조회의 200, 버전 누락과 v2의 404를 다시 확인했습니다.
- 이 서버와 DB는 테스트 전용입니다. 정책 fixture와 QA 계정이 있으므로 실제 업무 데이터나 운영 환경으로 사용하지 않습니다.
- 서버 PID는 `86119`입니다. 중지하려면 이 프로세스의 실행 경로를 먼저 확인하고 `kill -TERM 86119`를 사용합니다. DB는 테스트 클러스터의 데이터 경로를 다시 확인한 뒤 `pg_ctl -D /private/tmp/knittinglog-tdd.TBW2BM/postgres stop -m fast`로 중지합니다. 검증 자료와 데이터를 삭제하지 않습니다.

## 미검증·남은 범위

| 범위 | 현재 한계 |
|---|---|
| 운영 마이그레이션·배포 | 적용하지 않았습니다. 기존 데이터의 정합성 검사, 승인한 이행과 롤백이 필요합니다. 커밋·push·배포도 수행하지 않았습니다. |
| 유출 비밀번호 전체 검사 | 주입 가능한 검증 인터페이스만 구현했습니다. 전체 유출 목록 공급자는 연결하지 않았습니다. `MODE=real`에서 공급자가 없으면 비밀번호 처리 요청을 503으로 거부합니다. 로컬의 제한 목록을 운영 검증으로 주장하지 않습니다. |
| 성능·다중 인스턴스 | 현재 트랜잭션은 전역 advisory lock으로 직렬화합니다. 처리량과 부하를 검증하지 않았습니다. 요청 제한도 프로세스 내부 상태이므로 분산 제한을 보장하지 않습니다. |
| 실제 복구 수용 | [복구 목표](data-recovery.md)는 확정했지만 실제 백업 복원, 파일 복원, RPO·RTO 측정과 복원 후 세션 재거부는 검증하지 않았습니다. |
| 콘텐츠 복구·역이관 실행 도구 | 제한된 신고 운영자 API는 있지만 콘텐츠 복구의 승인·실행 API와 도구는 없습니다. |
| 이관 중간 실패 | 성공·동시 요청·입력 거부와 데이터 보존을 확인했습니다. 결정적인 중간 오류 주입으로 전체 롤백을 확인하지 않았습니다. |
| UI·파일·실제 정책 배포 | UI, 파일 처리와 운영 정책 발행은 구현하지 않았습니다. DB의 정책 fixture는 테스트 전용 문서입니다. |

이 기록은 로컬 저장 계약과 위 테스트의 수용 증거입니다. 요구사항 전체의 운영 E2E 수용이나 운영 복구 완료를 뜻하지 않습니다.

## PR 준비 재검증 (2026-10-10)

- 기존 작업 공간의 변경을 의미 단위로 커밋했습니다. 기존 브랜치와 원격 `develop`에는 공통 조상이 없으므로 PR용 로컬 브랜치 `feat/knittinglog-api-pr`를 원격 `develop`의 `8707a25`에서 만들었습니다.
- PR 준비 경로는 `/private/tmp/knittinglog-api-pr-20261010`입니다. 기존 작업 공간과 브랜치는 보존했습니다. 원격 게시 대상은 사용자가 승인한 `feat/knittinglog-erd-schema`입니다.
- 원격의 `@knittinglog/*` 패키지 이름, NestJS 12 의존성, Typia 14.0.2 고정, Rolldown 범위, CI 환경 설정과 DB 초기화 비활성 상태를 유지했습니다. 새 코드의 SDK import만 원격 패키지 이름에 맞췄습니다.
- 원격 전용 문서, Prisma 스킬, 환경 예제와 Compose 설정은 보존했습니다. 초기 질문 문서에는 현재 정책 문서로 연결하는 이력 안내를 추가했습니다.
- 기존 로컬의 `packages/backend/.env`는 실제 파일을 유지하고 Git 추적만 해제했습니다. PR 기준 브랜치는 이미 이 파일을 추적하지 않습니다. 환경 파일과 개인 Codex 설정을 PR에 추가하지 않았습니다.

검증 도구는 Node.js 26.0.0과 설치된 pnpm 10.32.1입니다. 저장소의 `packageManager`는 10.10.0으로 유지했습니다. 이번 실행에서만 pnpm의 자동 버전 설치를 끄고 설치된 버전을 사용했습니다.
타입·컴파일·실행 검사는 기존 작업 공간의 `.cache/ttsc`를 명시하여 재사용했습니다. 새 경로의 cold 캐시 성능이나 CI의 Node.js 24 실행은 확인하지 않았습니다.

| 범위 | 이번 PR 브랜치 결과 |
|---|---|
| 잠금 파일 | 원격 의존성 선택을 보존하여 재생성. `install --frozen-lockfile --ignore-scripts` 통과. 생명주기 스크립트와 DB 작업은 실행하지 않았습니다. |
| Prisma | 연결 불가 합성 로컬 URL로 스키마 검증, 클라이언트·ERD 생성, `check-erd.cjs` 통과. ERD 재생성 후 파일 변경 없음. |
| backend | 기본 컴파일과 전체 테스트 `noEmit` 통과. Evidence 근거 연결 누락 경고 20개는 유지했습니다. |
| API SDK | `noEmit`과 Rolldown 1.2.13 번들 통과. `SOURCEMAP_BROKEN` 경고는 유지했습니다. Nestia SDK 재생성은 이번에 수행하지 않았습니다. |
| 단위·HTTP 경계 | `security`, `account-projections`, `postgres-target`, `startup-redaction`, `api-versioning`의 5개 파일 통과. 버전 검사는 DB 없는 실제 임시 loopback 서버를 사용했습니다. |
| 코드 그래프 | 두 MCP 서버의 초기화·도구 목록·실제 개요 조회 통과. backend 파일 185개·노드 6,490개·관계 46,113개, API 파일 76개·노드 896개·관계 2,756개. |

원래 로컬에서 제외한 `index 2.ts` 복사본은 PR에 포함하지 않았습니다. API 그래프의 파일·노드 수 차이를 기능 삭제 증거로 해석하지 않습니다.
Prisma 캐시 접근과 loopback 바인딩에는 정상 실행 승인 경로를 사용했습니다. 생성기의 PATH를 보완하여 ERD 생성을 다시 확인했습니다.
기존 Nestia·Typia peer 경고는 남아 있습니다. 버전 관리 자동 설치와 offline 의존성 메타데이터 부족 때문에 실패한 준비 명령은 최종 통과 검사에 포함하지 않습니다.

이번 PR 준비에서는 실제 DB/API 44개 수용 검사를 다시 실행하지 않았습니다. 위의 TDD·DB 기록은 이전 로컬 실행 이력이며 원격 의존성으로 재검증한 결과가 아닙니다.
운영 마이그레이션, 실제 복구, 부하, 배포와 머지는 수행하지 않았습니다. GitHub Actions 결과는 로컬 결과와 별도로 확인해야 합니다.

## PR #8 CI 검사 범위 수정

원격 실행 `38019916414`는 빌드 뒤 테스트 단계에서 실패했습니다. DB 없는 모니터 실행기가 업무 API 검사 44개까지 자동 발견했습니다. 쓰기 승인값과 격리 DB가 없으므로 업무 검사의 보호 조건이 실행을 거부했습니다. 모니터 2개는 통과했습니다.

기존 CI의 DB 없는 목적을 유지합니다. 모니터 명령에 `--include test_api_monitor_`를 지정하고 DB 초기화와 마이그레이션 폴더 삭제 경로를 사용하지 않습니다. 별도 단계에서 전체 테스트 타입 검사와 DB 없는 단위 테스트 5개를 실행합니다.

수정 명령을 로컬에서 실행하여 모니터 2개, 단위 테스트 5개와 전체 테스트 타입 검사를 확인했습니다. YAML 구조와 모니터 선택 조건도 검사했습니다. Evidence 경고 20개는 남아 있습니다.

격리 DB 수용 검사 `test/isolated-api.ts`는 별도 실행 경로로 유지합니다. 이번 수정은 그 검사의 안전 조건을 완화하거나 쓰기 승인을 자동으로 설정하지 않습니다. DB/API 44개 수용 검사의 CI 자동화나 재실행 통과를 뜻하지 않습니다.

## 도메인 구조 변경 후 통합 검사 (2026-10-11)

### 대상과 변경 범위

- 실행 모드는 `LOCAL_ONLY`이고 호스트는 `luke-choiui-MacBookAir.local`이다. 기준 커밋은 `develop`의 `93c050a`이고 도메인 폴더 분리 및 이번 로컬 변경을 검사했다.
- 기존 `127.0.0.1:50799`의 클러스터 경로가 `/private/tmp/knittinglog-tdd.TBW2BM/postgres`인 것을 읽기 전용으로 확인했다. 기존 서버·데이터는 변경하지 않았다.
- 이번 새 클러스터는 PostgreSQL 18.4, `127.0.0.1:50801`, DB `knittinglog_tdd`를 사용했다. 생성 SQL과 보완 제약은 새 DB에만 적용했다. 운영 마이그레이션 적용은 아니다.
- 실제 환경 파일을 변경하지 않았다. 접속 설정은 합성 테스트 값이다. 정책 fixture는 운영 문서가 아니며 운영자 계정·세션은 새 가입 API로 발급했다.
- [반복 실행기](../scripts/run-isolated-integration.cjs)와 `test:integration:isolated` 명령을 추가했다. 명시한 쓰기 승인 없이는 DB를 만들지 않는다. 외부 연결 설정과 사용 중인 포트도 거부한다.
- SQL의 과거 데이터 경로 하드코딩을 정확한 실행 대상 확인으로 바꿨다. 허용 포트는 기존 `50799`와 새 `50801`뿐이다. 일반 DB 포트, URL 쿼리·앵커와 Unix socket 우회는 허용하지 않는다.

### 발견한 실패와 수정

첫 유효한 HTTP 실행은 44개 중 43개 통과, 버전 검사 1개 실패, BLOCKED 0개였다. `/policy-documents` 요청은 404였지만 `text/html`을 반환했다. 설치된 NestJS 12의 접두어 밖 요청은 공통 예외 필터의 JSON 응답을 거치지 않았다.

DB 없는 회귀 검사에도 JSON 오류 본문 검사를 추가했다. 수정 전 이 검사는 실패했다. [MyBackend.configure](../packages/backend/src/MyBackend.ts)는 접두어 밖의 요청에 `{ code: "NOT_FOUND", message: "대상을 찾을 수 없습니다." }`를 반환한다. 정상 v1과 모니터 요청은 기존 처리기로 전달한다. 회귀 검사에서 CORS preflight의 204도 확인했다.

임시 실행기 준비 단계에서 SQL stdout와 Prisma 진단 stderr의 혼합, psql 종료 코드 처리를 발견했다. SQL과 진단 출력을 분리하고 실패는 명시한 SQL 예외로 중단하도록 수정했다. 이 준비 실패는 업무 기능의 RED로 계산하지 않았다. 각 임시 클러스터는 실패 시에도 종료했다.

### 최종 결과

| 범위 | 결과 |
|---|---|
| 실제 업무 HTTP | 44개 통과, 실패 0개, BLOCKED 0개. 가입·인증·차단·이관·동시성·카운터·타이머·신고·버저닝 포함 |
| 생성 SDK 호출 | 실제 정책 조회·모니터 조회·익명 인증 거부 통과 |
| 실제 DB 제약 | CHECK 거부 34개, 부분 고유 인덱스 거부·종료 이력 허용 4개, 물리 FK 0개 |
| SQL 검사 롤백 | 모든 업무 테이블의 검사 행이 0개인 것을 seed 전에 확인 |
| 접속·승인 보호 | 데이터 경로 누락·경로 불일치·포트 불일치·승인 누락·승인 거부·Unix socket 우회 거부 |
| 실제 UTC·재동의 | 시각 왕복과 필수 재동의 경계 통과. 재동의 fixture 전체 롤백 |
| 정적 검사 | lint·전체 테스트 타입/Evidence·backend/API 코드 그래프 통과 |
| 생성·빌드 | SDK 재생성과 전체 빌드 통과. 빌드 경고 0개 |
| 단위·모니터 | 독립 테스트 5개 파일과 DB 없는 모니터 2개 통과 |
| SDK·OpenAPI 비교 | SDK 소스 76개가 기준 커밋과 동일. 재생성 기준본과 OpenAPI JSON 구조도 동일 |
| 요구사항 Evidence | 상태 전이·피드/신고의 실제 구현과 검사 근거 연결. 경고 20개에서 18개로 감소 |

새 DB의 전체 HTTP 검사를 반복했다. 각 실행에서 API는 임시 loopback 포트를 사용했다. 검사 종료 뒤 새 PostgreSQL 서버를 중지했다. 데이터와 로그는 삭제하지 않았다. 일시정지 타이머 검사를 별도 신규 사례로 더하지 않았다. 기존 44개에 포함된 동일 함수이다.

실행 명령은 다음과 같다. 실제 환경 파일의 값을 전달하지 않는다.

```sh
KNITTINGLOG_TEST_ALLOW_WRITES=1 pnpm -C packages/backend test:integration:isolated
pnpm lint
pnpm check:evidence
pnpm check:graph
pnpm -C packages/backend build:sdk
pnpm build
git diff --check
```

단위·모니터 명령은 CI와 같은 범위를 사용했다. 최종 정적 검사 로그와 종료 코드는 `/private/tmp/knittinglog-domain-checks`에 보존했다. 실제 DB/API 로그는 각 실행기가 출력한 `/private/tmp/knittinglog-tdd.*` 아래에 보존했다.

최종 전체 실행의 데이터 경로는 `/private/tmp/knittinglog-tdd.3MEUEM/postgres`이다. 같은 폴더의 `results.json`, `isolated-api.log`, `erd-constraints.log`와 `guard-*.log`를 보존했다. 이 실행은 SDK 생성·빌드가 종료한 뒤 실행했다. 보호 조건 6개, SQL 롤백, DB 통합 검사와 HTTP 44개가 모두 통과했고 `stop`의 종료 코드는 0이다.

### 남은 경계

Evidence의 18개 제목은 여전히 전체 근거가 없다. 일부 구현·검사 결과를 포괄 태그로 전체 충족처럼 표시하지 않았다. [Evidence 검토 결과](ttsc-graphs.md#근거-검토-결과-2026-10-11)에 이유를 분리했다. 요구사항 전체, DDL 승인, 운영 이행·복원, 전체 유출 비밀번호 공급자, UI와 파일 처리가 완료됐다는 뜻은 아니다.

이번 실행은 결정적인 이관 중간 실패 주입, 실제 파일·PITR 복구, 부하와 다중 인스턴스 수용을 대신하지 않는다. 멤버십 조회의 기존 중복 경로는 폴더 변경과 같은 상태로 유지했다. 위 검증 시점에는 commit, push, 운영 DB 반영과 배포를 수행하지 않았다. GitHub Actions에서도 통합 검사를 자동 실행하도록 변경하지 않았다.

### 후속 Git 게시 승인

사용자는 검증 후 변경사항의 의미 단위 commit과 push를 명시적으로 요청했다. 게시 대상은 `origin`의 `https://github.com/KnittingLog/back`, 브랜치는 `develop`이다. 운영 DB 반영·배포와 머지는 이번 승인 범위가 아니다. 현재 build workflow는 `main` push와 pull request를 대상으로 하므로 `develop` push만으로 원격 CI 통과를 주장하지 않는다.

## 미충족 항목 보완 (2026-10-11)

### 범위와 결과

- 사용자는 경고만 없애는 상태표가 아니라 실제 미충족 사항의 해소를 요청했다. 검사 제외, 경고 수준 변경과 포괄 태그는 사용하지 않았다. 이번 보완으로 요구사항 전체를 완료했다고 표시하지 않는다.
- 실행 모드는 `LOCAL_ONLY`이고 호스트는 `luke-choiui-MacBookAir.local`이다. 기준 커밋은 `develop`의 `51fd38b`이다. 이 보완은 아직 commit·push하지 않았다. 기존 환경 파일·운영 DB·배포 설정은 변경하지 않았다.
- [비밀번호 보안 구현](../packages/backend/src/providers/auth/Security.ts)은 운영 모드에서 실제 Pwned Passwords 제공자를 기본으로 사용한다. 원문과 전체 해시를 전송하지 않는다. 제공자 오류·시간 초과·잘못된 본문은 비밀번호 허용으로 처리하지 않는다. 저장은 기존 scrypt를 유지한다.
- [제공자 단위 검사](../packages/backend/test/unit/pwned-passwords.ts)는 패딩·정확한 접미 해시 비교·응답 한도·시간 초과·오류 시 차단을 확인했다. 기본 운영 검증 연결도 모의 전송으로 확인했다. 로컬 모드는 외부 통신 없이 기존 목록을 유지한다.
- [실제 제공자 검사](../packages/backend/test/integration/pwned-passwords-live.ts)는 공개 문자열 `password`의 거부와 새 합성 문자열의 허용을 확인했다. 사용자 비밀번호나 실제 계정은 사용하지 않았다. 실제 제공자는 로컬 DB 통합 검사와 DB 없는 CI에서 자동 호출하지 않는다.
- [비밀번호 HTTP/DB 검사](../packages/backend/test/integration/password-screening.ts)는 제공자 거부·장애의 HTTP 400·503과 5개 계정 관련 테이블의 변경 부재를 확인했다. 거부한 복구 요청은 복구 코드를 소비하지 않았다. 이후 성공한 복구는 과거 접근·갱신 토큰과 소비한 복구 코드를 거부했다. 이 단계의 제공자 응답은 주입했다.
- [이관 중간 실패 검사](../packages/backend/test/integration/transfer-rollback.ts)는 새 DB에 임시 트리거를 설치했다. 방장 양도·개인 프로젝트·멤버십·작업 공간·대기 초대가 변경된 뒤 이관 이력 저장 직전에 오류를 발생시켰다. 11개 업무 테이블이 실패 전과 같은지 확인했다. 임시 트리거를 제거한 뒤 같은 명령 재시도·중복 방지와 댓글·반응·타이머 보존을 확인했다.
- [ERD 저장 계약 검사](../packages/backend/test/unit/erd-contract.ts)는 기존 DMMF·생성 SQL 검사를 실제로 실행한다. DB 적용 범위와 네이밍의 근거를 연결했다. Evidence 경고는 18개에서 16개로 줄었다. SQL 생성은 실제 DB 반영이 아니다.

| 검사 | 결과 |
|---|---|
| 전체 lint | 종료 0 |
| 전체 단위 검사 | 기존 5개와 신규 2개 파일 모두 통과 |
| 전체 빌드 | 종료 0. Rolldown `PLUGIN_TIMINGS` 성능 경고 1개 발생. 변환 콜백의 4.9초 소요를 보고했다. 경고를 숨기는 설정은 추가하지 않았다. |
| Evidence·전체 테스트 타입 | 종료 0. `TS16411` 근거 누락 경고 16개 유지 |
| ERD 저장 계약 | 27개 모델·47개 논리 관계·CHECK 34개·부분 고유 인덱스 4개·물리 FK 0개 통과 |
| 실제 유출 비밀번호 제공자 | 합성 문자열로 실제 HTTPS 검사 통과 |
| 새 격리 PostgreSQL 검사 | 기존 SQL 보호 조건 6개와 새 통합 검사 경로 보호 조건 2개 통과. 보호 검사 뒤 업무 데이터 변경 부재 확인 |
| 새 HTTP/DB 수용 | 비밀번호 거부·장애와 이관 중간 실패 검사 통과. 기존 HTTP 44개는 실패 0개·BLOCKED 0개 |

최종 새 클러스터 경로는 `/private/tmp/knittinglog-tdd.GsXOlS/postgres`이다. 주소는 `127.0.0.1:50801`이고 DB는 `knittinglog_tdd`이다. 새 두 통합 검사는 URL 검증 뒤 실제 서버의 정확한 경로·주소·포트·DB를 확인하고 쓰기를 시작한다. 기존 클러스터는 재사용하거나 중지하지 않았다. 최종 단계별 기록과 로그는 `/private/tmp/knittinglog-tdd.GsXOlS`에 보존했다. 새 서버의 종료를 확인한다.

검증 명령은 다음과 같다.

```sh
pnpm lint
pnpm check:evidence
pnpm build
KNITTINGLOG_TEST_LIVE_PASSWORDS=1 pnpm -C packages/backend ttsx --project test/tsconfig.json test/integration/pwned-passwords-live.ts
KNITTINGLOG_TEST_ALLOW_WRITES=1 pnpm -C packages/backend test:integration:isolated
```

빌드에는 접속 불가한 합성 CI DB 설정을 명령 환경으로 전달했다. 단위 검사는 CI와 같은 `test/unit/*.ts` 범위를 실행했다. 제공자 구현 전에는 새 회귀 검사가 `TS2339`로 실패했고 구현 후에는 통과했다. 통합 검사 준비 중의 잘못된 요청 경로·SQL 문법 실패는 업무 구현의 RED로 계산하지 않는다.

### 남은 실제 작업

- 콘텐츠 복구·역이관 실행 도구와 그 승인 대상·버전·보존 기간·권한·원자성 검증은 남아 있다. 물리삭제와 파일 제거도 전체 보존 조건의 검증이 필요하다.
- 파일 업로드·보존·복원에는 승인한 저장소와 실행 대상이 필요하다. 실제 DB·파일 복원, RPO·RTO 측정과 복원 후 탈퇴·차단·인증 대조를 완료하지 않았다.
- 클라이언트의 타이머·카운터 재시도·저장 표시와 사진 처리는 해당 저장소에서 구현·검증해야 한다. 현재 요청에는 클라이언트 저장소 경로가 제공되지 않았다.
- 실제 DDL 승인·운영 반영과 구버전 폐기 승인은 빌드나 로컬 검사로 대신하지 않는다. 다중 인스턴스와 부하 수용도 이번 검사에 포함하지 않았다.
- 기존 멤버십 중복 경로는 변경하지 않았다. [Evidence 검토 결과](ttsc-graphs.md#근거-검토-결과-2026-10-11)의 나머지 제목을 충족했다고 주장하지 않는다.

## 내 참여 이력 조회 통합 (2026-10-11)

### 변경 범위

- 사용자는 내 참여 이력 조회를 AccountController에 유지하고 MembershipHistoryController를 삭제하도록 결정했다. 실행 모드는 `LOCAL_ONLY`이다.
- [AccountController](../packages/backend/src/controllers/accounts/v1/AccountController.ts)의 `GET /api/v1/users/me/memberships`를 유지했다. 중복 컨트롤러와 모듈 등록을 제거했다. 호출자가 없어진 ProjectProvider.history도 제거했다. 프로젝트별 현재 참여자 조회는 유지했다.
- [AccountProvider](../packages/backend/src/providers/accounts/AccountProvider.ts)는 자신의 현재·종료한 프로젝트 참여 기간을 조회한다. 기존 `created_at DESC, id DESC` 정렬과 응답 필드를 유지했다. 계정 데이터와 프로젝트 멤버십의 저장 경계는 변경하지 않았다.
- SDK를 재생성했다. 호출은 `api.functional.api.v1.users.me.memberships(connection)`으로 통합했다. 기존 `memberships.memberships(connection)`과 `memberships.get(connection)`을 사용하는 클라이언트는 수정해야 한다. HTTP URL은 변경하지 않았다.
- OpenAPI의 내 참여 이력 조회 담당은 AccountController이고 응답 타입은 AccountProvider.Membership이다. 기존 ProjectProvider.Membership과 응답 스키마의 구조는 같다. 변경 전 생성 기준본과 비교한 결과, 이 경로 외의 OpenAPI 경로 객체와 전체 경로·메서드 목록은 같았다.

### 검증 결과

| 검사 | 결과 |
|---|---|
| 단일 처리기 RED/GREEN | 변경 전 처리기 수 2로 실패했다. 변경 후 처리기 수 1과 AccountController 소유를 확인했다. |
| 조회·SDK 회귀 | 사용자 범위, 최신순 조회 조건, 종료 이력의 날짜 변환, 실제 loopback HTTP와 생성 SDK 호출 통과. 이 검사의 인증·DB는 모의 구현이다. |
| 실제 참여 이력 HTTP/DB | 재가입·나가기 후 자신의 현재·종료 이력 4개와 종료 이력의 최신순을 확인했다. 기존 프로젝트별 현재 참여자 검사도 통과했다. |
| 전체 lint·빌드 | 종료 0. 빌드의 `PLUGIN_TIMINGS` 성능 경고 1개는 유지됐다. 변환 콜백 4.9초를 보고했다. |
| DB 없는 단위 검사 | 8개 파일 모두 통과 |
| 전체 테스트 타입·Evidence | 종료 0. 근거 누락 `TS16411` 경고 16개 유지 |
| 새 격리 DB 통합 | 보호 조건 8개, SQL 제약·롤백, UTC·정책, 비밀번호 거부·장애, 이관 중간 실패 검사 통과 |
| 실제 업무 HTTP 전체 | 44개 통과. 실패 0개. BLOCKED 0개 |
| 변경 검사 | `git diff --check` 통과. 삭제한 컨트롤러·Provider 함수·SDK 중첩 호출의 코드 참조 없음 |

새 DB의 경로는 `/private/tmp/knittinglog-tdd.47PawZ/postgres`이다. 주소는 `127.0.0.1:50801`이고 DB는 `knittinglog_tdd`이다. 단계별 로그와 `results.json`은 같은 임시 폴더에 보존했다. 종료 단계의 코드는 0이다. 이후 `pg_ctl status`의 `no server running`도 확인했다. 기존 DB는 변경하지 않았다.

검증 명령은 다음과 같다. 빌드에는 접속 불가한 합성 CI DB 설정을 전달했다.

```sh
pnpm -C packages/backend build:sdk
pnpm lint
pnpm check:evidence
pnpm build
# 저장소 루트에서 단위 검사를 실행합니다.
for test in packages/backend/test/unit/*.ts; do pnpm -C packages/backend ttsx --project test/tsconfig.json "test/unit/${test##*/}" || exit; done
KNITTINGLOG_TEST_ALLOW_WRITES=1 pnpm -C packages/backend test:integration:isolated
git diff --check
```

이번 변경은 중복 라우팅의 책임과 정렬 계약을 해결했다. 미래 병행 버전, 외부 클라이언트 이관과 나머지 요구사항의 수용은 별도이다. 기존 미게시 변경을 보존했다. commit·push·운영 DB 반영·배포는 수행하지 않았다.

## 문서 최신화 (2026-10-11)

- README, 구현 현황, API 테스트 계약, SDK 절차와 SDK 패키지 안내를 현재 코드에 맞췄다. 초기 기반 코드·샘플 SDK 검증 기록은 과거 이력으로 구분했다. 로컬 도메인 분리 계획의 목표 구조와 최신 반영 상태도 갱신했다.
- AccountController의 단일 참여 이력 조회, 새 SDK 호출, 단위 검사 8개와 HTTP 검사 44개를 반영했다. 이관 이력 저장 직전 실패의 롤백 검증과 다른 실패 지점의 미검증을 구분했다.
- 문서 10개의 코드 블록 닫힘과 로컬 링크·제목 앵커 155개를 검사했다. TypeScript AST로 업무 컨트롤러 15개·HTTP 테스트 함수 44개·단일 SDK 함수를 확인했다. 단위 검사 파일 8개와 요구사항 기능 ID 64개도 확인했다. 최근 격리 API 검사와 서버 종료의 기록을 대조했다. `git diff --check`를 통과했다.
- 이번 작업은 문서만 변경했다. 빌드·업무 테스트·pack·외부 소비자 검사를 다시 실행하지 않았다. 앞선 실행의 성공을 이번 실행으로 기록하지 않았다. 원격 조회·commit·push·배포도 수행하지 않았다.

## 후속 요청: 의미 단위 게시 (2026-10-11)

사용자는 위 로컬 보완과 문서 최신화의 의미 단위 commit과 push를 승인했다. 대상은 `https://github.com/KnittingLog/back`의 `origin/develop`이다. 유출 비밀번호 검증, 격리 통합 검사, ERD 근거 검사, 참여 이력 중복 제거와 문서 최신화를 별도 커밋으로 분리한다. 운영 DB 반영·배포·서비스 재개·머지는 승인 범위가 아니다. 게시 결과는 Git 이력과 원격 브랜치로 확인한다. 로컬 검사와 원격 CI 결과는 구분한다.

게시 전에 lint와 단위 검사 8개 파일을 다시 실행해 통과했다. 전체 테스트 타입·Evidence 검사는 종료 0이고 근거 연결 경고 16개가 남았다. 변경 파일에서 대표적인 비밀키·접근 토큰 형식을 검사했으며 탐지 항목은 없었다. 이 형식 검사는 모든 비밀값의 부재를 증명하지 않는다. 기존 빌드와 격리 DB·HTTP 44개 검사 결과는 위 실행 기록을 사용한다. 원격 develop을 조회해 게시 시작 전 기준 커밋과 같은지 확인했다.

## 복구·파일·분산 인증 보완 (2026-10-15)

### 범위와 실행 위치

- 기준은 `develop`의 `950d47d`이다. 작업 브랜치는 `feat/backend-recovery-lifecycle`이다. 실행 모드는 `LOCAL_ONLY`이다.
- 실제 호스트는 `luke-choiui-MacBookAir.local`이다. 작업 경로는 `/Users/luke/Projects/KnittingLog-back`이다.
- 사용자는 구현부터 진행하도록 요청했다. 향후 IaC는 Pulumi와 TypeScript를 사용한다. 인프라 리소스·운영 설정·운영 DDL·배포·실제 백업 복원은 수행하지 않았다. commit과 push도 수행하지 않았다.
- 계획은 [구현 범위](backend-completion-plan.md), 절차는 [실행 경계](backend-maintenance.md), 현재 상태는 [구현 현황](implementation-status.md)에 기록했다.

### 작업자와 통합 보완

- Orca Run은 `run_0ddea0420007`이다. 새 작업자의 요청·실제 실행 설정에서 `codex`, `gpt-6-luna`, `medium`의 일치를 확인했다. 같은 터미널을 재사용한 후속 작업도 원래 실행 주체를 확인했다.
- 콘텐츠 복구·역이관, 파일 처리와 공유 인증 제한을 분리했다. 조정자는 공유 모듈·실행기·생성물·문서와 최종 통합 수정을 담당했다.
- 첫 콘텐츠 물리삭제 시도는 완료 보고 없이 최종 응답을 남겼다. 실제 transcript를 확인한 뒤 해당 시도만 중지했다. 같은 Task를 새 Dispatch로 재시도했다. 재시도 작업의 완료 보고를 수신했다.
- 모든 실제 작업 터미널을 종료·해제했다. `worker-list --terminal-state active`와 `--terminal-state reclaimable`의 결과는 빈 목록이다. 과거 재사용 Dispatch의 정적 retained 표시는 별도 활성 터미널이 아니다.
- 조정자는 JSONB 키 순서에 의존한 승인 비교를 수정했다. 파일 승인 날짜·크기를 JSON 안전 값으로 저장한다. 승인자·실행자의 현재 권한을 다시 확인한다.
- 파일 제거 전 실행 의도 영수증을 확정한다. 다른 명령이 같은 요청 UUID를 차지하지 못하게 한다. 외부 제거와 완료 영수증은 분리하며, DB 기록 실패는 같은 명령으로 재시도한다.
- 파일 복원도 외부 작업 전에 실행 의도를 확정한다. 완료가 미확인된 복원은 제거 준비를 차단한다. 같은 미완료 UUID를 병렬 실행하거나, 시간 만료만으로 의도를 해제하지 않는다. 중단된 원 실행의 종료와 실제 바이트를 확인하는 운영 조정 도구는 미구현이다.
- 설치된 Nest Express 어댑터의 파서 이름 검사 때문에 경로 전용 `jsonParser`가 전역 파서를 막는 문제를 확인했다. 별도 이름의 래퍼로 수정했다. 과대·잘못된 JSON의 오류는 본문을 노출하지 않고 413·400으로 반환한다.

### 최종 검사 결과

| 명령·검사 | 결과 | 확인한 범위 |
|---|---|---|
| `pnpm lint` | 종료 0 | API·백엔드 전체 타입·lint |
| `test/unit/*.ts`의 12개 파일을 실제 `test/tsconfig.json`으로 실행 | 모두 통과 | 승인 권한, 파일 무결성·원래 키 복원·보존, 공유 제한, 일반 JSON·파일 경로의 본문 크기, 잘못된 JSON 비노출과 기존 회귀 |
| `pnpm build` | 종료 0 | Prisma·ERD, Nestia SDK·OpenAPI, API 번들과 백엔드 산출물 |
| `pnpm check:evidence` | 종료 0·`TS16411` 경고 16개 | 전체 테스트 타입과 기존 요구사항 H2·H3 근거 연결. 경고 수준과 제외 정책은 유지 |
| `node packages/backend/scripts/check-erd.cjs` | 통과 | 모델 28개·논리 관계 47개·CHECK 설계 35개·부분 고유 인덱스 4개·생성 SQL의 물리 FK 0개 |
| `KNITTINGLOG_TEST_ALLOW_WRITES=1 pnpm -C packages/backend test:integration:isolated` | 종료 0 | 아래 새 클러스터의 실제 DB·파일·HTTP 검사 |
| `git diff --check` | 통과 | 변경한 텍스트의 공백 오류 |

빌드는 비접속 합성 PostgreSQL 설정을 사용했다. 생성기는 컨트롤러 21개와 경로·라우트 선언 102개를 분석했다. 선언 수를 기능 구현률로 환산하지 않는다. API 번들에는 `PLUGIN_TIMINGS` 경고 1개가 남았다. 최종 재빌드는 `ttsc-unplugin` 변환 96회와 17.0초를 보고했다. 앞선 빌드는 8.9초와 10.0초를 보고했다. 8.9초 실행은 격리 검사와 일부 시간이 겹쳤다. 이 관측을 고정한 부하·캐시 조건의 성능 비교나 지연 원인 해결의 증거로 사용하지 않는다. 실제 미충족 요구사항을 포괄 Evidence 태그로 덮지 않았다.

### 격리 실행 근거

- 최종 성공한 클러스터는 `/private/tmp/knittinglog-tdd.hyDv8L/postgres`이다. 실제 주소는 `127.0.0.1:50801`이고 DB는 `knittinglog_tdd`이다. 실제 경로·주소·포트·DB의 일치를 쓰기 전에 확인했다. 앞선 전체 성공 자료는 `/private/tmp/knittinglog-tdd.i3BKXI`에도 보존했다.
- SQL 보호 조건 6개와 통합 진입점의 잘못된 경로 거부 6개를 확인했다. 보호 검사 후 정책 fixture 2개 이외의 업무 행이 없는지 확인했다. CHECK 35개와 부분 고유 인덱스 4개를 실제 DB에서 검사했다.
- `recovery-lifecycle`은 21초에 통과했다. 승인 전·후 변경, 기간 초과, 권한 회수, 부모와 기록의 부분 실패 롤백, 명령 재시도, 개별 삭제 자식 보존, 역이관의 참여 상한·다른 참여자·변경 번호 충돌을 검사했다. 정상 경로는 생성 SDK로 호출했다.
- `storage-lifecycle`은 13초에 통과했다. 실제 200 KiB 업로드·다운로드, 10 MiB 초과 거부, 원래 키의 누락 바이트 복원, 프로필 사진 소유권, 새 참조와 제거 준비의 경쟁, 현재·복구 가능한 참조, 백업 근거 부재, 명령 충돌, 외부 제거 실패와 DB 기록 실패 후 재시도를 검사했다. 별도 실제 SDK 제거 경로도 통과했다. 백업 입력을 의도적으로 대기시켜 진행 중 복원의 중복 실행과 제거 준비를 거부하는지 확인했다. 완료 후에는 제거가 성공하고 바이트가 남지 않는지 확인했다.
- `auth-attempts`는 13초에 통과했다. 독립 Prisma 클라이언트 2개가 16회 동시 요청에서 10회 허용·6회 거부를 확인했다. DB 시각의 창 만료, 오래된 키 재설정, 감사 주체 폐기, 동일한 로그인 오류, 인증 트랜잭션 롤백 뒤 시도 수 보존과 해시 키 저장을 검사했다.
- `content-purge`는 16초에 통과했다. 실제 SDK 승인·삭제, 보존·참조·권한·변경 상태의 거부와 재시도를 검사했다. 두 행 중 둘째 삭제에서 실패하도록 주입해 첫 삭제까지 롤백되는지 확인했다. 실행 영수증도 없음을 확인한 뒤 같은 명령으로 재시도했다.
- 기존 UTC·필수 재동의·비밀번호 제공자 거부·이관 롤백과 실제 HTTP 44개도 통과했다. HTTP 실패와 BLOCKED는 0개이다. 전체 실행 결과와 단계별 로그는 같은 임시 폴더의 `results.json`에 보존했다.
- 실행기의 `stop` 단계는 종료 0이다. 새 서버 종료를 확인했다. 기존 DB와 마이그레이션 폴더는 변경하지 않았다.
- 앞선 `/private/tmp/knittinglog-tdd.rhSxiN` 실행은 신규 SDK 호출의 객체 매개변수 타입 오류로 보호 진입점 컴파일에서 실패했다. 해당 서버를 종료한 뒤 호출 계약을 수정하고 새 클러스터에서 재실행했다. 이 실패를 업무 API 실패로 계산하지 않았다.
- 중간 `/private/tmp/knittinglog-tdd.sfOXvf` 실행은 복원 작업 UUID 보완 중 호출부의 매개변수 타입이 맞지 않아 파일 진입점 컴파일에서 실패했다. 서버를 종료했다. 이후 소스 편집을 끝내고 전체 타입·빌드 검사를 통과한 뒤 최종 클러스터를 새로 만들었다.
- 최종 소스에서 lint·단위 검사 12개·Evidence 검사를 다시 통과했다. 문서 7개의 로컬 링크·제목 앵커 102개와 코드 블록 닫힘을 검사했다. 변경 파일 65개에서 대표적인 비밀키·토큰 형식을 탐지하지 않았다. 형식 검사는 모든 비밀값의 부재를 증명하지 않는다.

### 남은 수용 경계

로컬 파일과 백업 보존 인벤토리는 합성 격리 자료이다. 실제 운영 저장소·백업 인벤토리 연결, 계정 사진의 운영 보존 정책, 실제 백업의 DB·파일 격리 복원, RPO·RTO, 실제 다중 서버 부하, 외부 클라이언트와 운영 DDL은 미완료 또는 미검증으로 유지한다. 이번 결과는 배포·운영 복구·전체 요구사항 충족의 증거가 아니다.

## 요구사항 대조와 결함 보완 (2026-10-15)

### 범위와 실행 위치

- 사용자는 [확정 요구사항](requirements.md)과 현재 코드의 대조 검증을 요청했다. 이후 발견한 결함의 병렬 수정을 요청했다.
- 기준 브랜치는 `feat/backend-recovery-lifecycle`이다. 실행 모드는 `LOCAL_ONLY`이다. 작업 경로는 `/Users/luke/Projects/KnittingLog-back`이다.
- 대조 검증은 요구사항 영역 5개를 읽기 전용으로 나눠 수행했다. 결함 후보는 조정자가 코드에서 다시 확인했다.
- 수정은 Orca Run `run_9d69942885bc`의 작업자 6명이 수행했다. 작업자는 `codex`, 모델은 `gpt-6-luna`, 추론 수준은 `medium`이다. 시작 영수증의 요청값과 실제 실행값이 같았다. 서비스 등급은 Codex 설정의 `fast`를 사용했다.
- 작업자는 서로 다른 파일을 소유했다. SDK 생성·빌드·격리 통합 검사는 공유 잠금으로 한 번에 하나만 실행했다.

### 반영한 결함

| 요구사항 | 결함 | 반영 |
|---|---|---|
| V1-508, 6.1 | 프로젝트 멤버 목록이 차단한 상대를 노출했다. | 양방향 차단 관계의 멤버를 숨긴다. 참여는 종료하지 않는다. |
| V1-503 | 상태 필터가 없으면 취소·거절·수락한 초대도 반환했다. | 기본 조회는 대기 초대만 반환한다. |
| V1-405 | 작업 상태 정렬이 없었다. | `sort=status`를 추가했다. 기본 정렬은 유지했다. |
| V1-110, 6.2, 6.3 | 탈퇴 요청에 후임을 지정할 수 없었다. 미동의 방장은 탈퇴하지 못했다. | 탈퇴 본문에 후임을 받는다. 후임 이관과 탈퇴를 한 트랜잭션에서 처리한다. 정책 동의를 요구하지 않는다. |
| 6.2, 6.5 | 기록·댓글 작성 재시도가 중복 행을 만들었다. 다른 멤버의 댓글·반응이 소유자의 version을 올렸다. | 선택 `operation_id`로 중복을 방지한다. 댓글·반응은 version을 올리지 않는다. 같은 반응 PUT은 변경하지 않는다. |
| 6.4 | 신고와 함께 실행한 차단이 조치 이력에 없었다. 이미 삭제된 게시글의 숨김을 성공으로 기록했다. | 신고자를 주체로 `block` 조치를 기록한다. 실제 결과대로 `post_hidden=false`·`already_deleted=true`를 기록한다. |
| V1-302, V1-902 | 대문자 UUID로 자기 관계 검사를 우회할 수 있었다. | 대소문자와 무관하게 비교한다. 자기 신고도 거부한다. |
| 6.3 | 파일 업로드가 필수 동의를 검사하지 않았다. | 저장 전과 등록 트랜잭션에서 동의를 검사한다. 정리 실패한 업로드의 객체 키를 명령 영수증에 기록한다. |
| API-VER-005, 007 | 인증 없는 시험 오류 경로가 있었다. `/monitors/system`이 실행 인자를 반환했다. 버전 검사가 가짜 모듈만 확인했다. | 시험 경로와 실행 인자를 제거했다. 생성한 OpenAPI의 실제 경로를 검사한다. |
| DB-AC-002, DB-AC-003 | `pnpm schema` 경로가 설계 제약을 적용하지 않았다. `auth_attempt_limits`가 설계 문서와 ERD 영역에 없었다. | 스키마 준비에서 생성 SQL과 설계 제약을 적용한다. migrations 폴더를 만들지 않는다. 설계 문서와 ERD 영역을 보완했다. |
| 4.2 | 테스트 SQL 함수·파라미터·변수가 명명 규칙을 따르지 않았다. | `fn_`·`p_`·`v_` 이름으로 바꿨다. |

### 통합 중 보완

- 처음에는 기록 작성의 `operation_id`를 필수로 만들었다. 기존 호출이 400을 받아 이관 롤백 검사가 실패했다. 같은 버전에서 필수 입력을 추가하지 않도록 선택 필드로 바꿨다.
- 작업자의 진행 중 편집이 다른 작업자의 격리 검사를 컴파일 단계에서 중단시켰다. 해당 파일의 소유자가 수정했다. 이 실패를 업무 결함으로 계산하지 않는다.
- 조정자는 초대 검사의 조회 주체 오류와 테스트 도우미의 신고 조치 타입 누락을 수정했다.
- 조정자는 스키마 준비 경로에서 빠진 DB 초기화를 복원했다. `test --reset`과 벤치마크가 기존 DB에서 다시 실행되도록 했다.

### 최종 검사 결과

| 명령·검사 | 결과 |
|---|---|
| `pnpm lint` | 종료 0. 마지막 수정 후 다시 실행 |
| `test/unit/*.ts` 12개 파일 | 모두 통과 |
| `pnpm build` | 종료 0 |
| `pnpm check:evidence` | 종료 0. `TS16411` 경고 16개 유지 |
| `node packages/backend/scripts/check-erd.cjs` | 통과 |
| `KNITTINGLOG_TEST_ALLOW_WRITES=1 pnpm -C packages/backend test:integration:isolated` | 종료 0. 실제 HTTP 51개 통과. 실패 0개. BLOCKED 0개 |
| `git diff --check` | 통과 |

빌드에는 비접속 합성 PostgreSQL 설정을 사용했다. 격리 클러스터는 `/private/tmp/knittinglog-tdd.j91dpz`이다. 단계별 로그와 `results.json`을 같은 폴더에 보존했다. 기존 DB는 변경하지 않았다.

### 남은 경계

- 탈퇴한 멤버의 공동 프로젝트 기록 표시, 게시글 좋아요 상태 조회, 논리삭제한 작업 공간이 있는 재가입은 요구사항 해석이 필요하다.
- `local`·`dev` 모드는 유출 비밀번호 제공자를 호출하지 않는다. 운영 `real` 모드의 제공자 검사는 유지한다.
- 이번 결과는 운영 DB 반영·배포·실제 다중 서버 부하 수용의 증거가 아니다. push는 수행하지 않았다.
