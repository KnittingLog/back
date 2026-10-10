# API 테스트 선행 계약

## 기준과 범위

- 기능 기준은 [요구사항](requirements.md)입니다. 데이터 책임과 무결성 기준은 [테이블 설계](erd-design.md)입니다.
- 사용자는 2026-10-10에 확정 요구사항을 기준으로 ERD를 먼저 변경하고 TDD로 업무 API를 구현하도록 요청했습니다.
- 아래 경로·입력·HTTP 상태는 구현과 테스트가 함께 사용하는 계약입니다. 기능 정책은 요구사항 6절과 API 버저닝 7절을 따릅니다.
- 테스트 계약의 타입은 [KnittingLogApi.ts](../packages/backend/test/helpers/KnittingLogApi.ts)에 있습니다. 업무 SDK가 생성되면 실제 계약과 대조합니다.
- 테스트는 기존 Nestia DynamicExecutor를 사용합니다. Cypress와 새 테스트 의존성은 추가하지 않습니다.
- 작성 방식은 ASD-STE100의 명료성 원칙을 참고합니다. 한국어 문서의 정식 표준 준수를 뜻하지 않습니다.

## 실행 조건

- 실행 모드는 LOCAL_ONLY입니다. 이 테스트는 이미 실행 중인 로컬 API에 접속합니다.
- 전용 진입점은 [test/knittinglog.ts](../packages/backend/test/knittinglog.ts)입니다. 서버를 시작하거나 DB를 초기화하지 않습니다.
- KNITTINGLOG_TEST_URL은 localhost, 127.0.0.1 또는 ::1의 API 주소여야 합니다.
- URL의 인증 정보, 경로, 쿼리와 앵커는 금지합니다. HTTP 리다이렉트와 모의 응답도 금지합니다.
- KNITTINGLOG_TEST_ALLOW_WRITES=1은 격리된 API에 테스트 데이터를 생성한다는 명시적 실행 동의입니다.
- 로컬 URL만으로 DB 격리를 보장하지 않습니다. 실행 전에 대상 서버의 실제 DB 연결을 별도로 확인해야 합니다.
- 가입에 사용할 정책 문서를 테스트 DB에 먼저 준비해야 합니다. 빈 정책 목록은 FIXTURE_BLOCKED로 실패합니다.
- 반응 테스트는 확정 코드 `like`를 사용합니다. 신고 테스트는 확정 코드 `spam`을 사용합니다. 등록하지 않은 코드와 내용 없는 `other` 신고는 거부해야 합니다.
- 각 테스트는 UUID에서 만든 새 qa_ 계정을 생성합니다. 식별자 길이는 32자 이하입니다. 기존 계정과 업무 데이터를 사용하지 않습니다.
- 피드 커서 검사는 최대 10페이지를 조회합니다. 테스트 게시글을 이 범위에서 찾을 수 있는 전용 피드를 사용해야 합니다.
- 테스트 데이터의 일괄 삭제를 추가하지 않습니다. 실행 후에는 승인된 범위에서 별도 정리합니다.
- 테스트 코드의 비밀번호와 인증 토큰은 메모리에만 보관합니다. 진입점은 응답 본문과 오류 객체를 출력하지 않습니다.
- 운영자 워크플로 테스트는 조정자가 새 격리 DB에서 발급한 `KNITTINGLOG_TEST_OPERATOR_TOKEN`과 `KNITTINGLOG_TEST_OPERATOR_USER_ID`를 사용합니다. 서버의 임시 `KNITTINGLOG_OPERATOR_USER_IDS` 허용 목록과 같은 사용자여야 합니다. 값이 없으면 FIXTURE_BLOCKED입니다. 실제 환경 파일과 운영 설정은 변경하지 않습니다.

