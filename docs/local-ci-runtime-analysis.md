# Local CI Runtime Analysis

기존 영어 분석과 측정값은 캐시 적용 전 기록이다. 새 설정과 검증 결과는 아래 한국어 절에 기록한다.

## Purpose

This document explains the long local CI run for the backend.

The evidence comes from one local `act` run and one GitHub Actions log.

These runs use different dependency trees. Do not compare them as a controlled benchmark.

## Results

| Run | Build time | Test time | Result |
|---|---:|---:|---|
| Local `act` on 2026-10-09 | 7 min 36 sec | 16 sec | Passed |
| GitHub Actions log on 2026-10-09 | About 3 min 29 sec | Not completed | Failed in the test step |

The local run used Docker with `linux/amd64` on macOS.

The GitHub log starts the build at 10:44:08 UTC. The log starts the test step at 10:47:37 UTC.

## Causes

### Architecture emulation

The local runner used an x64 Linux container on macOS.

The Docker process list showed Rosetta processes during the build.

The Go compiler used CPU while it built native `ttsc` plugins.

This evidence indicates that architecture emulation increased local build time.

### Native plugin compilation

`ttsc` builds native plugins for Typia and Nestia.

The GitHub log shows a Typia plugin build from 10:46:33 to 10:47:25 UTC.

The local `ttsc` cache is in `node_modules/.cache/ttsc`.

The local `act` job uses a new container for each run. It does not preserve this cache.

The workflow has no cache step for the `ttsc` plugin cache.

The `ttsc` documentation states that a fresh CI job recompiles plugins unless the cache is persisted.

### Repeated SDK generation

The API build calls `backend build:sdk`.

The backend build also calls `build:sdk`.

The GitHub log shows the Nestia SDK generator twice.

The first run starts at 10:44:08 UTC and ends at about 10:46:32 UTC.

The second run starts at about 10:47:27 UTC and ends at about 10:47:29 UTC.

The second run is short in this log. The build still repeats the generator.

## Actions

1. Persist the `ttsc` plugin cache in GitHub Actions.
2. Restore the cache after `pnpm install`.
3. Use an operating-system and architecture cache key.
4. Keep the Go object cache only if measurements show a benefit.
5. Run SDK generation once in the root build.
6. Keep standalone package builds complete.
7. Measure each build step before and after each change.

The cache is specific to the operating system and architecture.

The cache key must include both values.

The `ttsc` documentation recommends the `plugins` cache as the required cache.

It lists the Go object cache as an optional accelerator.

## 캐시 적용과 검증 (2026-10-09)

### 로컬 빌드

일반 로컬 빌드는 pnpm 저장소와 기본 `ttsc` 캐시를 재사용한다.

API와 backend의 `ttsc cache paths --json` 결과는 같은 workspace 캐시 경로를 가리킨다.

플러그인 경로는 `node_modules/.cache/ttsc/plugins`이다. Go 오브젝트 경로는 `node_modules/.cache/ttsc/go-build`이다.

`.actrc`는 `--cache-server-path=.cache/act`를 지정한다. `.gitignore`는 이 경로를 제외한다.

`act`는 컨테이너를 재사용하지 않아도 이 저장소에서 캐시를 복원한다.

### GitHub Actions

pnpm 설정을 Node 설정보다 먼저 실행한다. 기존 액션 버전은 유지한다.

Node 설정은 `cache: pnpm`과 `cache-dependency-path: pnpm-lock.yaml`을 사용한다.

설치는 `pnpm install --frozen-lockfile`로 실행한다. 설치 후 `actions/cache@v4`가 플러그인과 Go 오브젝트 캐시를 복원한다.

캐시 키는 `${{ runner.os }}-${{ runner.arch }}-ttsc-v1-${{ hashFiles('pnpm-lock.yaml') }}`이다. 복원 접두사는 `${{ runner.os }}-${{ runner.arch }}-ttsc-v1-`이다.

빌드와 테스트는 캐시 적중 여부와 무관하게 실행한다. `ttsx` 임시 출력, 전체 `node_modules`, 앱 빌드 결과물은 컴파일러 캐시에 포함하지 않는다.

### 관측 결과

각 환경에서 같은 의존성과 아키텍처로 두 번 실행했다. 시간은 명령 또는 액션 단계의 전체 실행 시간이다.

| 환경 | 실행 | 설치 | 빌드 | 플러그인 재컴파일 로그 |
|---|---|---:|---:|---:|
| 일반 로컬 | 첫 실행 | 20.0초 | 183.1초 | 2개 |
| 일반 로컬 | 캐시 재사용 | 2.2초 | 13.0초 | 0개 |
| 로컬 `act` | 첫 실행 | 33.7초 | 632.7초 | 2개 |
| 로컬 `act` | 새 컨테이너에서 복원 | 14.8초 | 63.4초 | 0개 |

첫 `act` 실행은 pnpm 캐시와 컴파일러 캐시를 저장했다. 두 번째 실행은 두 캐시의 복원과 `cache-hit=true`를 확인했다.

컴파일러 아카이브의 1,999개 항목은 `plugins`와 `go-build` 안에만 있었다. 액션이 표시한 압축 크기는 약 429 MB였다.

DB 초기화 없는 모니터 테스트 2개는 두 환경에서 각각 두 번 통과했다. 명령은 `pnpm test --reset false --simultaneous 16`이었다.

일반 로컬 테스트는 두 빌드 후 별도로 실행했다. 실행 시간은 16.2초와 13.6초였다. `act` 테스트 단계는 14.9초와 16.6초였다.

### 검증 범위

일반 로컬은 macOS arm64였다. `act` 컨테이너는 Linux x64 에뮬레이션이었다. 두 환경은 Node `v26.0.0`과 pnpm `10.10.0`을 사용했다.

격리된 `act` runner에는 로컬과 같은 Node 바이너리를 제공했다. 기존 이미지의 Node 18과 20은 현재 `ttsx`를 실행하지 못했다. 저장소의 Node 버전 설정은 변경하지 않았다.

`act`가 보고한 `runner.arch`는 `ARM64`였다. 실제 컨테이너의 `uname -m`은 `x86_64`였다. 이번 결과는 같은 x64 컨테이너 간 복원만 검증한다.

Prisma 안전 장치가 DB 초기화를 차단했다. `--reset true`와 스키마 초기화 검증은 `BLOCKED`이다. 초기화 승인을 우회하지 않았다.

격리 복사본의 Git 기준은 일반 로컬 `bf401bd`, `act` `52f7070`이었다. 캐시 설정은 미커밋 변경으로 복사했다. 원본의 동시 ERD 변경은 수정하지 않았다.

원격 GitHub Actions 실행은 `NOT_VERIFIED`이다. 로컬 결과는 원격 실행 증거가 아니다. 커밋, push, 배포는 수행하지 않았다.

로컬 로그는 `/private/tmp/knittinglog-native-cache-qa-MELzPw`에 있다. `act` 로그와 요약은 `/private/tmp/knittinglog-cache-qa-NPqDRQ`에 있다.

## Limits

The local run does not represent a GitHub-hosted runner.

The GitHub and local runs use different dependency trees.

The timings do not prove how much time each proposed action will save.

## References

- [Build workflow](../.github/workflows/build.yml)
- [API build scripts](../packages/api/package.json)
- [Backend build scripts](../packages/backend/package.json)
- [ttsc compile and plugin cache](https://ttsc.dev/docs/ttsc/compile/)
- [ttsc build cache for CI](https://ttsc.dev/docs/ttsc/cache/)
