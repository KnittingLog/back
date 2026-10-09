# 검증 기록

## 현재 상태

- 원격 기준 브랜치는 main입니다. 변경은 knittinglog-public 작업 브랜치에 반영합니다.
- GitHub Actions의 이전 실행은 MyGlobal 환경 검증에 필요한 값이 빠져 실패했습니다. 전체 CI 전용 기본값을 추가했습니다. 새 실행 결과를 아래에 기록합니다.
- install의 prepare/build:prisma가 만드는 ERD는 원본 샘플 모델의 산출물입니다.
- SDK는 로컬 tarball로 검증합니다. npm 발행, front 수정, 배포는 하지 않습니다.
- Expo SDK 57 소비자 검증은 타입 검사와 Metro 번들 범위입니다. 실제 디바이스 실행은 검증하지 않습니다.
- 추적 파일에 비밀값을 저장하지 않습니다. 테스트는 전용 폐기 가능 DB에서만 수행합니다.

## 실행 기록

## 작업 위치

`work/KnittingLog-back` (현재 VS Code에서 열어야 함)

## 수행 결과

| 항목 | 결과 | 증거·제한 |
|---|---|---|
| 대상 저장소 상태 및 main 읽기 | 차단 | 셸 `git ls-remote`에서 `Could not resolve host: github.com`; 원격 상태를 재확인하지 못함 |
| 원본 기준 커밋 가져오기 | 차단 | GitHub 접속 불가 |
| VS Code 실행 | 성공 | VS Code 앱 확인. `code` CLI는 PATH에 없음 |
| Library PDF materialize | 차단 | 정식 prepare_materialize 호출 후 반환 URL 다운로드가 실패. 갱신 URL로 한 번 재시도했으나 같은 오류 |
| PDF 내용 읽기 | 성공 | 14쪽 텍스트 확인. PDF 7, 9, 10쪽 이미지 렌더로 상태 전이, 모델 표, 권한 표·관계도 확인 |
| 설치 / build / lint / test build / Prisma validate / SDK build·pack | 미수행 | 원본 스크립트와 DB 가드를 확인할 소스가 없어 안전하게 실행할 수 없음 |
| Expo SDK 소비자 검사 | 범위 제외 | 2026-10-09 사용자 지시. Nestia 범위 밖이며 Expo 프로젝트·도구를 만들거나 설치하지 않았습니다. |
| 원격 push | 미수행 | 저장소 접근 불가. npm 발행·프론트 수정·배포도 미수행 |

## 안전 조건

`test`와 `benchmark`는 reset=false여도 마이그레이션을 삭제할 수 있습니다. reset은 DB를 초기화합니다. 원본 스크립트를 읽고 폐기 가능한 로컬 전용 DB임을 확인하기 전에는 실행하지 않습니다. `install` 중 prepare/build:prisma가 생성하는 ERD는 원본 샘플 산출물일 수 있습니다. 추적되는 `.env`에 실제 비밀값을 저장하지 않습니다.

## 재현 절차

1. GitHub 연결이 복구되면 빈 대상 저장소가 여전히 `main`인지 읽기 전용으로 확인합니다.
2. 고정 원본 커밋을 로컬로 가져옵니다. 원격 변경은 별도 검토 후에만 수행합니다.
3. 원본 스크립트, `.env` 예시, CI, 라이선스, Prisma 설정을 검토합니다.
4. 전용 로컬 DB를 준비하고 설치 및 검증 명령을 순서대로 실행합니다.
5. SDK를 생성하고 빌드한 뒤 `pnpm pack`으로 tarball을 만듭니다. pnpm 10.10.0에서 `pack --dry-run`을 쓰지 않습니다.
6. tarball 파일 목록·exports·types·워크스페이스 `catalog:` 치환·비밀값·서버 코드 부재를 확인합니다.
7. Tarball의 package exports, types, 의존성, 파일 목록을 확인하고 Node.js ESM import를 검증합니다.

## SDK 재현 결과

- `pnpm --dir packages/backend build:sdk`가 종료 코드 0을 반환했습니다. Nestia가 컨트롤러 3개, 경로 5개, 라우트 5개를 분석했습니다. SDK와 Swagger 파일을 생성했습니다.
- `pnpm --dir packages/api pack --pack-destination /tmp/knittinglog-api-pack`가 `knittinglog-api-0.1.0.tgz`를 만들었습니다. `--dry-run`은 쓰지 않았습니다.
- Tarball의 `main`, `module`, `types`, `exports` 경로를 확인했습니다. pnpm은 `catalog:` 의존성을 실제 범위 버전으로 바꿔 담았습니다.
- 생성된 SDK의 ESM 진입점을 Node.js에서 불러왔습니다. `HttpError`, `default`, `functional` 내보내기를 확인했습니다.
- Expo·Metro·실기기 검증은 2026-10-09 사용자 지시로 이번 범위에서 제외했습니다. Expo 프로젝트나 도구를 만들거나 설치하지 않았습니다.
- 재현: 저장소 루트에서 위의 `build:sdk` 명령을 실행한 뒤, `packages/api`에서 `pnpm pack --pack-destination /tmp/knittinglog-api-pack`을 실행합니다. Tarball은 로컬 임시 폴더에만 저장했습니다.
- Library에서 PDF 14쪽의 텍스트를 읽었습니다. p7 표와 p10 관계 설명의 추출 텍스트를 대조했습니다. p7·p10 이미지 자산은 픽셀 데이터 대신 참조 포인터로만 반환되어 실제 도형·표 배치는 확인하지 못했습니다.


## 전체 백엔드 빌드 재검증

- 첫 전체 빌드는 POSTGRES_URL 누락으로 build:prisma에서 종료 코드 1을 반환했습니다. Prisma 설정이 해당 변수를 요구했습니다.
- 로컬 전용 Docker Compose PostgreSQL이 healthy 상태임을 확인했습니다. 추적되지 않는 .env를 불러오고 URL을 프로세스에만 전달했습니다. 비밀값은 출력하지 않았습니다.
- 전체 빌드 재실행은 Prisma generate, Nestia SDK·Swagger 생성, ttsc main을 마치고 종료 코드 0을 반환했습니다.
- build:main 단독 재실행도 종료 코드 0을 반환했습니다. 이전 무출력 구간은 실패가 아니었습니다.
- 원본 커밋의 추적된 packages/backend/.env에는 비밀값으로 보이는 값이 있어 공개 이력에 포함하지 않습니다. .env.example은 안전한 자리표시자만 사용합니다. 이 이유로 대상 저장소에는 원본 SHA를 부모로 하는 커밋 대신 깨끗한 루트 스냅샷을 게시합니다. 기준 코드는 52f7070a4ad43a60cfd59262ae89543331bce308입니다.