```sh
# 승인한 격리 API에서만 실행합니다.
KNITTINGLOG_TEST_URL=http://127.0.0.1:37001 \
KNITTINGLOG_TEST_ALLOW_WRITES=1 \
pnpm -C packages/backend test:knittinglog

# API 요청 없이 테스트 코드의 타입만 확인합니다.
pnpm -C packages/backend exec ttsc -p test/tsconfig.json --noEmit
```

기존 pnpm test와 webpack:test는 마이그레이션 폴더 삭제와 DB 초기화 경로를 포함합니다. 이 작업에서는 실행하지 않습니다.

## 공통 HTTP 계약

- 가입과 새 리소스 생성은 201을 반환합니다. 조회와 갱신은 200을 반환합니다.
- DELETE와 로그아웃은 빈 204를 반환합니다. 반응 PUT과 수락 재시도는 기존 결과를 200으로 반환합니다.
- 업무 API의 204 외 응답은 JSON입니다. 오류 응답은 code와 message를 포함합니다. 기존 health API는 200과 빈 본문을 반환합니다.
- 인증 누락과 유효하지 않은 계정·세션은 401입니다.
- 입력 형식 오류와 음수 입력은 400입니다. 클라이언트의 감사 컬럼 입력도 거부합니다.
- 대상에 접근할 수 있는 멤버의 업무 권한 부족은 403입니다.
- 존재하지 않거나 비공개인 대상, 차단된 프로필과 삭제된 상위 대상은 404입니다.
- 고유값 중복, 대기 요청 중복과 현재 상태 충돌은 409입니다.
- 로그인 ID 부재와 비밀번호 불일치는 같은 공개 오류를 반환합니다.
- 인증 헤더는 Authorization: Bearer 형식을 사용합니다. 공개 사용자 응답에 로그인 ID와 인증 필드를 넣지 않습니다.
- 피드 목록은 `{ items, next_cursor }`를 반환합니다. 나머지 목록 응답은 배열입니다.
- 인증·가입·공개 정책 조회를 포함한 모든 업무 경로는 `/api/v1`로 시작합니다. 경로 누락·미지원 버전은 404입니다. 자동 버전 선택이나 리다이렉트는 금지합니다.
- `/monitors/health`, `/monitors/system`, `/monitors/performance`는 기존 운영 경로를 유지합니다. 버전별 모니터 경로를 추가하지 않습니다.

## 요청 경로

아래 표의 모든 경로 앞에 `/api/v1`을 붙입니다. 테스트 도우미는 이 접두어를 한 번 적용합니다. 버전 누락·미지원 버전 검사와 모니터 검사만 원본 경로를 사용합니다.

