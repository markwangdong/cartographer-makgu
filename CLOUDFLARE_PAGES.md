# Cloudflare Pages 정적 배포 안내

## 배포 방식

이 저장소의 interface 앱은 Cloudflare Pages Static HTML Export 방식으로 배포합니다. Next.js 13.0.6 환경에서 의존성 업그레이드 없이 `next build && next export`를 실행해 `interface/out` 산출물을 생성합니다.

## 권장 URL

권장 배포 URL은 `cartographer.markgame.world` 같은 서브도메인입니다.

`markgame.world/cartographer` 같은 하위 경로 배포는 이번 설정 대상이 아닙니다. 필요하면 별도의 `basePath` 설정 또는 Worker Route 설계가 필요합니다.

## Cloudflare Pages 설정

- Framework preset: None 또는 Next.js (Static HTML Export)
- Root directory: repository root
- Build command: `pnpm build:static`
- Build output directory: `interface/out`
- Environment variable: `NODE_VERSION=22`

## 로컬 검증 명령

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm build:static
```

## 성공 확인

- `interface/out/index.html` 파일이 생성되었는지 확인합니다.
- `interface/out/_next/` 폴더가 생성되었는지 확인합니다.

## 주의사항

- `next start`는 Cloudflare Pages 정적 배포에서 사용하지 않습니다.
- Cloudflare Pages에는 `interface/out`만 업로드됩니다.
- API Routes, `getServerSideProps`, 서버 런타임 기능을 추가하면 정적 export가 깨질 수 있습니다.
