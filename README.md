# 뜨개로그 백엔드

뜨개로그 모바일 앱의 서버 기반 이전을 준비하는 로컬 작업 공간입니다.

## 문서

- [요구사항](docs/requirements.md)
- [구현 현황과 추가 작업 명세](docs/implementation-status.md)
- [복구·파일·분산 인증 제한 구현 범위](docs/backend-completion-plan.md)
- [복구와 파일 수명주기 실행 경계](docs/backend-maintenance.md)
- [구현 검증 기록](docs/implementation-validation.md)
- [미결 사항](docs/open-questions.md)
- [초기 기반 코드 검증 이력](docs/verification.md)
- [기반 코드 기준](docs/template-baseline.md)
- [SDK 절차](docs/sdk-procedure.md)

요구사항 출처는 기능정의서 14쪽과 사용자가 확정한 추가 정책입니다. 기능 ID는 64개입니다. ID 64개를 API 64개로 해석하지 않습니다. 업무 정책은 요구사항 문서가 소유합니다. 적용된 구현과 남은 작업은 구현 현황 문서가 소유합니다.

현재 실행 모드는 `LOCAL_ONLY`입니다. 업무 API는 `/api/v1`을 사용합니다. 계정·프로젝트 등 업무 SDK를 생성하며 내 참여 이력 조회는 `AccountController`가 담당합니다. SDK 호출은 `api.functional.api.v1.users.me.memberships(connection)`입니다.

2026-10-11의 최근 로컬 검사에서 lint·빌드·단위 검사 8개 파일·HTTP 검사 44개가 통과했습니다. Evidence 경고 16개와 빌드 성능 경고 1개는 남아 있습니다. 코드 게시 결과는 Git 이력과 원격 브랜치로 확인합니다. 원격 CI와 운영 수용을 로컬 검사 결과로 대신하지 않습니다.

PDF 원본은 저장소 산출물에서 제외합니다. npm 발행, 앱 수정, 배포는 수행하지 않습니다. DB 작업은 폐기 가능한 로컬 전용 DB에서만 수행합니다.
