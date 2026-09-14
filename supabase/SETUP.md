# 정산방 클라우드 연결

현재 저장소에는 Supabase 테이블·Edge Function·클라이언트 연결 코드가 준비되어 있습니다. 실제 프로젝트 연결 및 배포는 아직 하지 않았습니다. 기본값은 같은 브라우저에서만 동작하는 로컬 모드입니다.

## 연결 순서

1. Supabase 프로젝트를 만들고 프로젝트 URL과 프로젝트 참조 ID를 확인합니다.
2. Supabase CLI를 사용할 수 있는 환경에서 다음을 실행합니다. 프로젝트를 연결하기 전에 대상 프로젝트가 맞는지 확인하세요.

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

`supabase/migrations/202609140001_rooms.sql`이 테이블과 서버 전용 함수를 만듭니다. CLI를 사용하지 않는다면 Supabase SQL Editor에서 해당 SQL 파일을 실행할 수도 있습니다.

3. Supabase 대시보드의 Edge Function Secrets에 다음 두 값을 등록합니다.

- `ALLOWED_ORIGINS`: 프런트엔드 주소. 예: `https://your-site.example,http://localhost:5173` (경로와 마지막 슬래시 없이, 여러 주소는 쉼표로 구분)
- `RATE_LIMIT_SECRET`: 암호학적으로 무작위 생성한 32자 이상의 서버 전용 비밀값. 예를 들어 `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`로 생성합니다.

`SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`는 Supabase Edge 런타임이 제공하는 서버 환경변수를 사용합니다. 서비스 키나 비밀값을 프런트엔드의 `VITE_*` 변수에 넣지 마세요.

4. 프로젝트 루트에서 함수를 배포합니다.

```sh
supabase functions deploy room-api
```

`config.toml`의 `verify_jwt = false`는 로그인 없는 방 조회를 위한 설정입니다. 쓰기는 함수 내부에서 방 관리자 세션을 별도로 검증합니다.

5. `.env.example`을 `.env.local`로 복사하고 다음 값을 채웁니다.

```dotenv
VITE_ROOM_STORAGE=supabase
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
```

6. 개발 서버를 다시 시작하거나 `npm run build`로 빌드합니다. `dist`를 HTTPS 정적 호스팅에 배포하고 해당 주소를 `ALLOWED_ORIGINS`에 등록합니다. 다른 사람이 접속하려면 localhost가 아닌 공개 프런트엔드 주소가 필요합니다.

## 배포 후 실제 확인

첫 브라우저에서 정산방과 정산 기록을 생성하고 링크를 복사하세요. 두 번째 기기 또는 시크릿 브라우저에서 링크를 열어 같은 기록이 보이는지 확인합니다. 비밀번호 없이 읽을 수 있어야 하고, 틀린 비밀번호로 수정할 수 없어야 합니다. 올바른 비밀번호로 수정한 뒤 첫 브라우저에서 새로고침하여 변경 내용을 확인하세요.

현재 자동 테스트는 HTTP 처리기와 로컬 PostgreSQL 엔진(PGlite)을 검증합니다. 실제 Supabase 네트워크·Edge 배포 테스트를 대신하지 않습니다.

## 저장 및 권한 구조

- UI → 저장 어댑터 → Edge 처리기 → 정산 서비스 → 서버 DB 어댑터 → Supabase PostgreSQL
- 계산은 `src/settlement/model.js`에서 재사용하며 서버에서도 다시 계산합니다. 클라이언트가 보낸 최종 금액을 신뢰하지 않습니다.
- 방 코드에 UNIQUE 제약을 적용하고 충돌 시 재생성합니다. 방과 최초 관리자 세션 생성은 하나의 트랜잭션입니다.
- 익명 사용자와 일반 인증 사용자의 테이블 직접 접근 및 쓰기 RPC 실행은 차단합니다. 공개 읽기는 Edge Function을 통해서만 제공하며 비밀번호 해시는 응답에 포함하지 않습니다.
- 비밀번호는 PBKDF2-SHA256, 개별 salt, 600,000회로 해시합니다. 확인 성공 시 발급한 15분 세션은 DB에 해시로만 보관하고 브라우저에서는 메모리에만 둡니다. 모든 저장 요청에서 서버가 방·만료·수정 버전을 검사합니다.
- 방 생성 및 비밀번호 시도 횟수를 서버에서 제한합니다. 비밀번호 분실 복구 기능은 없습니다.

## 기존 로컬 기록과 링크

기존 개별 기록은 `meraen-settlement.records.v1`에 유지됩니다. 로컬 정산방은 별도의 `meraen-settlement.rooms.v1`을 사용합니다. 클라우드 모드에서도 기존 개별 기록은 로컬에 남으며 자동 업로드하지 않습니다. 모드 전환이 로컬 데이터를 삭제하지 않습니다.

클라우드 설정이나 네트워크에 문제가 있으면 오류를 표시합니다. 클라우드 저장 실패를 로컬 저장 성공으로 바꾸지 않습니다.

공유 링크는 정적 호스팅에서도 열리는 `/#/room/A7K3P9` 형식입니다. `/room/A7K3P9` 주소도 앱에서 처리하지만 호스팅 서버에 index.html로 연결하는 SPA rewrite 설정이 필요합니다. 로컬 모드의 링크에는 데이터가 포함되지 않으므로 다른 브라우저에서는 같은 방을 조회할 수 없습니다.

공식 참고: [Edge Function 인증](https://supabase.com/docs/guides/functions/auth), [함수 설정](https://supabase.com/docs/guides/functions/function-configuration), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
