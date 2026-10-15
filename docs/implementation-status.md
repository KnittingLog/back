# 구현 현황과 추가 작업 명세

## 기준과 상태

- 작성 기준일은 2026-10-15이다. 실행 모드는 `LOCAL_ONLY`이다.
- 이번 작업의 기준 커밋은 `develop`의 `950d47d`이다. 작업 브랜치는 `feat/backend-recovery-lifecycle`이다.
- 이번 작업은 로컬 구현과 검증이다. 사용자는 2026-10-15에 의미 단위 commit을 승인했다. push·운영 DB 반영·배포는 승인 범위가 아니다.
- 요구사항의 기준은 [확정 요구사항](requirements.md)이다. 저장 계약의 기준은 [테이블 설계](erd-design.md)이다. 복구 목표의 기준은 [데이터 복구 문서](data-recovery.md)이다.
- 최근 검증 결과는 [요구사항 대조와 결함 보완 기록](implementation-validation.md#요구사항-대조와-결함-보완-2026-10-15)을 사용한다. 과거 검증 기록은 당시 범위의 근거로 유지한다.
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

## 이번 구현 범위

| 대상 | 현재 적용과 한계 | 반영 여부 |
|---|---|---|
| ADD-02 로컬 콘텐츠 복구 | 승인 대상과 상태를 고정한다. 30일 기간과 현재 권한을 확인한다. 격리 DB에서 복구·거부·롤백·재시도를 검사했다. | 반영됨 |
| ADD-03 로컬 역이관 | 현재 원 이관 결과, 참여 상한과 소유 관계를 확인한다. 새 참여 기간과 이력을 생성한다. 기존 식별자를 보존한다. | 반영됨 |
| ADD-04 로컬 파일·정리 실행 | 명시적 로컬 파일 어댑터, 검증된 원래 키 복원, 파일 제거와 콘텐츠 행 물리삭제를 구현했다. 보존 증거가 없으면 거부한다. | 반영됨 |
| ADD-06 공유 인증 제한 | PostgreSQL에서 시도 수를 공유한다. 독립 Prisma 클라이언트 2개로 동시 요청과 창 만료를 검사했다. 실제 다중 서버 부하 수용은 별도이다. | 반영됨 |
| 운영 저장소·백업 인벤토리·실제 복원 | 실제 제공자 연결과 운영 백업의 격리 복원은 수행하지 않았다. 합성 보존 증거를 운영 증거로 사용하지 않는다. | 안됨 |
| 중단된 파일 복원의 운영 조정 | 완료가 미확인된 실행 의도는 영구 제거를 차단한다. 원 실행의 종료·바이트 확인과 안전한 해제 도구는 아직 없다. | 안됨 |
| Pulumi·TypeScript 인프라 | 사용자가 기술 방향을 선택했다. 리소스 구성과 배포는 이번 범위에서 유예했다. | 안됨 |
| 요구사항 대조 결함 보완 | 멤버 목록 차단 숨김, 유효 초대 기본 조회, 작업 상태 정렬, 탈퇴 시 후임 이관, 기록·댓글 재시도 중복 방지, 댓글·반응의 version 비증가, 신고 차단 조치 기록, 대문자 UUID 자기 관계 거부, 업로드 동의 검사, 모니터 시험 경로 제거, 스키마 준비 경로의 설계 제약 적용을 반영했다. | 반영됨 |
| 요구사항 해석 필요 항목 | 탈퇴한 멤버의 공동 프로젝트 기록 표시, 게시글 좋아요 상태 조회, 논리삭제한 작업 공간이 있는 재가입은 정책 결정 전까지 현재 동작을 유지한다. | 안됨 |

실행 절차와 안전 경계는 [복구와 파일 수명주기](backend-maintenance.md)를 따른다.

## 적용된 항목과 검증 한계

| 영역 | 적용된 내용 | 확인한 근거 | 더 해야 하는 내용 |
|---|---|---|---|
| 도메인 구조 | 업무 컨트롤러를 `controllers/<domain>/v1`로 분리했다. Provider는 버전 폴더 없이 도메인으로 분리했다. 내 참여 이력 조회는 AccountController로 통합했다. 중복 MembershipHistoryController를 삭제했다. | [모듈 등록](../packages/backend/src/controllers/KnittingLogModule.ts), [구조 변경 검증](implementation-validation.md#도메인-구조-변경-후-통합-검사-2026-10-11), [단일 라우팅 검사](../packages/backend/test/unit/account-memberships.ts). | 도메인 경계 변경 시 모듈 등록과 SDK 계약의 회귀 검사를 유지해야 한다. |
| DB 설계·이름 | 업무 스키마 4개와 모델 28개를 정의했다. 공통 감사 컬럼과 논리삭제 컬럼을 적용했다. 인증 제한 저장 모델을 추가했다. | [스키마](../packages/backend/prisma/schema/main.prisma), [ERD 정적 검사](../packages/backend/scripts/check-erd.cjs), [실행 연결](../packages/backend/test/unit/erd-contract.ts). 논리 관계 47개를 확인했다. | 기존 운영 데이터의 정합성을 검사해야 한다. 승인된 마이그레이션을 별도로 준비해야 한다. |
| DB 제약 | CHECK 35개와 부분 고유 인덱스 4개를 설계했다. 격리 DB에 적용했다. 물리 FK를 생성하지 않았다. | [보완 SQL](../packages/backend/prisma/design-constraints.sql), [실제 DB 제약 검사](../packages/backend/test/integration/erd-constraints.sql). 제약 위반의 거부를 확인했다. | 모든 업무 관계와 모든 쓰기 경로의 수용을 추가로 증명해야 한다. 제약 검사는 업무 권한 검사를 대신하지 않는다. |
| 관계·원자성 | 서버는 존재·삭제·소유권·참여·차단 상태를 검사한다. 업무 변경에 공통 advisory lock과 트랜잭션을 사용한다. 일부 충돌을 제한된 횟수로 재시도한다. | [공통 문맥](../packages/backend/src/providers/common/KnittingLogContext.ts), [이관 경쟁 검사](../packages/backend/test/features/api/knittinglog/test_api_knittinglog_transfers.ts). | 일괄 입력·관리 도구·raw SQL을 포함한 모든 쓰기 경로를 점검해야 한다. 다중 인스턴스와 전체 경쟁 조건을 검사해야 한다. |
| 계정·인증 | 식별자 정규화, scrypt, 복구 코드 해시와 인증 무효화를 유지한다. 시도 제한을 프로세스 메모리에서 PostgreSQL 공유 상태로 옮겼다. | [인증 구현](../packages/backend/src/providers/auth/AuthProvider.ts), [공유 제한](../packages/backend/src/providers/auth/AuthAttemptProvider.ts), [독립 클라이언트 검사](../packages/backend/test/integration/auth-attempts.ts). | 실제 다중 서버 부하와 운영 복원 후 과거 인증 거부는 별도로 검사해야 한다. |
| 유출 비밀번호 | `MODE=real`에서 실제 Pwned Passwords 제공자를 기본으로 사용한다. 원문과 전체 해시를 전송하지 않는다. 제공자 장애를 허용으로 처리하지 않는다. | [구현](../packages/backend/src/providers/auth/Security.ts), [단위 검사](../packages/backend/test/unit/pwned-passwords.ts), [HTTP/DB 검사](../packages/backend/test/integration/password-screening.ts), [실제 제공자 검사](../packages/backend/test/integration/pwned-passwords-live.ts). | 운영 환경의 연결성과 장애 동작을 검사해야 한다. `local`과 `dev`의 기본 경로는 실제 제공자를 자동 호출하지 않는다. |
| 정책 문서·동의 | 효력 시각을 기준으로 활성 한국어 문서를 선택한다. 필수 재동의를 검사한다. 뒤의 선택적 버전으로 필수 동의를 우회하지 못하게 한다. | [정책 구현](../packages/backend/src/providers/policies/PolicyProvider.ts), [정책 경계 검사](../packages/backend/test/integration/policy-gates.ts). | 실제 정책 내용과 운영 발행 절차를 준비해야 한다. 테스트용 문서는 운영 약관이 아니다. |
| 친구·차단·공개 범위 | 친구 요청과 차단을 처리한다. 양방향 차단을 우선한다. 당사자 간 대기 요청·초대를 종료한다. 제3자 관계와 공동 프로젝트 참여는 유지한다. 프로젝트 멤버 목록에서도 차단 관계를 숨긴다. 자기 관계 검사는 UUID 대소문자를 구분하지 않는다. | [소셜 구현](../packages/backend/src/providers/social/SocialProvider.ts), [소셜 API 검사](../packages/backend/test/features/api/knittinglog/test_api_knittinglog_social.ts). | 기능 ID별 공개 범위·목록·검색·집계의 전체 수용 근거를 정리해야 한다. |
| 프로젝트·개인 작업 공간 | 멤버십과 개인 데이터의 소유를 분리했다. 참여 인원 상한을 검사한다. 방장 후임을 확인한다. 재가입 시 새 참여 기간을 생성한다. 자신의 현재·종료한 참여 이력은 AccountController가 최신순으로 반환한다. | [프로젝트 구현](../packages/backend/src/providers/projects/ProjectProvider.ts), [프로젝트 API 검사](../packages/backend/test/features/api/knittinglog/test_api_knittinglog_projects.ts), [재가입 검사](../packages/backend/test/features/api/knittinglog/test_api_knittinglog_transfers.ts). | 운영 이행 시 기존 소유 관계를 검사해야 한다. |
| 상태·타이머·카운터 | 서버에 타이머 상태를 저장한다. 미완료 타이머가 있으면 done 전환을 거부한다. 종료와 기록 생성을 함께 처리한다. 변경 번호와 작업 식별자를 검사한다. | [작업 공간 구현](../packages/backend/src/providers/workspaces/WorkspaceProvider.ts), [상태·타이머·카운터 검사](../packages/backend/test/features/api/knittinglog/test_api_knittinglog_workspaces.ts). | 클라이언트의 다중 기기 동작·재시도·저장 표시를 검사해야 한다. 부하 조건의 수용은 미검증이다. |
| 기록·댓글·반응 | 작성자·소유권·현재 접근 권한을 검사한다. done 상태의 기존 기록 변경을 허용한다. 댓글과 반응을 원 기록에 보존한다. | [기록 구현](../packages/backend/src/providers/records/RecordProvider.ts), [기록 API 검사](../packages/backend/test/features/api/knittinglog/test_api_knittinglog_records.ts). | 전체 공개 범위 조합과 새 복구 도구의 권한 경계를 검사해야 한다. |
| 나가기·추방 이관 | 기존 이관의 식별자와 원자성을 유지한다. 승인된 역이관은 새 참여 기간과 이력을 생성한다. 변경된 상태와 현재 권한 충돌을 거부한다. | [이관 API 검사](../packages/backend/test/features/api/knittinglog/test_api_knittinglog_transfers.ts), [중간 실패 검사](../packages/backend/test/integration/transfer-rollback.ts), [복구·역이관 검사](../packages/backend/test/integration/recovery-lifecycle.ts). | 실제 저장소 사진과 전체 장애 지점의 운영 수용은 별도이다. |
| 피드·신고 | 피드 커서와 현재 차단 상태를 검사한다. 신고 시 허용한 텍스트 증거를 보존한다. 운영자의 검토·숨김·종결 조치를 기록한다. | [피드 구현](../packages/backend/src/providers/community/CommunityProvider.ts), [신고 구현](../packages/backend/src/providers/reports/ReportProvider.ts), [피드 검사](../packages/backend/test/features/api/knittinglog/test_api_knittinglog_feed.ts), [운영자 검사](../packages/backend/test/features/api/knittinglog/test_api_knittinglog_report_operator.ts). | 운영자 계정·권한 설정과 실제 클라이언트 동작을 운영 대상에서 확인해야 한다. |
| 삭제·파일 참조 | 승인된 콘텐츠 복구와 물리삭제, Base64 파일 API, 프로필 사진 연결, 실제 바이트 검증과 원래 키 복원을 구현했다. 파일 제거 전에 실행 UUID를 확정한다. | [실행 경계](backend-maintenance.md), [복구 검사](../packages/backend/test/integration/recovery-lifecycle.ts), [파일 검사](../packages/backend/test/integration/storage-lifecycle.ts), [행 물리삭제 검사](../packages/backend/test/integration/content-purge.ts). | 실제 저장소·백업 인벤토리와 운영 보존 정책을 연결해야 한다. 기본 미설정 상태의 영구 제거는 거부한다. |
| API 버전·SDK | 업무 경로는 `/api/v1`을 사용한다. 미버전·미지원 경로는 JSON 404를 반환한다. 기존 모니터 경로를 유지하고 인증 없는 시험 오류 경로를 제거했다. 실제 OpenAPI 경로의 버전 접두어를 단위 검사한다. SDK와 OpenAPI를 생성한다. 내 참여 이력의 SDK 함수를 단일 호출로 통합했다. | [HTTP 설정](../packages/backend/src/MyBackend.ts), [버전 단위 검사](../packages/backend/test/unit/api-versioning.ts), [실제 SDK 호출](../packages/backend/test/isolated-api.ts), [SDK 절차](sdk-procedure.md). | 최신 업무 SDK의 tarball·외부 소비자를 검사해야 한다. 기존 중첩 호출을 쓰는 클라이언트는 수정해야 한다. 병행 버전의 계약 격리와 구버전 폐기 승인·이관 기록은 별도 관리해야 한다. |
| 복구 목표 | RPO 15분, RTO 4시간과 보존 기간을 확정했다. 승인 역할과 실행 역할을 문서에 정의했다. | [운영 결정](data-recovery.md#운영-결정). | 실제 백업·복원·측정은 미검증이다. 역할을 실제 담당자와 연결해야 한다. |
| 빌드·CI·Evidence | 빌드와 Evidence 검사를 분리했다. DB 없는 단위·모니터 검사와 쓰기 가능한 격리 DB 검사를 분리했다. | [CI 설정](../.github/workflows/build.yml), [Evidence 설정](../packages/backend/lint.evidence.config.ts), [격리 실행기](../scripts/run-isolated-integration.cjs). | Evidence 16개와 `PLUGIN_TIMINGS` 성능 경고 1개가 남아 있다. 최근 로컬 보완의 원격 CI 결과는 없다. |

## 추가 작업과 완료 조건

아래 담당은 책임 역할이다. 실제 담당자 지정이나 운영 실행 승인을 뜻하지 않는다. 이 표는 새 구현의 완료 근거가 아니다.

| 작업 ID | 담당 | 현재 상태 | 해야 하는 작업과 완료 조건 |
|---|---|---|---|
| ADD-01 관계·감사 검증 | 백엔드 개발자·검증자 | 일부 적용·전체 미검증 | 구현자는 모든 쓰기 경로의 관계 검증 책임을 기록해야 한다. 서버는 잠금 후 존재·삭제·소유권·참여·권한을 다시 확인해야 한다. 검증자는 감사 주체 위조와 동시 삭제·생성에서 잘못된 관계가 남지 않는지 검사해야 한다. |
| ADD-02 콘텐츠 복구 | 백엔드 개발자·운영 승인자 | 로컬 구현·격리 수용 검사 | 로컬 도구의 대상 고정·30일 기간·부모·현재 참여·승인 후 변경·개별 자식 보존·전체 롤백을 검사했다. 운영자는 실제 역할과 절차를 연결해야 한다. 운영 적용은 별도 승인 대상이다. |
| ADD-03 역이관 | 백엔드 개발자·운영 승인자 | 로컬 구현·격리 수용 검사 | 현재 원 이관 결과·참여 상한·다른 참여자·변경 번호 충돌과 새 이력·참여 기간 생성을 검사했다. 실제 운영 대상의 권한과 사진 보존은 별도 확인이 필요하다. |
| ADD-04 파일·물리삭제 | 백엔드 개발자·저장소 운영자 | 로컬 실행 구현·운영 제공자 미연결 | 로컬 실제 바이트, 참조 경쟁, 보존 거부, 외부 제거 실패와 DB 롤백 재시도를 검사했다. 담당자는 실제 저장소·백업 인벤토리·이력 보존 정책을 연결해야 한다. 중단된 복원 의도의 안전한 운영 조정 도구도 필요하다. |
| ADD-05 재해 복구 | 백엔드 운영자·서비스 책임자 | 목표 확정·실행 미검증 | 운영자는 실제 DB 백업과 파일 백업을 격리 환경에 복원해야 한다. 검증자는 DB 관계와 파일 키·SHA-256·바이트 수를 확인해야 한다. 운영자는 복원 이후 탈퇴·차단 변경을 대조해야 한다. 과거 접근·갱신 토큰을 거부해야 한다. 대조 근거가 없으면 재개를 보류해야 한다. 검증자는 RPO 15분 이내와 RTO 4시간 이내를 측정해야 한다. 서비스 책임자는 재개를 별도로 승인해야 한다. |
| ADD-06 다중 인스턴스·부하 | 백엔드 개발자·검증자 | PostgreSQL 공유 제한 적용·부하 미검증 | 독립 DB 클라이언트의 동시 제한·만료·감사 주체 폐기·인증 실패 롤백을 검사했다. 실제 다중 서버의 동시 명령·교착과 전역 잠금의 처리량·지연은 별도 부하 조건으로 측정해야 한다. 수용 목표와 조건은 검사 전에 확정해야 한다. |
| ADD-07 클라이언트 | 클라이언트 개발자·검증자 | 이 저장소 밖의 상태 미확인 | 클라이언트는 서버의 타이머 상태를 조회해 작업을 이어야 한다. 결과가 불확실한 명령은 같은 작업 식별자로 재시도해야 한다. 서버 확인 전에 저장 완료를 표시하지 않아야 한다. 검증자는 다중 기기·연결 끊김·변경 번호 충돌과 사진 처리를 검사해야 한다. |
| ADD-08 DDL·운영 이행 | 백엔드 운영자·발주사 승인자 | 격리 DB 적용·운영 승인과 반영 미완료 | 담당자는 기존 데이터의 관계·중복·삭제 상태를 읽기 전용으로 검사해야 한다. 변경 요청에는 대상 객체·이유·영향·검증 결과·롤백 방법을 포함해야 한다. 승인된 변경만 검토된 마이그레이션 절차로 반영해야 한다. 운영 DB에서 직접 DDL을 실행하지 않아야 한다. |
| ADD-09 API 계약 책임 | 백엔드 개발자·서비스 책임자 | v1·중복 경로 통합 적용·미래 버전 수용 미완료 | `GET /api/v1/users/me/memberships`의 AccountController 처리 책임과 최신순 계약을 로컬에서 검증했다. SDK 호출은 `api.functional.api.v1.users.me.memberships(connection)`으로 통합했다. 기존 중첩 호출을 사용하는 외부 클라이언트는 수정해야 한다. 병행 버전은 서로의 계약을 바꾸지 않아야 한다. 구버전 폐기 기록은 종료일·영향 클라이언트·이관 방법·롤백 방법을 포함해야 한다. 서비스 책임자는 폐기를 승인해야 한다. 현재 v2 구현이나 v1 폐기를 요구하지 않는다. |
| ADD-10 정책 운영 발행 | 정책 담당자·백엔드 운영자 | 조회·동의 구현·실제 발행 미완료 | 담당자는 실제 정책 내용·버전·효력 시각·재동의 여부를 준비해야 한다. 동의가 참조한 내용을 변경하지 않아야 한다. 운영 발행은 테스트 fixture와 구분해야 한다. 검증자는 활성 버전 선택과 필수 재동의 거부를 실제 대상에서 확인해야 한다. |
| ADD-11 추적·빌드 경고 | 백엔드 개발자·빌드 담당자·검증자 | 로컬 검사 통과·경고 잔존 | 검증자는 기능 ID별 성공·거부·실패 근거를 연결해야 한다. 구현자는 미구현과 미검증을 구분해야 한다. Evidence 태그는 실제로 증명한 범위에만 연결해야 한다. 빌드 담당자는 `PLUGIN_TIMINGS`의 변환 지연 원인을 측정해야 한다. 경고 출력 중지는 지연 원인 해결의 증거가 아니다. |

## 최근 검사 결과

| 검사 범위 | 최근 결과 | 해석의 한계 |
|---|---|---|
| 전체 lint | 통과 | 업무 동작과 운영 수용을 대신하지 않는다. |
| DB 없는 단위 검사 | 12개 파일 통과. 신규 승인 권한·파일 무결성·보존·공유 제한과 본문 크기 회귀 포함 | 실제 제공자 호출과 실제 DB 통합 검사는 별도이다. |
| 전체 빌드 | 통과. `PLUGIN_TIMINGS` 경고 1개 | 고정한 부하·캐시 조건의 성능 비교가 아니다. |
| Evidence·전체 테스트 타입 | 종료 0. `TS16411` 경고 16개 | 경고 수준은 유지했다. 종료 0은 전체 요구사항 충족을 뜻하지 않는다. |
| 실제 유출 비밀번호 제공자 | 공개 검사 문자열의 거부와 합성 문자열의 허용 통과 | 운영 사용자와 운영 서버를 검사하지 않았다. |
| 격리 DB 보호 조건 | SQL 조건 6개와 통합 검사 경로 조건 6개 통과. 업무 쓰기 부재 확인 | 이 보호 조건은 운영 작업 승인을 대신하지 않는다. |
| 격리 DB 업무 검사 | 기존 검사와 신규 복구·역이관·파일 수명주기·공유 인증 제한·콘텐츠 물리삭제 통과 | 합성 파일과 보존 인벤토리를 사용했다. 실제 운영 백업의 PITR과 파일 복원을 증명하지 않는다. |
| 실제 HTTP 검사 | 51개 통과. 실패 0개. BLOCKED 0개. 결함 보완 검사 7개 포함 | 기능 ID 전체와 클라이언트 전체의 수용으로 환산하지 않는다. |
| DB 제약 | CHECK 35개·부분 고유 인덱스 4개·물리 FK 0개 확인 | 전체 비즈니스 관계의 무결성을 증명하지 않는다. |

최근 격리 DB의 경로는 `/private/tmp/knittinglog-tdd.j91dpz/postgres`이다. 서버 종료를 확인했다. 같은 임시 폴더에 단계별 로그와 `results.json`을 보존했다. 임시 자료는 저장소에 포함하지 않는다.

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
- 향후 인프라는 Pulumi와 TypeScript를 사용한다. 리소스 구성과 배포는 이번 구현 범위에서 제외한다.
- commit·push·운영 DB 반영·배포·서비스 재개는 서로 다른 작업이다. 이번 작업에는 게시나 운영 변경 승인이 없다.