| 경로 | 테스트에서 사용하는 계약 |
|---|---|
| GET /policy-documents | 종류별로 효력 시작 시각이 지난 최신 한국어 정책 버전을 반환합니다. |
| POST /auth/register | login_id, handle, nickname, password, policy_document_ids를 받습니다. 사용자와 access_token·refresh_token·recovery_code를 반환합니다. |
| POST /auth/login | login_id와 password를 받습니다. 사용자와 access_token·refresh_token을 반환합니다. 복구 코드는 반환하지 않습니다. |
| POST /auth/recovery | login_id·recovery_code·password로 비밀번호를 재설정합니다. 기존 세션을 무효화하고 새 세션과 새 복구 코드를 반환합니다. |
| POST /auth/recovery-code | 현재 비밀번호로 재인증한 뒤 새 recovery_code를 반환합니다. 이전 코드를 무효화합니다. |
| POST /auth/refresh | refresh_token을 받습니다. 유효한 세션을 반환합니다. |
| POST /auth/logout | 현재 세션의 refresh_token을 폐기합니다. |
| GET·PATCH·DELETE /users/me | 자신의 기본 정보 조회, 변경과 탈퇴를 수행합니다. |
| GET /users/me/policy-consents | 가입 시 동의한 버전 식별자와 동의 시각을 반환합니다. |
| POST /users/me/policy-consents | 현재 policy_document_ids에 재동의합니다. 동일 버전의 기존 동의 시각을 유지하고 Consent 배열을 반환합니다. |
| GET /users/me/memberships | 자신의 종료한 참여 기간을 포함한 이력을 반환합니다. |
| GET /users/me/records·statistics | 자신의 기록과 총 작업 시간을 반환합니다. |
| GET /users?query=… | 공개 계정 ID로 사용자를 검색합니다. 차단 관계를 제외합니다. |
| GET /users/:id | 공개 기본 정보를 반환합니다. |
| GET /users/:id/records·statistics | 현재 공개 범위와 친구 관계에 따라 기록과 총 시간을 제한합니다. |
| GET /users/:id/posts | 프로필 공개 범위와 무관하게 게시글을 반환합니다. 차단된 사용자는 404입니다. |
| GET·POST /friend-requests | direction·status로 요청을 조회합니다. recipient_id로 요청을 생성합니다. |
| GET /friend-requests/badge | pending_count를 반환합니다. |
| POST /friend-requests/:id/accept·reject | 수신자가 요청을 처리합니다. |
| DELETE /friend-requests/:id | 송신자가 대기 요청을 취소합니다. |
| GET /friends | 현재 친구 목록을 반환합니다. |
| DELETE /friends/:userId | 친구 관계를 해제합니다. |
| POST /blocks | blocked_id 방향의 차단을 생성합니다. |
| DELETE /blocks/:userId | 요청자의 방향만 해제합니다. |
| GET·POST /projects | 개인 상태 필터로 조회합니다. name·invitee_user_ids로 생성합니다. |
| GET·PATCH·DELETE /projects/:id | 프로젝트를 조회하고 방장이 변경·삭제합니다. |
| GET /projects/:id/memberships | 유효한 참여만 반환합니다. |
| GET /projects/:id/workspaces | 현재 멤버의 개인 작업 공간을 반환합니다. |
| PATCH /projects/:id/owner | owner_user_id의 유효한 멤버에게 방장을 양도합니다. |
| POST /projects/:id/invitations | recipient_id의 친구를 초대합니다. |
| GET /project-invitations?status=pending | 수신자의 대기 초대를 반환합니다. |
| POST /project-invitations/:id/accept | 멤버십을 반환합니다. 반복 수락도 같은 멤버십을 반환합니다. |
| DELETE /project-invitations/:id | 초대 송신자가 대기 초대를 취소합니다. |
| GET·PATCH /workspaces/:id | 작업 공간을 조회하고 소유자가 상태·실·바늘 메모를 변경합니다. |
| GET·POST /workspaces/:id/counters | 표시 순서로 개인 카운터를 조회합니다. 추가는 name·target_value·is_visible·operation_id·expected_version을 받고 201을 반환합니다. |
| PATCH /counters/:id | 소유자가 이름·값·목표·is_visible을 변경합니다. operation_id와 작업 공간의 expected_version을 받습니다. |
| POST /counters/:id/adjust | operation_id와 delta=1 또는 -1을 받아 원자적으로 반영합니다. 음수 결과는 409입니다. |
| POST /counters/:id/reset | operation_id·expected_version으로 값을 0으로 변경합니다. 목표는 유지합니다. |
| PATCH /workspaces/:id/counters/order | operation_id·expected_version·counter_ids로 같은 작업 공간의 전체 카운터 순서를 변경합니다. |
| DELETE /counters/:id | JSON 본문의 operation_id·expected_version으로 소유자 카운터를 삭제합니다. |
| GET /workspaces/:id/timer | 서버에 저장한 타이머의 식별자·상태·시작 시각·누적 시간을 반환합니다. |
| POST /workspaces/:id/timer/start | operation_id·expected_version으로 타이머를 시작하고 201을 반환합니다. 실행 중 중복 시작은 409입니다. |
| POST /workspaces/:id/timer/pause·resume | operation_id·expected_version으로 상태를 바꾸고 200을 반환합니다. |
| POST /workspaces/:id/timer/stop | operation_id·expected_version·body로 타이머를 종료하고 기록을 같은 트랜잭션에 저장합니다. 201과 기록을 반환합니다. |
| GET·POST /workspaces/:id/records | 기록을 조회하고 완료된 manual·timer 시간을 저장합니다. |
| GET·PATCH·DELETE /records/:id | 기록을 조회하고 active·paused·done 상태에서 작성자가 기존 기록을 수정·삭제합니다. 합계와 작업 공간의 version에 반영합니다. |
| GET·POST /records/:id/comments | 현재 접근 권한으로 댓글을 조회·작성합니다. |
| DELETE /record-comments/:id | 댓글 작성자만 삭제합니다. |
| GET /records/:id/reactions | 유효한 반응을 조회합니다. |
| PUT·DELETE /records/:id/reactions/:emoji | 자신의 반응을 멱등적으로 등록·해제합니다. |
| POST /projects/:id/leave | 작업 공간을 이관합니다. 방장은 successor_user_id를 지정합니다. |
| POST /projects/:id/members/:userId/kick | 방장이 해당 멤버의 작업 공간을 이관합니다. |
| POST /reports | reason_code·detail과 정확히 한 대상 ID를 받습니다. block_target=true이면 사용자 차단도 처리합니다. |
| POST /posts | body를 받아 작성자·생성 시각을 포함한 게시글을 생성합니다. |
| GET /feed | limit·cursor를 받아 created_at·UUID 내림차순의 items와 next_cursor를 반환합니다. 현재 차단·삭제 상태를 매 요청에서 확인합니다. |
| DELETE /posts/:id | 작성자만 게시글을 삭제합니다. PATCH 수정 경로는 지원하지 않습니다. |
| GET /posts/:id | 현재 차단·삭제 상태를 확인하고 게시글을 반환합니다. |
| PUT·DELETE /posts/:id/likes | 현재 접근 권한으로 자신의 좋아요를 멱등 등록·해제합니다. PUT은 id·post_id·user_id를 반환합니다. |
| GET·POST /posts/:id/comments | 현재 접근 권한으로 댓글을 조회·작성합니다. 댓글은 id·post_id·author_id·body를 포함합니다. |
| DELETE /post-comments/:id | 현재 게시글 접근 권한을 가진 댓글 작성자만 삭제합니다. |
| GET /admin/reports | 서버의 UUID 허용 목록과 현재 인증을 확인한 운영자만 신고 목록을 조회합니다. status로 필터합니다. 일반 사용자는 403입니다. |
| GET /admin/reports/:id | 운영자에게 허용 필드만 포함한 접수 당시 텍스트 증거와 수정 불가 조치 이력을 반환합니다. |
| POST /admin/reports/:id/actions | 운영자만 operation_id·action_code·reason·expected_status로 review·close·hide_post 조치를 수행합니다. 201과 조치 이력을 반환합니다. |

