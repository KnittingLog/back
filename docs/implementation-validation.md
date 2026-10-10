# 구현 검증 기록

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
