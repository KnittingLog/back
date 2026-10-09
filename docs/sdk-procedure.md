# 샘플 API SDK 절차

## 범위

원본 `packages/api`를 유지합니다. 이번 패키지는 샘플 API SDK입니다. 회원·프로젝트 SDK는 실제 기능 API가 만들어진 뒤에 진행합니다. `@knittinglog/api`는 제안 이름입니다. 실제 npm scope와 공개 범위는 미정입니다. 이 절차는 SDK를 빌드하고 pack 결과를 검증하는 내용이며 npm 발행을 포함하지 않습니다.

## 절차

1. [Nestia SDK 문서](https://nestia.io/docs/sdk/)의 생성 절차와 [배포 문서](https://nestia.io/docs/sdk/distribute/)를 확인합니다.
2. 원본 `package.json`, `pnpm-workspace.yaml`, lockfile, SDK 생성 스크립트를 읽습니다. 사용자 요구상 스크립트를 읽기 전에 명령을 실행하지 않습니다.
3. `packages/api` SDK 생성 스크립트를 실행합니다. 생성 결과의 package exports, types, 파일 경로를 확인합니다.
4. SDK 빌드를 실행합니다. build 성공 여부와 출력 디렉터리를 기록합니다.
5. `pnpm pack`으로 tarball을 만듭니다. pnpm 10.10.0에서는 `pack --dry-run`을 사용하지 않습니다.
6. tarball 목록을 확인합니다. 선언된 exports와 types 경로가 실제 tarball 안에 있어야 합니다.
7. Tarball의 package.json과 파일 목록을 검사합니다. 비밀값과 서버 코드가 없어야 합니다.
8. Node.js ESM import로 패키지 진입점과 기능 네임스페이스를 확인합니다.
9. tarball에 비밀값, `.env`, 인증 자료, 서버 구현 코드가 포함되지 않았는지 확인합니다.

## 중단 조건

이 저장소에서 원본이 아직 내려받히지 않아 실제 스크립트와 패키지 설정을 확인하지 못했습니다. 아래 실행 명령은 성공했다고 주장하지 않습니다. 실제 공개 이름과 scope도 승인되지 않았습니다. SDK pack과 소비자 테스트는 원본 복구 후 수행해야 합니다.