이관 요청은 operation_id, workspace_id와 expected_version을 포함합니다. 이관 응답은 이력의 id, 작업 공간, 변경 전후 프로젝트·참여 기간과 workspace_version을 반환합니다. 반복 요청은 같은 입력과 같은 결과를 사용합니다. 다른 입력의 작업 식별자 재사용은 409입니다.

카운터와 타이머의 expected_version은 해당 작업 공간의 version입니다. 이전 상태의 명령은 409입니다. 증가·감소는 version 없이 원자적으로 반영합니다. 같은 operation_id와 같은 입력은 저장한 동일 응답을 반환합니다. 다른 입력의 식별자 재사용은 409입니다. 타이머 종료 재시도는 같은 기록을 반환하며 기록을 추가 생성하지 않습니다.

게시글과 게시글 댓글의 author_name은 서버가 현재 작성자 상태에서 생성합니다. 탈퇴 후에도 콘텐츠와 작성자 식별자를 보존하지만 표시 이름은 `탈퇴한 사용자`입니다. 운영 신고 조치는 실행 주체·사유·결과를 저장합니다. 신고 대상의 상태 변경과 삭제는 접수 당시 증거를 변경하지 않습니다. 조치 이력의 수정·삭제 API는 제공하지 않습니다.

## 요구사항 추적

