# 로컬 ttsc 캐시

## 결과와 범위

2026-10-10에 `LOCAL_ONLY`로 확인했다.
실행 호스트는 `luke-choiui-MacBookAir.local`이다.
아래 성능 측정 당시 작업 공간은 `/Users/luke/Documents/Codex/2026-10-09/task/work/KnittingLog-back`이었다.
2026-10-10에 프로젝트를 `/Users/luke/Projects/KnittingLog-back`으로 이동했다.
현재 MCP 설정은 새 작업 공간과 그 안의 `.cache/ttsc`를 사용한다. 기존 캐시는 보존한다.
이동 전 측정값을 새 경로에서 측정한 결과로 해석하지 않는다.

최종 도구 체인은 `ttsc`, `@ttsc/graph`, `@ttsc/evidence`, `@ttsc/lint`, `@ttsc/paths`, `@ttsc/unplugin`을 모두 `0.30.4`로 고정한다.
프로젝트 Nestia `12.1.0`, Typia `14.0.2`, TypeScript `7.0.2`는 유지했다.
0.31.0에서 발견한 `ttsx` 호환성 문제는 공식 배포된 0.30.4로 해결했다. 검증이나 플러그인을 우회하지 않았다.

최초 0.31.0 조사에서 변경 없는 실행마다 플러그인을 다시 빌드하는 현상은 재현하지 못했다.
변경 전 noEmit 검사 두 번은 이미 캐시를 재사용했다.
이번 변경은 설치 디렉터리 밖에 캐시를 유지하는 조치이다. 기존 warm 실행보다 빨라졌다고 주장하지 않는다.

