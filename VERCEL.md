# Vercel 정산방 배포 점검

## 2026-09-15 실제 배포 진단

공개 GitHub 저장소에 등록된 홈페이지 `https://mapleland-settlement.vercel.app`에서 `/assets/index-04GpT6HR.js`를 확인했습니다. 실제 Production 환경변수 객체에는 공개 키만 있고 `VITE_ROOM_STORAGE`와 `VITE_SUPABASE_URL`이 없습니다. 기존 `VITE_ROOM_STORAGE || 'local'` 경로가 남아 있어 로컬 저장을 선택합니다. 로컬 빌드에는 같은 프로젝트 URL과 `VITE_ROOM_STORAGE: supabase`가 포함됩니다. Dashboard 현재 설정은 직접 확인하지 않았으므로 변수 미등록과 등록 후 미재배포를 구분하려면 Dashboard 확인이 필요합니다.

위 Vercel origin으로 `room-api`에 OPTIONS 요청을 보냈을 때 **403**이고 `Access-Control-Allow-Origin` 헤더가 없었습니다. 서버가 해당 origin을 차단하고 있으므로 아래 환경변수 조치 외에 Supabase의 `ALLOWED_ORIGINS`에도 `https://mapleland-settlement.vercel.app`을 추가해야 합니다. 기존 허용 origin과 서버 비밀값은 그대로 유지하세요.

이번 작업에서는 Vercel Dashboard 환경변수, Supabase Secrets, 실제 Production 배포를 변경하지 않았습니다. 로컬 코드에 누락 감지와 회귀 테스트를 추가했습니다.

로컬 `.env.local`은 Git에서 제외됩니다. Vercel에는 별도로 환경변수를 등록해야 합니다. Vite는 `import.meta.env`를 빌드 시점에 반영하므로 환경변수 변경 후 새 Production 빌드가 필요합니다.

## Production 환경변수

Vercel → 해당 프로젝트 → Settings → Environment Variables에서 **Production**을 선택하고 등록합니다.

| 이름 | 값 |
| --- | --- |
| VITE_ROOM_STORAGE | supabase |
| VITE_SUPABASE_URL | https://djrlhlygpichfepugshf.supabase.co |
| VITE_SUPABASE_ANON_KEY | 로컬에서 사용하는 동일한 공개 anon/publishable key |

Development나 Preview에만 등록한 값은 Production 설정을 대신하지 않습니다. `.env.local` 파일을 Git에 올릴 필요는 없습니다. 서비스 역할 키·Secret API Key·RATE_LIMIT_SECRET은 VITE 변수에 넣지 않습니다.

Deployments에서 최신 Production 배포를 Redeploy합니다. 새 배포가 Ready가 되고 실제 Production 도메인에 연결됐는지 확인합니다. 이미 생성된 빌드의 Promote만으로는 새 환경변수가 반영되지 않습니다.

## 코드 진단 결과

- `Rooms.jsx`에서 `configureRoomRepository(import.meta.env, storage)`로 전달합니다.
- 수정 전 `VITE_ROOM_STORAGE || 'local'`은 값 누락·빈 값에서 로컬 저장을 선택했습니다. 명시적 `local`도 같은 결과였습니다.
- 이제 모드가 누락되면 설정 오류를 표시하고 저장하지 않습니다. `local`을 명시한 기존 로컬 기능은 유지합니다.
- `supabase` 모드에서는 `${Supabase URL의 origin}/functions/v1/room-api`를 호출합니다. localhost 주소가 하드코딩되어 있지 않습니다.
- 클라우드 요청 실패나 CORS 오류가 로컬 저장으로 전환되는 경로는 없습니다.
- 브라우저 저장 모드 문구만으로 Dashboard의 변수가 누락됐는지, 명시적 local인지, 이전 빌드인지까지 구분할 수는 없습니다. 현재 배포 번들과 Dashboard 설정을 함께 확인해야 합니다.

## CORS 점검

Supabase → Edge Functions → Secrets → `ALLOWED_ORIGINS`에 **실제 Vercel Production origin**이 필요합니다. 예: `https://your-site.vercel.app`. localhost 등 기존 허용 주소를 유지한 채 쉼표로 추가합니다. 마지막 슬래시·경로·해시를 넣지 않습니다. 커스텀 도메인을 사용한다면 그 origin도 정확히 등록합니다. 임의의 전체 도메인 허용으로 바꾸지 않습니다.

등록 여부는 실제 origin을 담은 room-api OPTIONS 요청으로 확인할 수 있습니다. 허용 시 204 및 동일한 Access-Control-Allow-Origin, 미허용 시 403이 반환됩니다. 이 문제는 클라우드 모드가 활성화된 후의 요청 차단이며, 로컬 모드 표시와 별개입니다.

## 재배포 후 확인

1. Production 정산방 화면에서 클라우드 안내를 확인합니다.
2. 개발자 도구 Network에서 요청 주소가 위 Supabase의 `/functions/v1/room-api`인지 확인합니다.
3. 정산방을 만들고 기록을 저장합니다.
4. Production 주소로 생성한 링크를 시크릿 브라우저에서 열어 동일 기록을 읽습니다.
5. 비밀번호 없는 수정과 잘못된 비밀번호는 차단되고, 올바른 비밀번호만 수정 가능한지 확인합니다.

기존에 로컬 모드에서 만든 방은 클라우드에 자동 업로드되지 않습니다. 해당 브라우저 저장 데이터는 삭제하지 마세요. localhost 공유 링크는 다른 PC에서 같은 프런트엔드로 연결되지 않으므로 Production 링크나 방 코드를 사용합니다.

공식 문서: [Vite 환경변수](https://vite.dev/guide/env-and-mode), [Vercel 환경변수와 재배포](https://vercel.com/docs/environment-variables/managing-environment-variables).
