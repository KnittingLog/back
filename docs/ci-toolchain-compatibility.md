# CI 도구 체인 호환성

## 실패와 원인

PR #7의 원격 실행 `38008365141`는 Typia 15.1.0과 ttsc 0.21.0으로 빌드한 뒤 실제 서버 시작에서 실패했습니다. `MyGlobal`의 환경 타입 검사에 변환이 적용되지 않았습니다. 로컬에서 같은 오류를 재현했습니다.

ttsc만 0.30.4로 변경해도 같은 런타임 오류가 발생했습니다. Nestia 14.0.3을 함께 설치하면 Typia 15.1.0의 `basic.d.ts` 호출 위치를 변환 대상으로 처리하지 못하는 진단이 발생했습니다. 프로젝트에 `declare module "typia"`는 추가하지 않았습니다.

공식 배포한 Nestia 14.0.3의 peer 요구사항은 Typia 15.0.0입니다. 사용자는 Nestia도 함께 메이저 업그레이드하여 검증하는 방향을 선택했습니다.

## 확정 버전과 검사 정책

| 대상 | 버전 |
|---|---|
| Nestia CLI·core·SDK·fetcher·e2e·benchmark | 14.0.3 |
| Typia | 15.0.0 |
| ttsc·lint·paths·unplugin | 0.30.4 |

카탈로그와 잠금 파일을 함께 갱신했습니다. NestJS, Prisma, TypeScript와 Rolldown의 기존 선택은 유지했습니다. 최종 설치에서는 Nestia·Typia peer 불일치 경고가 없습니다.

생성 SDK와 Prisma 코드의 기존 lint 제외 정책을 루트 설정에서 공유합니다. backend가 API를 참조할 때도 같은 정책을 적용합니다. 일반 구현·테스트의 lint 규칙은 끄지 않습니다. 타입 검사와 런타임 변환 검사도 유지합니다.

회귀 검사는 정상값의 `assert`, 잘못된 값의 `is`와 `TypeGuardError` 거부를 실제로 실행합니다. 변환이 없는 상태를 통과로 처리하지 않습니다.

## 검증 범위

`LOCAL_ONLY`, MacBook Air, Node.js 26.0.0, 설치된 pnpm 10.32.1에서 검사했습니다. 프로젝트의 `packageManager` 10.10.0은 유지했습니다. 기존 로컬 컴파일러 캐시를 명시하여 재사용했습니다.

합성 환경 설정만 사용했습니다. PostgreSQL URL은 loopback의 연결 불가 포트입니다. 실제 환경 파일과 기존 DB는 사용하지 않았습니다. DB 초기화와 마이그레이션 폴더 삭제를 포함하는 `pnpm test` 대신 같은 `ttsx` 실행 명령을 직접 사용했습니다.

- frozen·ignore-scripts·offline 설치를 확인했습니다.
- Prisma 클라이언트·ERD, Nestia SDK·OpenAPI를 생성했습니다. 추적 중인 생성 결과는 바뀌지 않았습니다.
- backend 컴파일, 전체 테스트 타입 검사, API 컴파일과 Rolldown 번들을 검사했습니다.
- DB 없는 실제 모니터 2개와 Typia 회귀 검사 1개가 통과했습니다.
- sourcemap 경고는 남아 있습니다. sourcemap 정확성을 수용한 결과가 아닙니다.

원격 CI의 Node.js 24 결과는 로컬 결과와 별도로 확인합니다. 이 검증은 전체 업무 API, 기존 DB 이행, 배포와 운영 수용을 뜻하지 않습니다.