| 테스트 함수 접미어 | 기준 | 검증 대상 |
|---|---|---|
| registration | V1-101~104, V1-108 | 가입, 중복 고유값, 동의 버전·시각, 로그인 ID 비공개 |
| auth_session | V1-105~106, V1-109 | 계정 존재 비노출, 토큰 갱신과 로그아웃 후 갱신 거부 |
| account_withdrawal | V1-110 | 탈퇴 후 로그인·접근·갱신 거부 |
| account_validation | 확정 정책 6.3 | 3~32자 식별자·정규화·15~128자 비밀번호·Unicode·공백 원문 보존 |
| password_recovery | V1-107, 확정 정책 6.3 | 복구 코드 단회 사용·재발급·동시 사용·기존 토큰 무효화 |
| policy_reconsent | 확정 정책 6.3 | 현재 문서 재동의·동의 시각 보존·유효하지 않은 문서 거부 |
| versioning | API-VER-001~005 | 업무 v1·버전 누락·미지원 버전 404·기존 모니터 경로 |
| profile | V1-201~203, V1-206 | 공개 범위, 공개 ID, 소개와 감사 컬럼 입력 거부 |
| anonymous_access | DB-FK-004 | 인증 없는 조회와 생성 거부 |
| cross_friend_request | V1-301~302, V1-305~306 | 검색, 배지, 반대 방향 수락, 친구 해제 |
| friend_request_authority | V1-303~304 | 수락·거절·취소 권한, 처리 이력과 자기 요청 거부 |
| concurrent_friend_requests | DB-FK-006, DB-DS-004 | 동시 생성의 대기 요청 중복 방지 |
| directional_blocks | V1-902~903 | 비공동 프로젝트 사용자의 양방향 숨김과 방향별 해제 |
| shared_project_blocks | 확정 정책 6.1 | 공동 프로젝트 안의 차단 우선·댓글·반응·진행상황 숨김·제3자 초대와 참여 보존 |
| block_request_cleanup | 확정 정책 6.1 | 차단한 사용자 대기 친구 요청 종료·제3자 요청 보존·차단 해제 후 미복구 |
| project_defaults | V1-401~405, DB-DS-001 | 방장, 멤버십, 개인 작업 공간, 기본 카운터와 비공개 접근 |
| project_invitation_atomicity | V1-403, V1-502~503, DB-FK-005 | 거부된 생성 요청의 잔여 데이터 부재, 생성 초대와 취소 |
| concurrent_invitation_acceptance | V1-501~504, V1-406, DB-FK-006 | 동시 수락 중복 방지와 프로필 공개 범위의 권한 분리 |
| owner_transfer | V1-407, V1-505 | 유효한 후임과 단일 방장 기준 |
| project_member_limit | 확정 정책 6.2 | 동시 초대 수락의 20명 상한과 거부된 참여의 잔여 데이터 부재 |
| workspace_state | V1-408, DB-DS-001 | 상태·종료 시각 일치와 done 입력 거부 |
| counter_integrity | V1-703, V1-705, V1-707 | 음수 금지, 동시 증가, 목표 초과와 초기화 |
| counter_collection | V1-704·706, 확정 정책 6.2 | 추가·삭제·표시 여부·순서·기대 version |
| server_timer | V1-701~702, 확정 정책 6.2 | 단일 실행·기기 간 이어하기·일시정지·재개·종료 기록 멱등성·done 충돌 |
| paused_timer_done | 확정 정책 6.2 | 일시정지한 미완료 타이머의 done 거부·거부 시 상태 보존·종료 후 완료 허용 |
| workspace_ownership | V1-405, V1-407, DB-FK-004 | 개인 설정·카운터 소유권과 상태 필터 |
| record_sources | V1-204~205, V1-601~603, V1-605 | 완료 시간 입력, 총 시간과 비차단 프로필 접근 |
| record_authority | V1-604의 작성자 조건, V1-409, DB-FK-004 | active 상태의 작성자 권한과 삭제 부모 접근 거부 |
| done_record_changes | V1-604, 확정 정책 6.2 | done 기존 기록 수정·삭제와 총 시간·version 갱신 |
| record_interactions | V1-606~607의 비차단 조건 | 댓글 삭제 권한과 반응 중복 방지 |
| leave_preserves_data | V1-507, DB-DS-002, 확정 정책 6.1 | 이관 데이터·진행 중 타이머 식별자·작성자 보존과 재시도 |
| transfer_running_timer | V1-701, 확정 정책 6.1 | 실행 타이머 이관·식별자와 소유자 보존·이전 멤버 접근 거부 |
| rejoin_and_leave | DB-DS-001~002 | 새 참여 기간, 반복 나가기와 이전 개인 공간 보존 |
| kick_authority | V1-506 | 방장 추방 권한과 개인 소유권 보존 |
| owner_leave_atomicity | V1-505~507, DB-FK-005 | 후임 검증과 방장 양도·이관의 결합 |
| transfer_comment_race | DB-FK-006, DB-DS-002 | 동시 댓글과 이관의 권한·변경 번호 보호 |
| report_target | V1-901, DB-DS-005의 대상 조건 | 단일 대상, 거부 요청의 차단 부작용 부재와 선택적 차단 |
| feed_cursor | V1-801~802, 확정 정책 6.4 | 생성·작성 시각과 UUID 순서·중복 페이지 방지·비공개 프로필 게시글 노출 |
| post_interactions | V1-208·804~805 | 비공개 프로필 게시글·좋아요 중복 방지·댓글 작성자 권한·차단 우선 |
| feed_current_block | V1-801·902 | 기존 커서 요청에 현재 차단 상태 적용·제3자 게시글 보존 |
| post_parent_deletion | V1-803~805 | 게시글 삭제 뒤 조회·댓글·좋아요 거부 |
| withdrawn_author_display | 확정 정책 6.3 | 탈퇴 후 게시글·댓글·피드 보존과 작성자 표시 익명화 |
| report_operator_authority | 확정 정책 6.4 | 일반 사용자 신고 목록·증거·조치 거부 |
| report_operator_workflow | 확정 정책 6.4, DB-DS-005 | 승인한 운영자 검토·숨김·종결·조치 멱등성·텍스트 증거 불변 |

