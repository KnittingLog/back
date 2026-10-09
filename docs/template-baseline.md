# 기반 코드 기준

## 기준 출처

- 원본: `https://github.com/samchon/backend`
- 고정 기준 커밋: `52f7070a4ad43a60cfd59262ae89543331bce308`
- 목표 저장소: `https://github.com/KnittingLog/back`, 기본 브랜치 `main`
- 라이선스: 원본 MIT 라이선스와 저작권 고지를 보존해야 합니다.

## 보존 범위

가져올 때 원본 `config`, `packages/api`, `packages/backend`, pnpm workspace 선언, 의존성 잠금 파일, 샘플 모델과 스크립트를 유지합니다. 조직·프로젝트 식별 정보만 뜨개로그 기준으로 바꿉니다. 원본 CI의 `master` 조건은 `main` 조건으로 필요한 부분만 바꿉니다. API SDK 샘플을 유지하며 새 서비스 도메인 모델과 서비스 기능 API는 추가하지 않습니다.

## 차이 기록

현재 이 실행 환경은 GitHub DNS 해석에 실패했습니다. 원본 커밋을 로컬에 받아 파일별 차이를 확인하지 못했습니다. 따라서 실제 파일 변경 목록, CI 차이, 라이선스 고지의 존재 여부는 검증되지 않았습니다. 기준 커밋과의 diff를 만들기 전에는 이 문서를 구현 완료로 보지 않습니다.
