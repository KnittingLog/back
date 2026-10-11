# 구현 현황과 추가 작업 명세

## 기준과 상태

- 작성 기준일은 2026-10-11이다. 실행 모드는 `LOCAL_ONLY`이다.
- 기준 브랜치는 `develop`이다. 기준 커밋은 `51fd38b`이다.
- 이 문서는 기준 커밋 이후의 유출 비밀번호 제공자, 내 참여 이력 조회 통합과 신규 검사를 함께 설명한다. 사용자는 2026-10-11에 의미 단위 commit과 `origin/develop` push를 승인했다. 게시 결과는 Git 이력과 원격 브랜치로 확인한다.
- 요구사항의 기준은 [확정 요구사항](requirements.md)이다. 저장 계약의 기준은 [테이블 설계](erd-design.md)이다. 복구 목표의 기준은 [데이터 복구 문서](data-recovery.md)이다.
- 검증 결과는 [미충족 항목 보완 기록](implementation-validation.md#미충족-항목-보완-2026-10-11)과 [내 참여 이력 조회 통합 기록](implementation-validation.md#내-참여-이력-조회-통합-2026-10-11)을 사용한다.
- ASD-STE100의 명료성 원칙을 한국어에 적용한다. 짧은 문장과 명확한 주체를 사용한다. 정식 표준 준수를 주장하지 않는다.

| 상태 | 의미 |
|---|---|
| 적용 | 현재 로컬 코드나 설계에 반영했다. 배포 완료를 뜻하지 않는다. |
| 로컬 검증 | 기록한 로컬 환경에서 검사를 통과했다. 운영 환경의 수용을 뜻하지 않는다. |
| 미구현 | 이 저장소에 필요한 실행 기능이나 도구를 구현하지 않았다. |
| 미검증 | 구현이나 설계가 있어도 필요한 실행 증거가 없다. |
| 외부 미확인 | 다른 저장소나 외부 환경의 구현 상태를 확인하지 않았다. |
| 승인·정보 필요 | 정확한 대상, 담당자 또는 승인을 받아야 실행할 수 있다. |

기능 ID, API 수, 테스트 수와 Evidence 경고 수는 서로 다른 단위이다. 이 수를 구현률로 환산하지 않는다. 부분 검증을 제목 전체의 충족으로 표시하지 않는다.

## 적용된 항목과 검증 한계

| 영역 | 적용된 내용 | 확인한 근거 | 더 해야 하는 내용 |
|---|---|---|---|
| 도메인 구조 | 업무 컨트롤러를 `controllers/<domain>/v1`로 분리했다. Provider는 버전 폴더 없이 도메인으로 분리했다. 내 참여 이력 조회는 AccountController로 통합했다. 중복 MembershipHistoryController를 삭제했다. | [모듈 등록](../packages/backend/src/controllers/KnittingLogModule.ts), [구조 변경 검증](implementation-validation.md#도메인-구조-변경-후-통합-검사-2026-10-11), [단일 라우팅 검사](../packages/backend/test/unit/account-memberships.ts). | 도메인 경계 변경 시 모듈 등록과 SDK 계약의 회귀 검사를 유지해야 한다. |
| DB 설계·이름 | 업무 스키마 4개와 모델 27개를 정의했다. 공통 감사 컬럼과 논리삭제 컬럼을 적용했다. 이름과 길이 검사를 연결했다. | [스키마](../packages/backend/prisma/schema/main.prisma), [ERD 정적 검사](../packages/backend/scripts/check-erd.cjs), [실행 연결](../packages/backend/test/unit/erd-contract.ts). 논리 관계 47개를 확인했다. | 기존 운영 데이터의 정합성을 검사해야 한다. 승인된 마이그레이션을 별도로 준비해야 한다. |
| DB 제약 | CHECK 34개와 부분 고유 인덱스 4개를 설계했다. 격리 DB에 적용했다. 물리 FK를 생성하지 않았다. | [보완 SQL](../packages/backend/prisma/design-constraints.sql), [실제 DB 제약 검사](../packages/backend/test/integration/erd-constraints.sql). 제약 위반의 거부를 확인했다. | 모든 업무 관계와 모든 쓰기 경로의 수용을 추가로 증명해야 한다. 제약 검사는 업무 권한 검사를 대신하지 않는다. |
| 관계·원자성 | 서버는 존재·삭제·소유권·참여·차단 상태를 검사한다. 업무 변경에 공통 advisory lock과 트랜잭션을 사용한다. 일부 충돌을 제한된 횟수로 재시도한다. | [공통 문맥](../packages/backend/src/providers/common/KnittingLogContext.ts), [이관 경쟁 검사](../packages/backend/test/features/api/knittinglog/test_api_knittinglog_transfers.ts). | 일괄 입력·관리 도구·raw SQL을 포함한 모든 쓰기 경로를 점검해야 한다. 다중 인스턴스와 전체 경쟁 조건을 검사해야 한다. |
| 계정·인증 | 식별자를 정규화한다. 비밀번호는 scrypt로 저장한다. 복구 코드는 해시로 저장한다. 복구 성공 후 기존 인증을 무효화한다. 탈퇴 시 공개 프로필과 인증 비밀값을 제거한다. | [인증 구현](../packages/backend/src/providers/auth/AuthProvider.ts), [계정 구현](../packages/backend/src/providers/accounts/AccountProvider.ts), [계정 API 검사](../packages/backend/test/features/api/knittinglog/test_api_knittinglog_accounts.ts), [보안 단위 검사](../packages/backend/test/unit/security.ts). | 프로세스 내부 요청 제한의 분산 적용을 보완해야 한다. 운영 복원 후 과거 인증 거부는 별도로 검사해야 한다. |
| 유출 비밀번호 | `MODE=real`에서 실제 Pwned Passwords 제공자를 기본으로 사용한다. 원문과 전체 해시를 전송하지 않는다. 제공자 장애를 허용으로 처리하지 않는다. | [구현](../packages/backend/src/providers/auth/Security.ts), [단위 검사](../packages/backend/test/unit/pwned-passwords.ts), [HTTP/DB 검사](../packages/backend/test/integration/password-screening.ts), [실제 제공자 검사](../packages/backend/test/integration/pwned-passwords-live.ts). | 운영 환경의 연결성과 장애 동작을 검사해야 한다. `local`과 `dev`의 기본 경로는 실제 제공자를 자동 호출하지 않는다. |
| 정책 문서·동의 | 효력 시각을 기준으로 활성 한국어 문서를 선택한다. 필수 재동의를 검사한다. 뒤의 선택적 버전으로 필수 동의를 우회하지 못하게 한다. | [정책 구현](../packages/backend/src/providers/policies/PolicyProvider.ts), [정책 경계 검사](../packages/backend/test/integration/policy-gates.ts). | 실제 정책 내용과 운영 발행 절차를 준비해야 한다. 테스트용 문서는 운영 약관이 아니다. |
| 친구·차단·공개 범위 | 친구 요청과 차단을 처리한다. 양방향 차단을 우선한다. 당사자 간 대기 요청·초대를 종료한다. 제3자 관계와 공동 프로젝트 참여는 유지한다. | [소셜 구현](../packages/backend/src/providers/social/SocialProvider.ts), [소셜 API 검사](../packages/backend/test/features/api/knittinglog/test_api_knittinglog_social.ts). | 기능 ID별 공개 범위·목록·검색·집계의 전체 수용 근거를 정리해야 한다. |
| 프로젝트·개인 작업 공간 | 멤버십과 개인 데이터의 소유를 분리했다. 참여 인원 상한을 검사한다. 방장 후임을 확인한다. 재가입 시 새 참여 기간을 생성한다. 자신의 현재·종료한 참여 이력은 AccountController가 최신순으로 반환한다. | [프로젝트 구현](../packages/backend/src/providers/projects/ProjectProvider.ts), [프로젝트 API 검사](../packages/backend/test/features/api/knittinglog/test_api_knittinglog_projects.ts), [재가입 검사](../packages/backend/test/features/api/knittinglog/test_api_knittinglog_transfers.ts). | 운영 이행 시 기존 소유 관계를 검사해야 한다. |
| 상태·타이머·카운터 | 서버에 타이머 상태를 저장한다. 미완료 타이머가 있으면 done 전환을 거부한다. 종료와 기록 생성을 함께 처리한다. 변경 번호와 작업 식별자를 검사한다. | [작업 공간 구현](../packages/backend/src/providers/workspaces/WorkspaceProvider.ts), [상태·타이머·카운터 검사](../packages/backend/test/features/api/knittinglog/test_api_knittinglog_workspaces.ts). | 클라이언트의 다중 기기 동작·재시도·저장 표시를 검사해야 한다. 부하 조건의 수용은 미검증이다. |
| 기록·댓글·반응 | 작성자·소유권·현재 접근 권한을 검사한다. done 상태의 기존 기록 변경을 허용한다. 댓글과 반응을 원 기록에 보존한다. | [기록 구현](../packages/backend/src/providers/records/RecordProvider.ts), [기록 API 검사](../packages/backend/test/features/api/knittinglog/test_api_knittinglog_records.ts). | 전체 공개 범위 조합과 새 복구 도구의 권한 경계를 검사해야 한다. |
| 나가기·추방 이관 | 개인 프로젝트를 생성한다. 개인 작업 공간의 귀속을 바꾼다. 댓글·반응·타이머의 식별자를 보존한다. 같은 명령의 중복 반영을 막는다. | [이관 API 검사](../packages/backend/test/features/api/knittinglog/test_api_knittinglog_transfers.ts), [중간 실패 검사](../packages/backend/test/integration/transfer-rollback.ts). 이력 저장 직전 오류에서 11개 테이블의 롤백을 확인했다. | 역이관 도구가 없다. 다른 실패 지점과 사진·파일 경계의 검증도 필요하다. |
| 피드·신고 | 피드 커서와 현재 차단 상태를 검사한다. 신고 시 허용한 텍스트 증거를 보존한다. 운영자의 검토·숨김·종결 조치를 기록한다. | [피드 구현](../packages/backend/src/providers/community/CommunityProvider.ts), [신고 구현](../packages/backend/src/providers/reports/ReportProvider.ts), [피드 검사](../packages/backend/test/features/api/knittinglog/test_api_knittinglog_feed.ts), [운영자 검사](../packages/backend/test/features/api/knittinglog/test_api_knittinglog_report_operator.ts). | 운영자 계정·권한 설정과 실제 클라이언트 동작을 운영 대상에서 확인해야 한다. |
| 삭제·파일 참조 | 직접 삭제한 콘텐츠에 삭제 작업 UUID를 기록한다. 삭제된 부모의 하위 접근을 거부한다. 저장 객체의 키·해시·크기를 모델에 정의했다. | [삭제·복구 설계](erd-design.md#삭제와-복구-경계), [스키마](../packages/backend/prisma/schema/main.prisma), [부모 삭제 API 검사](../packages/backend/test/features/api/knittinglog/test_api_knittinglog_feed.ts). | 콘텐츠 복구·물리삭제·파일 업로드·파일 보존·파일 복원 실행 도구는 추가해야 한다. 저장 객체의 모델만으로 실제 파일 처리를 완료했다고 표시하지 않는다. |
| API 버전·SDK | 업무 경로는 `/api/v1`을 사용한다. 미버전·미지원 경로는 JSON 404를 반환한다. 기존 모니터 경로를 유지한다. SDK와 OpenAPI를 생성한다. 내 참여 이력의 SDK 함수를 단일 호출로 통합했다. | [HTTP 설정](../packages/backend/src/MyBackend.ts), [버전 단위 검사](../packages/backend/test/unit/api-versioning.ts), [실제 SDK 호출](../packages/backend/test/isolated-api.ts), [SDK 절차](sdk-procedure.md). | 최신 업무 SDK의 tarball·외부 소비자를 검사해야 한다. 기존 중첩 호출을 쓰는 클라이언트는 수정해야 한다. 병행 버전의 계약 격리와 구버전 폐기 승인·이관 기록은 별도 관리해야 한다. |
| 복구 목표 | RPO 15분, RTO 4시간과 보존 기간을 확정했다. 승인 역할과 실행 역할을 문서에 정의했다. | [운영 결정](data-recovery.md#운영-결정). | 실제 백업·복원·측정은 미검증이다. 역할을 실제 담당자와 연결해야 한다. |
| 빌드·CI·Evidence | 빌드와 Evidence 검사를 분리했다. DB 없는 단위·모니터 검사와 쓰기 가능한 격리 DB 검사를 분리했다. | [CI 설정](../.github/workflows/build.yml), [Evidence 설정](../packages/backend/lint.evidence.config.ts), [격리 실행기](../scripts/run-isolated-integration.cjs). | Evidence 16개와 `PLUGIN_TIMINGS` 성능 경고 1개가 남아 있다. 최근 로컬 보완의 원격 CI 결과는 없다. |

## 추가 작업과 완료 조건

아래 담당은 책임 역할이다. 실제 담당자 지정이나 운영 실행 승인을 뜻하지 않는다. 이 표는 새 구현의 완료 근거가 아니다.

| 작업 ID | 담당 | 현재 상태 | 해야 하는 작업과 완료 조건 |
|---|---|---|---|
| ADD-01 관계·감사 검증 | 백엔드 개발자·검증자 | 일부 적용·전체 미검증 | 구현자는 모든 쓰기 경로의 관계 검증 책임을 기록해야 한다. 서버는 잠금 후 존재·삭제·소유권·참여·권한을 다시 확인해야 한다. 검증자는 감사 주체 위조와 동시 삭제·생성에서 잘못된 관계가 남지 않는지 검사해야 한다. |
| ADD-02 콘텐츠 복구 | 백엔드 개발자·운영 승인자 | 실행 도구 미구현 | 승인자는 삭제 작업 UUID와 대상 행을 고정해야 한다. 도구는 30일 복구 기간과 현재 소유권·부모 상태를 확인해야 한다. 상태가 승인 시점과 다르면 거부해야 한다. 부모 복구는 개별 삭제된 자식과 종료된 관계를 복구하지 않아야 한다. 부분 실패는 전체 DB 변경을 롤백해야 한다. |
| ADD-03 역이관 | 백엔드 개발자·운영 승인자 | 실행 도구 미구현 | 도구는 별도 승인된 이관만 되돌려야 한다. 현재 프로젝트와 변경 번호가 원 이관 결과와 다르면 자동 역이관을 거부해야 한다. 도구는 현재 권한과 고유 제약을 검사해야 한다. 새 이관 이력을 생성해야 한다. 기존 이력은 변경하지 않아야 한다. |
| ADD-04 파일·물리삭제 | 백엔드 개발자·저장소 운영자 | 모델·설계 적용·실행 도구 미구현 | 담당자는 승인된 저장소에 실제 파일 처리를 연결해야 한다. 정리 도구는 복구 기간·현재 참조·백업 참조·이력 보존 조건을 모두 확인해야 한다. 기간 만료만으로 삭제하지 않아야 한다. 파일 제거가 실패하면 `purged_at`을 기록하지 않아야 한다. 검증자는 제거와 새 참조·복구의 경쟁 조건을 검사해야 한다. |
| ADD-05 재해 복구 | 백엔드 운영자·서비스 책임자 | 목표 확정·실행 미검증 | 운영자는 실제 DB 백업과 파일 백업을 격리 환경에 복원해야 한다. 검증자는 DB 관계와 파일 키·SHA-256·바이트 수를 확인해야 한다. 운영자는 복원 이후 탈퇴·차단 변경을 대조해야 한다. 과거 접근·갱신 토큰을 거부해야 한다. 대조 근거가 없으면 재개를 보류해야 한다. 검증자는 RPO 15분 이내와 RTO 4시간 이내를 측정해야 한다. 서비스 책임자는 재개를 별도로 승인해야 한다. |
| ADD-06 다중 인스턴스·부하 | 백엔드 개발자·검증자 | 전역 잠금·프로세스 내부 제한 적용·분산 수용 미검증 | 개발자는 인스턴스 간 요청 제한의 공통 상태를 보장해야 한다. 검증자는 동시 명령·중복 재시도·교착·충돌을 검사해야 한다. 전역 잠금의 처리량과 지연을 측정해야 한다. 부하 수용의 목표값과 실행 조건은 검사 전에 확정해야 한다. |
| ADD-07 클라이언트 | 클라이언트 개발자·검증자 | 이 저장소 밖의 상태 미확인 | 클라이언트는 서버의 타이머 상태를 조회해 작업을 이어야 한다. 결과가 불확실한 명령은 같은 작업 식별자로 재시도해야 한다. 서버 확인 전에 저장 완료를 표시하지 않아야 한다. 검증자는 다중 기기·연결 끊김·변경 번호 충돌과 사진 처리를 검사해야 한다. |
| ADD-08 DDL·운영 이행 | 백엔드 운영자·발주사 승인자 | 격리 DB 적용·운영 승인과 반영 미완료 | 담당자는 기존 데이터의 관계·중복·삭제 상태를 읽기 전용으로 검사해야 한다. 변경 요청에는 대상 객체·이유·영향·검증 결과·롤백 방법을 포함해야 한다. 승인된 변경만 검토된 마이그레이션 절차로 반영해야 한다. 운영 DB에서 직접 DDL을 실행하지 않아야 한다. |
| ADD-09 API 계약 책임 | 백엔드 개발자·서비스 책임자 | v1·중복 경로 통합 적용·미래 버전 수용 미완료 | `GET /api/v1/users/me/memberships`의 AccountController 처리 책임과 최신순 계약을 로컬에서 검증했다. SDK 호출은 `api.functional.api.v1.users.me.memberships(connection)`으로 통합했다. 기존 중첩 호출을 사용하는 외부 클라이언트는 수정해야 한다. 병행 버전은 서로의 계약을 바꾸지 않아야 한다. 구버전 폐기 기록은 종료일·영향 클라이언트·이관 방법·롤백 방법을 포함해야 한다. 서비스 책임자는 폐기를 승인해야 한다. 현재 v2 구현이나 v1 폐기를 요구하지 않는다. |
| ADD-10 정책 운영 발행 | 정책 담당자·백엔드 운영자 | 조회·동의 구현·실제 발행 미완료 | 담당자는 실제 정책 내용·버전·효력 시각·재동의 여부를 준비해야 한다. 동의가 참조한 내용을 변경하지 않아야 한다. 운영 발행은 테스트 fixture와 구분해야 한다. 검증자는 활성 버전 선택과 필수 재동의 거부를 실제 대상에서 확인해야 한다. |
| ADD-11 추적·빌드 경고 | 백엔드 개발자·빌드 담당자·검증자 | 로컬 검사 통과·경고 잔존 | 검증자는 기능 ID별 성공·거부·실패 근거를 연결해야 한다. 구현자는 미구현과 미검증을 구분해야 한다. Evidence 태그는 실제로 증명한 범위에만 연결해야 한다. 빌드 담당자는 `PLUGIN_TIMINGS`의 변환 지연 원인을 측정해야 한다. 경고 출력 중지는 지연 원인 해결의 증거가 아니다. |

## 최근 검사 결과

| 검사 범위 | 최근 결과 | 해석의 한계 |
|---|---|---|
| 전체 lint | 통과 | 업무 동작과 운영 수용을 대신하지 않는다. |
| DB 없는 단위 검사 | 8개 파일 통과. 내 참여 이력의 단일 라우팅·조회 조건·SDK 호출 포함 | 실제 제공자 호출과 실제 DB 통합 검사는 별도이다. |
| 전체 빌드 | 통과. `PLUGIN_TIMINGS` 경고 1개 | 경고가 없는 빌드라고 표시하지 않는다. 변환 콜백의 4.9초 소요를 보고했다. |
| Evidence·전체 테스트 타입 | 종료 0. `TS16411` 경고 16개 | 경고 수준은 유지했다. 종료 0은 전체 요구사항 충족을 뜻하지 않는다. |
| 실제 유출 비밀번호 제공자 | 공개 검사 문자열의 거부와 합성 문자열의 허용 통과 | 운영 사용자와 운영 서버를 검사하지 않았다. |
| 격리 DB 보호 조건 | 기존 SQL 조건 6개와 신규 통합 검사 경로 조건 2개 통과 | 이 보호 조건은 운영 작업 승인을 대신하지 않는다. |
| 격리 DB 업무 검사 | 비밀번호 거부·장애와 이관 중간 실패 검사 통과 | 콘텐츠 복구·역이관·PITR의 수용을 대신하지 않는다. |
| 기존 실제 HTTP 검사 | 44개 통과. 실패 0개. BLOCKED 0개 | 기능 ID 전체와 클라이언트 전체의 수용으로 환산하지 않는다. |
| DB 제약 | CHECK 34개·부분 고유 인덱스 4개·물리 FK 0개 확인 | 전체 비즈니스 관계의 무결성을 증명하지 않는다. |

최근 격리 DB의 경로는 `/private/tmp/knittinglog-tdd.47PawZ/postgres`이다. 서버 종료를 확인했다. 같은 임시 폴더에 단계별 로그와 `results.json`을 보존했다. 임시 자료는 저장소에 포함하지 않는다.

## 남은 Evidence 제목

아래 16개 제목은 근거 연결 경고의 단위이다. 각 제목에는 적용된 내용과 추가 작업이 함께 있다. 제목 전체의 수용을 확인하기 전에는 포괄 태그로 경고를 없애지 않는다.

| 요구사항 제목 | 연결할 추가 작업 |
|---|---|
| 4. DB 표준 (PostgreSQL) | ADD-01, ADD-08 |
| 4.3. 공통 컬럼과 논리삭제 | ADD-01, ADD-02, ADD-04 |
| 4.4. 물리 FK 미적용과 관계 관리 | ADD-01, ADD-02, ADD-03, ADD-06 |
| 4.5. DDL 변경과 운영 반영 | ADD-08 |
| 4.6. 설계 수용 기준과 검증 한계 | ADD-01, ADD-06, ADD-08, ADD-11 |
| 5. 승인한 구조 설계 | ADD-02, ADD-03, ADD-04, ADD-05 |
| 6. 확정 업무 정책 | ADD-01~ADD-10 |
| 6.1. 권한·차단·이관 | ADD-01, ADD-02, ADD-03, ADD-04 |
| 6.2. 프로젝트·타이머·카운터 | ADD-06, ADD-07 |
| 6.3. 계정·인증·정책 문서 | ADD-04, ADD-05, ADD-06, ADD-10 |
| 6.5. 운영·복구와 구현 수용 | ADD-01, ADD-02, ADD-03, ADD-04, ADD-05, ADD-06, ADD-08 |
| 7. API 버저닝 | ADD-09 |
| 공통 규칙 | ADD-01, ADD-07, ADD-11 |
| 기능별 추적표 | ADD-07, ADD-11 |
| 나가기·추방 이관 | ADD-03, ADD-04, ADD-11 |
| 정책 분석 | ADD-01, ADD-03, ADD-04, ADD-11 |

이 표는 후속 작업의 연결표이다. 각 제목에 별도의 구현 누락이 있다고 자동 판정하지 않는다. 실제 코드와 검사 근거를 제목의 조항별로 대조해야 한다. ADD-09의 멤버십 중복 경로는 해결했다. 미래 버전 수용과 외부 클라이언트의 SDK 호출 수정은 별도이다. ADD-11의 빌드 성능 경고는 제품 요구사항과 구분한다.

## 필요한 정보와 승인 경계

- 클라이언트 담당자는 정확한 저장소 경로와 검증할 기기를 제공해야 한다. 이 정보 없이 외부 클라이언트를 미구현으로 판정하지 않는다.
- 저장소 담당자는 파일 저장소 종류·객체 키 규칙·접근 방법·격리 검증 대상을 제공해야 한다. 비밀값은 문서와 로그에 기록하지 않는다.
- 운영 담당자는 복구 검증 대상과 사용할 백업을 고정해야 한다. 합성 로컬 복구와 실제 운영 백업의 격리 복원을 구분해야 한다.
- 승인 책임자는 실제 담당자와 연락 경로를 기록해야 한다. 승인되지 않은 운영 변경은 실행하지 않는다.
- 담당자는 부하 조건·동시 사용자 수·처리량·지연의 수용 목표를 확정해야 한다. 현재 문서에서 임의의 목표값을 만들지 않는다.
- commit·push·운영 DB 반영·배포·서비스 재개는 서로 다른 작업이다. 이번 `origin/develop` 게시 승인은 운영 DB 반영·배포·서비스 재개를 승인하지 않는다.