테스트 파일은 [API 테스트 디렉터리](../packages/backend/test/features/api/knittinglog)에 있습니다. 각 함수는 자신의 API 데이터로 선행 조건을 준비합니다. 빈 결과만 확인하고 선행 조건 없이 통과시키는 테스트는 작성하지 않습니다.

## 보류한 범위

| 범위 | 보류 이유 |
|---|---|
| V1-209 프로필 메뉴·V1-508 프로필 이동 | UI 동작과 API 책임이 분리되지 않았습니다. |
| DB-DS-003 콘텐츠 복구·역이관 | 신고 운영자 인증과 콘텐츠 복구 승인은 다릅니다. 복구 승인·실행 API가 없습니다. 일반 사용자 복구 API를 임의로 만들지 않습니다. |
| 운영자 화면·사용자 제재 | 이 작업은 제한된 운영자 API만 구현합니다. 화면과 계정 정지·자동 제재는 구현 범위가 아닙니다. |
| 정책 본문 불변·파일 복구 | 정책 운영 조회와 파일 API가 없습니다. 작성 응답만으로 보존을 검증하지 않습니다. |
| 이관 중간 단계 실패의 실제 롤백 | 결정적인 오류 주입 수단과 격리 DB 검증이 필요합니다. 입력 거부 테스트를 중간 실패 롤백 증거로 대체하지 않습니다. |
| 실제 백업 복원 | API 응답과 DB 제약 검사만으로 백업의 동작을 증명하지 않습니다. 별도 복원 검증이 필요합니다. |