`building source plugin`은 실제 Go 빌드를 시작하는 안내이다. 이 문구 자체는 컴파일 오류가 아니다.
Go 객체가 warm이어도 새 플러그인 바이너리의 구성·링크·게시 비용은 남는다.
공식 [빌드 캐시 설명](https://ttsc.dev/docs/ttsc/cache/)과 설치된 `ttsc@0.31.0`의 구현을 함께 확인했다.

## 실행 방법

기존 패키지 스크립트의 `ttsc`, `ttsx`, 그래프·Rolldown·Nestia 실행에 `scripts/ttsc-cache.cjs`를 적용했다.
루트 `check:graph`도 같은 환경을 두 MCP 자식 서버에 전달한다.

```sh
pnpm check:evidence
pnpm -C packages/backend lint
pnpm -C packages/api lint
pnpm check:graph
pnpm -C packages/backend ttsc cache paths --json
pnpm -C packages/backend ttsc -p test/tsconfig.json --noEmit
pnpm -C packages/backend ttsx --project test/tsconfig.json <실행할-ts-파일>
```

새 설치에서 native 빌드가 MCP의 120초 제한보다 길 수 있다.
이 경우 MCP를 연결하기 전에 아래 CLI 준비 명령으로 정상 플러그인 빌드를 완료한다. DB나 SDK 생성 명령이 아니다.

```sh
pnpm -C packages/backend ttsc prepare -p test/tsconfig.json
pnpm -C packages/api ttsc prepare -p tsconfig.json
```

마지막 명령은 실행 방법만 나타낸다. 임의 서비스·DB 스크립트 실행을 승인하는 명령은 아니다.
기존 DB·스키마·SDK·벤치마크 명령의 동작이나 안전 조건을 바꾸지 않았다. 이번 검증에서는 실행하지 않았다.

API `build:rolldown`은 같은 런처로 `rolldown -c`를 실행한다.
backend `build:sdk`는 기존 삭제·exports 확인·Nestia·exports 확인 순서를 유지하고 Nestia 호출만 감쌌다.
backend `build:swagger`도 같은 Nestia 런처를 사용한다. 두 생성 스크립트는 실행하지 않았다.
설치된 `package.json`의 `bin`에서 Rolldown `1.2.3`의 `./bin/cli.mjs`, Nestia `12.1.0`의 `./bin/index.js`를 확인했다.
런처는 이 메타데이터를 매번 해석한다. 검증하지 않은 실행 파일 경로를 고정하지 않는다.

기본 경로는 다음과 같다. `<root>`는 위 작업 공간이다.

| 항목 | 경로 |
|---|---|
| 공통 캐시 | `<root>/.cache/ttsc` |
| 소스 플러그인 바이너리 | `<root>/.cache/ttsc/plugins/<key>/plugin` |
| Go 객체 | `<root>/.cache/ttsc/go-build` |
| 기존 기본 캐시 | `<root>/node_modules/.cache/ttsc` |

런처는 `TTSC_CACHE_DIR`가 비어 있을 때만 절대 기본 경로를 설정한다.
호출자가 지정한 `TTSC_CACHE_DIR`, `TTSC_GO_CACHE_DIR`, `GOCACHE`, Go 바이너리·빌드 변수와 CLI 인자는 보존한다.
Go 캐시 선택 순서는 `TTSC_GO_CACHE_DIR`, `GOCACHE`, 선택된 ttsc 루트의 `go-build`이다.
상대 환경변수 경로와 `--cache-dir`의 해석은 원래 ttsc에 맡긴다.
작업 디렉터리, 표준 입출력, 종료 코드와 SIGINT·SIGTERM도 전달한다.

`pnpm exec ttsc`, `pnpm exec ttsx`와 직접 Node 실행은 런처를 거치지 않는다.
이 경로에는 절대 `TTSC_CACHE_DIR`를 직접 설정하거나 위의 `pnpm ... ttsc/ttsx` 스크립트를 사용한다.
전역 셸·에디터 설정은 변경하지 않았다.

`.codex/config.toml`의 두 그래프 서버는 캐시 환경변수만 추가했다.
MCP 설정은 이 작업 공간의 절대 `TTSC_CACHE_DIR`를 명시하므로 외부 셸의 같은 변수보다 이 프로젝트 설정이 우선한다.
Node 명령, cwd, tsconfig와 서버 이름은 유지했다.
저장소를 이동하면 기존 cwd와 캐시 절대 경로를 함께 변경한다.
이미 실행 중인 MCP 서버는 재시작하지 않았다. 새 설정은 다음 서버 시작부터 적용된다.

추가 조사에서 `check:graph`의 SDK stdio transport가 기본 상속 목록만 전달하는 누락을 확인했다.
최초 런처는 검사 스크립트까지 환경을 전달했지만, SDK가 서버에 `TTSC_CACHE_DIR`를 전달하지 않았다.
이는 ttsc resolver의 환경 처리 오류가 아니었다. 조사 중 잠정 원인 추정은 철회한다.
조정자 승인 후 `scripts/check-ttsc-graph.cjs`의 transport에 필터링한 컴파일러 환경만 추가했다.
`TTSC_*`, `CGO_*`와 명시한 Go·도구 체인 변수 목록을 전달한다.
SDK의 PATH·HOME 등 기본 상속은 유지한다. `/^GO/`처럼 `GOOGLE_*` 비밀값을 포함하는 필터는 사용하지 않는다.
환경값을 로그에 출력하지 않는다. 필터의 허용·거부 동작은 합성 입력으로 별도 검사했다.

## 무효화와 잠금

런처는 바이너리를 직접 선택하거나 캐시 적중을 강제하지 않는다.
설치된 0.30.4가 버전·플랫폼·Go 도구 내용과 빌드 환경·플러그인 소스·오버레이·기여자 소스를 검사한다.
검사 후 같은 키의 바이너리만 채택한다.
근거는 설치된 `lib/plugin/internal/buildSourcePlugin.js`의 `computeCacheKey`, `buildSourcePlugin`, `resolveSourceBuildCachePaths`이다.
공식 [캐시 키 설명](https://ttsc.dev/docs/development/reference/architecture/)도 확인했다.

| 변경 | 유지하는 동작 |
|---|---|
| ttsc·TypeScript 버전, Go 도구 내용, 플랫폼·Go 빌드 환경 | 변경된 내부 키로 바이너리를 다시 빌드한다 |
| 플러그인·오버레이·기여자 소스 | 변경된 소스 키로 다시 빌드한다 |
| lockfile과 설치된 의존성 | 현재 해석한 버전·소스를 검사한다. 실제 입력이 바뀌면 다시 빌드한다 |
| lint·tsconfig·기여자 선택 설정 | 현재 설정을 평가한다. 선택된 구성과 입력 변경을 반영한다 |
| 일반 앱 소스·요구사항 문서 | 검사를 다시 수행한다. Go 플러그인 자체가 같으면 바이너리는 재사용할 수 있다 |

lockfile이나 설정의 모든 바이트 변경이 반드시 Go 링크를 요구하는 것은 아니다.
이 변경은 별도 lockfile-only 키를 추가하지 않는다. 설치된 실제 입력에 대한 ttsc 검증을 보존한다.
무효화 조건은 설치 구현으로 확인했다. 각 조건을 실제 의존성 교체로 시험하지는 않았다.
descriptor·capability 결과도 원래 검증 조건을 따른다. 설정 평가를 없앴다고 주장하지 않는다.

최종 0.30.4는 키별 `.lock.v2/current` 세대를 원자적으로 획득한다.
다른 실행은 게시 결과를 기다린다. 디렉터리 존재만으로 활성 잠금이라고 판단하지 않는다.
0.30.4는 600초 대기 예산이 만료되면 관찰한 세대를 abandoned로 분류하고 retire할 수 있다.
따라서 0.31.0 v3의 활성·불명 소유자 보존 동작과 같다고 주장하지 않는다.
이번 실행은 새 버전 키를 단독으로 빌드했고 이 장시간 경합 경로를 사용하지 않았다.
최종 캐시에는 과거 v3 기록과 새 v2 기록이 함께 남는다. 버전별 키와 잠금 프로토콜을 합치지 않는다.
경합·잠금 탈취를 강제로 시험하지 않았다. 활성 잠금을 삭제하지 않았다.
기존 0.21.0 에디터 프로세스와 실행 중인 그래프 서버도 그대로 유지했다.

명시한 캐시 루트는 사용자 소유이므로 기본 캐시의 자동 정리 정책에 의존하지 않는다.
키와 기록은 누적될 수 있다. 이번 작업에서는 캐시 정리나 삭제를 실행하지 않았다.
활성 실행 중에는 `ttsc clean --cache-dir`나 수동 삭제를 수행하지 않는다.

## 이전 0.31.0 측정

별도 프로세스로 순차 실행했다. 시간은 명령 전체의 wall time이며 통계적 성능 비교가 아니다.
backend baseline은 `pnpm -C packages/backend exec ttsc -p test/tsconfig.json --noEmit`이다.
새 캐시 검사는 같은 tsconfig·noEmit 인자를 사용하는 `pnpm check:evidence`이다.
pnpm 스크립트 계층 차이도 시간에 포함된다.

| 검사 | 시간 | 소스 플러그인 빌드 안내 | 결과 |
|---|---:|---:|---|
| 변경 전 backend baseline 1 | 6.883초 | 0 | 성공, Evidence 경고 20개 |
| 변경 전 backend baseline 2 | 4.750초 | 0 | 성공, Evidence 경고 20개 |
| 새 backend 플러그인 캐시 첫 실행 | 21.390초 | 2 | 성공, Evidence 경고 20개 |
| 같은 backend warm 실행 | 5.440초 | 0 | 성공, Evidence 경고 20개 |
| backend 기본 tsconfig noEmit | 10.025초 | 0 | 성공, Evidence 경고 20개 |
| 새 API 플러그인 캐시 첫 실행 | 18.840초 | 2 | 성공 |
| 같은 API warm 실행 | 3.889초 | 0 | 성공 |
| `pnpm check:graph` 1 | 23.882초 | 0 | 두 MCP 초기화·도구 목록·실제 개요 조회 성공 |
| `pnpm check:graph` 2 | 15.260초 | 0 | 같은 그래프 수 확인 |

backend 첫 실행은 `@nestia/core`의 `sdk, linked_000003`와 `@ttsc/lint`의 `evidence` 기여자를 빌드했다.
backend warm 실행에서는 두 바이너리의 SHA-256·크기·mtime이 첫 실행 뒤와 완전히 같았다.
Evidence 경고는 실제 누락 20개이다. 규칙이나 근거 태그는 수정하지 않았다.
그래프는 backend 파일 185개·노드 7,898개·관계 47,699개, API 파일 77개·노드 1,595개·관계 3,618개이다.

기존 캐시는 삭제하지 않았다. 새 플러그인 루트만 빈 상태에서 시작했다.
Go 전체 cold 비용은 측정하지 않았다.
조정자의 명시적 승인으로 기존 Go 객체 1,580개를 `cp -c`로 새 Go 루트에 APFS 복제했다.
파일명은 64자리 hex와 `-a` 또는 `-d`로 제한했다.
잠금·조정 기록·임시 파일·trim 메타데이터는 복사하지 않았다.
기존 Go 캐시의 파일과 경로는 유지했다. 일반 전체 복사로 대체하지 않았다.
복제 대상의 논리 바이트 수는 6,335,423,852이다. 정확한 물리 저장 공간 절감량은 측정하지 않았다.
측정 후 새 Go 루트의 `du -sh`는 5.9G, 플러그인 루트는 134M이다.
이 측정은 Go 객체가 준비된 상태의 플러그인 cold 빌드이다. 개별 Go 객체의 적중률은 측정하지 않았다.

## 이전 0.31.0 설치 후 보존

`pnpm install --frozen-lockfile --ignore-scripts --offline`이 종료 코드 0으로 완료됐다.
설치 전후 소스·설정 파일 219개의 해시와 플러그인 바이너리 4개의 해시·크기·mtime이 같았다.
Go 루트도 유지됐다. SDK·Prisma 생성 스크립트는 실행하지 않았다.
설치 후에도 세 검사가 모두 종료 코드 0이며 빌드 안내가 없었다.

| 설치 후 검사 | 시간 | Evidence 경고 |
|---|---:|---:|
| `pnpm check:evidence` | 5.830초 | 20 |
| `pnpm -C packages/backend lint` | 4.521초 | 20 |
| `pnpm -C packages/api lint` | 3.352초 | 0 |

이 증거는 이번 up-to-date offline 설치의 보존을 확인한다. node_modules 전체 삭제·재설치 실험은 수행하지 않았다.

GitHub Actions의 기존 캐시 단계는 경로 두 줄만 `.cache/ttsc/plugins`, `.cache/ttsc/go-build`로 맞췄다.
사용자의 설치 뒤 복원 순서·pnpm 캐시·키·빌드 단계는 보존했다.
원격 CI는 실행하지 않았다. 이 로컬 결과를 Actions 적중이나 배포 성공으로 해석하지 않는다.

## 0.31.0 런타임 실패 원인

임시 `/tmp/knittinglog-ttsc-cache-WbXpWM/probe.ts`는 문자열 출력만 수행한다.
backend `test/tsconfig.json`과 플러그인을 유지한 채 실행했다.
일반 설치된 0.31.0 `pnpm exec ttsx`와 새 캐시 런처 모두 다음 오류로 종료했다.

```text
ttsc: selected native compiler host @nestia/core does not support required emit provenance
```

baseline은 6.224초, 런처 실행은 6.376초와 4.104초였다. 모두 종료 코드 2이며 빌드 안내는 0회였다.
이 오류는 캐시 경로 변경 없이도 재현됐다. 부모 작업에서 업그레이드한 0.31.0의 호환성 제한이었다.
0.21.0에서도 같은 문제가 있었다고 주장하지 않는다.
검증 우회·플러그인 제외·버전 변경으로 통과시키지 않았다.
이 당시에는 프로그램 실행을 `NOT_VERIFIED`로 남겼다. 최종 0.30.4의 실행 성공은 다음 검증 기록으로 구분한다.
캐시 재사용과 런타임 수용은 다른 결과이다.

공식 npm [0.30.4 메타데이터](https://registry.npmjs.org/ttsc/0.30.4)와 [0.31.0 메타데이터](https://registry.npmjs.org/ttsc/0.31.0)의 배포 소스를 비교했다.
0.31.0 `BuildExecution.buildWithNativeCompilerPlugins`는 ttsx가 요구한 `emitProvenance` capability를 먼저 확인한다.
기존 Nestia native host는 해당 capability와 새 인자를 제공하지 않는다.
0.30.4의 공개 `runBuild`와 `prepareExecution`은 기존 native host 프로토콜로 프로젝트를 검사·빌드·실행한다.
가장 가까운 이전 공식 안정 릴리스이므로 0.25.0까지 더 크게 되돌리거나 Nestia·Typia를 크게 올리지 않았다.
Evidence의 최초 공개 버전은 npm 버전 목록에서 0.25.0으로 확인했다.
이 선택은 0.31.0 provenance 계약을 흉내 내는 패치가 아니다. 검증된 이전 릴리스의 계약을 사용한다.
최신 문서의 모든 보장을 0.30.4에 소급 적용하지 않는다.

새 `patches/@ttsc__lint@0.30.4.patch`는 0.31.0 패치와 내용이 같다.
설치된 Go 소스에서도 infer·매핑 타입을 제외하는 조건을 확인했다.
기존 0.21.0·0.31.0 파일은 보존했다. 설치 뒤 파일이 사라진 것을 관찰했으나 삭제 주체는 확인하지 못했다.
조정자가 제공한 원본과 설치 전 해시로 두 파일의 정확한 바이트를 복원했다.
0.21.0 SHA-256은 `ebc61adc4c1bad43d84c0a9a5ef6058f791491db611102e42d642a72b95aaf72`이다.
0.30.4·0.31.0 SHA-256은 `9ec83150b044f28192b71e03ef3024ca22ecb83fc642957c6dbe9d78a8d63e8b`이다.

## 최종 0.30.4 검증

초기 비교 probe는 `/tmp/knittinglog-compat.yRHxPk/probe.ts`이며 문자열 `ttsx-compat-probe-ok`만 출력한다.
직접 설치된 `ttsx`와 런처 모두 `--project test/tsconfig.json`을 유지한 채 실제 실행했다.
이 외부 파일의 entry-only fallback 결과만으로 owning Program 수용을 주장하지 않는다.
직접 실행에는 같은 절대 `TTSC_CACHE_DIR`만 설정했다. `--no-plugins`나 provenance 우회는 사용하지 않았다.
backend manifest는 lint·Nestia·Typia·paths를 모두 유지했다. Evidence 기여자도 빌드됐다.
capability 기록의 모든 backend·API 바이너리 경로가 `.cache/ttsc/plugins`를 가리키는 것을 확인했다.

| 검사 | 시간 | 빌드 안내 | 결과 |
|---|---:|---:|---|
| 새 버전 ttsx 첫 실행 | 135.949초 | 2 | 종료 0, probe 실제 출력 |
| 직접 설치된 ttsx, warm | 10.048초 | 0 | 종료 0, probe 실제 출력 |
| 런처 ttsx, warm | 8.785초 | 0 | 종료 0, probe 실제 출력 |
| backend 테스트 noEmit warm 1 | 5.045초 | 0 | 종료 0, Evidence 경고 20개 |
| backend 테스트 noEmit warm 2 | 5.076초 | 0 | 종료 0, Evidence 경고 20개 |
| backend 기본 noEmit | 4.080초 | 0 | 종료 0, Evidence 경고 20개 |
| 새 버전 API noEmit 첫 실행 | 47.822초 | 2 | 종료 0 |
| env 누락 상태의 graph 검사 | 123.521초 | 2 | 120초 MCP 요청 timeout, 실패 |
| env 수정 뒤 graph 검사 | 12.943초 | 0 | 두 서버 초기화·도구 목록·실제 개요 조회 성공 |
| API Rolldown | 7.227초 | 0 | 종료 0, `SOURCEMAP_BROKEN` 경고 43개 |

두 backend warm 실행 전후 플러그인 SHA-256·크기·mtime은 모두 같았다.
버전 변경은 정당한 무효화이다. 과거 0.31.0 바이너리를 0.30.4 바이너리로 대체해 사용하지 않았다.
첫 빌드 비용은 이전 측정과 분리한다. Go 객체가 준비됐어도 0.30.4의 source·overlay 빌드 비용은 상당했다.
추가 대량 복사나 캐시 삭제는 하지 않았다. 최종 Go 캐시의 `du -sh` 표시값은 11G, 플러그인은 266M이다.
이 표시값은 APFS 공유 블록과 별도 물리 사용량을 구분하지 않는다.
정확한 물리 사용량·Go 객체 적중률은 측정하지 않았다. 명시 루트의 보관·정리 정책은 여전히 사용자 소유이다.

env 누락 검사는 기본 `node_modules/.cache/ttsc`로 빌드했다. 이를 영속 캐시 성공으로 계산하지 않는다.
timeout 뒤 해당 기본 캐시에 남은 v2 소유자 기록은 수동으로 삭제하거나 retire하지 않았다.
최종 검사는 기존 영속 루트의 검증된 바이너리를 정상 선택했고 MCP timeout을 늘리거나 숨기지 않았다.

최종 그래프는 backend 파일 185개·노드 6,490개·관계 46,113개, API 파일 77개·노드 897개·관계 2,756개이다.
0.31.0과 node·edge 수가 다르다. 이 릴리스의 그래프 표현 차이를 소스 파일 삭제나 동작 동일성의 증거로 해석하지 않는다.

Rolldown `--version`과 Nestia의 지원하지 않는 `__cache_probe__` 명령으로 실제 bin의 환경·cwd·argv를 확인했다.
기본 및 명시 cache/Go 환경 모두 보존됐고, 직접 실행과 stdout·stderr·종료 코드가 같았다.
Nestia probe의 종료 255는 CLI 사용법 오류이며 생성 성공을 뜻하지 않는다. SDK 생성은 실행하지 않았다.
별도 Node 자식에서 SIGINT·SIGTERM 전달과 자식 종료 코드 17 보존도 확인했다.

새 lockfile의 `pnpm install --frozen-lockfile --ignore-scripts --offline`은 종료 0이었다.
설치 전후 플러그인 8개의 SHA-256·크기·mtime과 소스·설정 파일 220개의 해시가 같았다.
설치 후 재검사에서도 모든 명령이 종료 0이며 빌드 안내가 0회였다.

| 설치 후 검사 | 시간 | 추가 결과 |
|---|---:|---|
| `pnpm check:evidence` | 4.178초 | Evidence 경고 20개 |
| backend 기본 noEmit | 2.810초 | Evidence 경고 20개 |
| API noEmit | 2.212초 | 경고 없음 |
| 직접 설치된 ttsx | 6.979초 | probe 실제 출력 |
| 런처 ttsx | 6.324초 | probe 실제 출력 |
| `pnpm check:graph` | 5.447초 | 위 최종 그래프 수와 같음 |
| API Rolldown | 7.417초 | sourcemap 경고 43개 유지 |

최종 owning Program 수용은 조정자가 승인한 단 하나의 임시 `packages/backend/test/cache-compat-probe.ts`로 확인했다.
경로가 없음을 먼저 확인했고 `console.log("ttsx-in-program-probe-ok")`와 `export {}`만 작성했다.
기존 `include: [".", "../src"]`, `rootDir: ".."`인 test tsconfig에 실제 포함되는 파일이다.
설치된 ttsx 직접 실행은 4.542초, 런처 실행은 3.428초였다. 둘 다 종료 0, 빌드 안내 0회, 실제 문자열 출력이었다.
imports·서비스 시작·DB 작업·plugin 제외·entry-only fallback은 사용하지 않았다.
두 실행 뒤 새 파일만 apply_patch로 제거하고 부재를 확인했다. 기존 소스·테스트 159개 파일의 설치 전 해시도 그대로였다.
제거 뒤 noEmit과 두 그래프를 다시 확인했다. 최종 그래프 수는 변하지 않았다.
ttsx 성공은 이 포함된 문자열 probe의 수용이다. DB·서버·SDK 생성이나 전체 테스트 수용을 뜻하지 않는다.
noEmit에서는 Evidence 경고 20개를 계속 관찰했다. ttsx 자체는 이 경고를 출력하지 않았으므로 같은 출력이라고 주장하지 않는다.

최종 실행 파일은 `<root>/node_modules/.pnpm/ttsc@0.30.4/node_modules/ttsc/lib/launcher/{ttsc,ttsx}.js`이다.
네이티브 compiler·graph·Go 도구는 `<root>/node_modules/.pnpm/@ttsc+darwin-arm64@0.30.4/node_modules/@ttsc/darwin-arm64/bin/` 아래의 `ttsc`, `ttscgraph`, `go/bin/go`이다.
Go 버전은 여전히 `go1.26.8 darwin/arm64`이다. Node `v26.0.0`, pnpm `10.10.0`과 이전의 명시 Go 환경 없음도 유지했다.
최종 버전이 선택한 바이너리는 다음과 같다. 과거 0.31.0 키도 같은 루트에 남아 있지만 이번 capability 기록은 아래 네 키만 선택했다.

```text
<root>/.cache/ttsc/plugins/0e6598570a9cd497ea708b6d23f7a080/plugin
<root>/.cache/ttsc/plugins/69132763fa0d3da36565d705552655b8/plugin
<root>/.cache/ttsc/plugins/9aae1fded2a8e42a2e40027d69696f74/plugin
<root>/.cache/ttsc/plugins/bfb15766854094001b9f3fe087c96f73/plugin
```

최종 compiler 환경 필터의 허용 목록은 `scripts/check-ttsc-graph.cjs`가 소유한다.
원시 로그·측정 JSON·설치 전후 바이너리 해시는 `/tmp/knittinglog-compat.yRHxPk`에 있다.
후속 작업의 변경 파일은 `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `packages/backend/package.json`, `packages/api/package.json`, `scripts/ttsc-cache.cjs`, 승인된 `scripts/check-ttsc-graph.cjs`, 새 0.30.4 lint 패치와 두 설정 문서이다.
`git diff --check`와 두 Node 스크립트의 구문 검사가 성공했다.
설치 전 해시와 최종 파일을 비교해 승인 범위 밖의 기존 소스·설정 파일 변경이 없음을 확인했다.
기존 lint 정책·공유 제외 범위·요구사항·스키마·생성 SDK·테스트·.env·workflow·MCP 설정은 유지했다.

## 이전 0.31.0 바이너리와 증거

Node는 `/opt/homebrew/Cellar/node/26.0.0/bin/node` (`v26.0.0`)이다.
pnpm은 `10.10.0`, 플랫폼은 `darwin/arm64`이다.
실제 경로는 다음과 같다. 모든 `<root>`는 처음 기록한 절대 작업 공간이다.

```text
<root>/node_modules/.pnpm/ttsc@0.31.0/node_modules/ttsc/lib/launcher/ttsx.js
<root>/node_modules/.pnpm/@ttsc+darwin-arm64@0.31.0/node_modules/@ttsc/darwin-arm64/bin/ttsc
<root>/node_modules/.pnpm/@ttsc+darwin-arm64@0.31.0/node_modules/@ttsc/darwin-arm64/bin/ttscgraph
<root>/node_modules/.pnpm/@ttsc+darwin-arm64@0.31.0/node_modules/@ttsc/darwin-arm64/bin/go/bin/go
<root>/.cache/ttsc/plugins/c86d8205904fa54a13c924c8734bd7d7/plugin
<root>/.cache/ttsc/plugins/e2c8d0140695166f528237e63341acfa/plugin
<root>/.cache/ttsc/plugins/25e6c34f530cc853aafbff7ef3da1bf3/plugin
<root>/.cache/ttsc/plugins/af1749d2b5f31686fab476d0f07b11a9/plugin
```

Go는 번들 도구 `go1.26.8 darwin/arm64`이다. `TTSC_GO_BINARY`를 고정하거나 바꾸지 않았다.
측정 셸에는 `TTSC_CACHE_DIR`, `TTSC_GO_CACHE_DIR`, `GOCACHE`, `GOOS`, `GOARCH`, `GOFLAGS`, `CGO_ENABLED`의 명시값이 없었다.
런처의 기본 `TTSC_CACHE_DIR` 외에 새로운 Go 환경변수를 주입하지 않았다.
두 서버의 `codex mcp get ... --json`은 새 캐시 환경과 기존 Node·cwd·tsconfig를 확인했다.
현재 대화의 MCP 도구 재로드나 기존 서버의 환경 전환은 검증하지 않았다.
원시 로그와 바이너리 스냅샷은 위 임시 디렉터리에 있다. 장기 결과의 소유자는 이 문서이다.

이번 변경 파일은 `.gitignore`, `.codex/config.toml`, `package.json`, `packages/backend/package.json`, `packages/api/package.json`, `scripts/ttsc-cache.cjs`, `.github/workflows/build.yml`, 이 문서이다.
이 파일 목록은 최초 캐시 작업의 범위이다. 후속 호환성 작업에서는 workflow·gitignore·MCP 설정을 수정하지 않았다.
`node --check scripts/ttsc-cache.cjs`와 `git diff --check`가 성공했다.
런처의 명시 환경변수·cwd 보존, 종료 코드 7 전달, SIGTERM 전달, 지원하지 않는 명령의 종료 코드 2도 별도 Node 검사로 확인했다.
최초 캐시 작업에서는 `pnpm-workspace.yaml`, lockfile, lint 패치와 정책, 앱·테스트·스키마·생성 SDK를 변경하지 않았다.
DB·API·운영 수용·배포·원격 CI는 검증하지 않았다.