DB CHECK와 부분 고유 인덱스는 별도의 실제 PostgreSQL 통합 검사로 통과했습니다. 실행 대상과 롤백 결과는 [구현 검증 기록](implementation-validation.md)에 있습니다. HTTP 테스트의 증거와 구분합니다.

## 현재 증거

2026-10-10 확인 결과:

- 기존 API 테스트 9개 파일의 테스트 함수 40개를 보존했습니다. 작성자 표시·운영 신고·일시정지 타이머 검증을 추가해 현재 10개 파일에 테스트 함수 44개가 있습니다. 함수 이름의 중복이 없고 모든 함수가 위 추적 표에 있습니다.
- API 테스트와 도우미·진입점만 포함한 임시 설정으로 타입 검사와 컴파일을 통과했습니다. 생성한 JavaScript에 typia 응답 검증 함수가 포함됩니다.
- 전체 test/tsconfig.json 검사는 SocialProvider.ts의 비교 함수 없는 sort 호출로 한 차례 실패했습니다. 해당 코드 수정 뒤 설치된 `./node_modules/.bin/ttsc -p test/tsconfig.json --noEmit`은 통과했습니다. 설정을 변경하거나 pnpm 서명 검증을 우회하지 않았습니다.
- 문서 링크·코드 블록과 git diff --check 검사를 통과했습니다.

조정자는 새 격리 PostgreSQL과 연결 대상을 확인했습니다. 구현 전 서버의 `/monitors/health`는 200, `/api/v1/policy-documents`는 404를 반환했습니다. 이 HTTP 응답은 정상 응답 200을 요구하는 업무 계약의 RED입니다. 초기 임시 설정에서 실행한 39개 테스트의 실패에는 typia 변환 문제가 포함됩니다. 해당 실행을 39개 기능의 유효한 RED로 계산하지 않습니다.

실제 test/tsconfig.json의 변환을 사용한 구현 전 기준 실행에서는 44개 중 43개가 HTTP 계약 불일치로 실패했습니다. 운영자 워크플로 1개는 승인한 세션 fixture가 없어 BLOCKED였습니다. BLOCKED를 기능 RED나 통과로 계산하지 않습니다.

작성자 표시와 기본 운영 권한 테스트는 실제 test/tsconfig.json을 사용해 컴파일했습니다. typia 검증 코드의 생성도 확인했습니다. 승인된 격리 로컬 API에서 withdrawn_author_display는 응답 계약 불일치, report_operator_authority는 상태 코드 불일치로 실패했습니다. 실행기는 종료 코드 1을 반환했습니다. 이 두 실행은 기능 RED입니다. 첫 샌드박스 시도의 EPERM은 기능 실패로 계산하지 않았습니다.

구현 후 조정자는 격리 DB에 연결한 실제 Nest 서버를 프로세스 안에서 시작했습니다. 실제 가입 API로 운영자 fixture를 생성했습니다. 운영자 허용 목록과 토큰은 해당 프로세스의 메모리에서만 사용했습니다. HTTP 테스트 44개가 모두 통과했습니다. 실패와 BLOCKED는 0개이고 실행기는 종료 코드 0을 반환했습니다. 운영자 검토·숨김·종결·재시도와 텍스트 증거 불변도 이 실행에 포함됩니다.

중간에 발견한 시각 오프셋·일시정지 타이머·거부된 재동의 상태 변경은 실제 실패를 확인한 뒤 수정했습니다. 명령과 세부 결과의 단일 기록은 [구현 검증 기록](implementation-validation.md)에서 관리합니다. 이 문서에는 결과만 요약합니다. 실제 DB 제약·백업·파일 복원과 운영 수용은 HTTP 테스트 결과와 구분합니다. 타입 검사와 HTTP GREEN만으로 운영 복구 수용을 주장하지 않습니다.
