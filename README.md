# mooni의 단어장

> 유튜브에서 본 영어 표현을 망각곡선(FSRS)으로 외우는 플래시카드 웹앱(PWA)

- **현재 단계:** MVP (PWA)
- **목표:** 바이브코딩으로 만든 앱으로 수익화
- **저장소:** [jeongmoonwon/english](https://github.com/jeongmoonwon/english)
- **배포 URL:** https://jeongmoonwon.github.io/english/
- **Firebase 콘솔:**

## 목차

1. [기획](#1-기획)
2. [개발로그](#2-개발로그)
3. [기술문서](#3-기술문서)
4. [디자인](#4-디자인)
5. [피드백](#5-피드백)
6. [수익모델](#6-수익모델) *(추후 작성)*
7. [경쟁 앱 비교](#7-경쟁-앱-비교) *(추후 작성)*

---

## 1. 기획

### 문제 & 타깃

- **해결하려는 문제:** 유튜브에서 본 영어 표현을 금방 잊어버림
- **타깃 사용자:**
- **사용 시나리오:** 표현 캡처 → ENG/KOR 입력 → KOR 보고 ENG 맞추기 → FSRS로 복습 일정 자동 관리

### 핵심 기능 (MVP)

- [x] 카드 추가 (ENG/KOR 타이핑)
- [ ] 사진으로 자동 입력 (Claude가 사진 속 표현과 뜻을 채움, 1인당 하루 10장)
- [x] FSRS 기반 복습
- [x] 자유 연습
- [x] 카테고리별 단어장, 복습 방향 선택
- [x] 기록 탭 (공부 캘린더)
- [x] 백업/복원
- [ ] Firebase 동기화 (기존 카드는 유지)

### 나중에 할 것

-

### 마일스톤

| 버전 | 목표 | 상태 |
|---|---|---|
| v0.1 MVP | | |
| v0.2 베타 | | |
| v1.0 출시 | | |

---

## 2. 개발로그

> 작업할 때마다 위에 새로 추가 (최신순)

<!-- 템플릿
### YYYY-MM-DD · 제목  `기능|버그|디자인|리팩터|배포`
- **한 것:**
- **막힌 점:**
- **다음에 할 것:**
- **잘 먹힌 프롬프트:**
- **커밋/PR:**
-->

### YYYY-MM-DD · 제목  `유형`

- **한 것:**
- **막힌 점:**
- **다음에 할 것:**
- **잘 먹힌 프롬프트:**
- **커밋/PR:**

---

## 3. 기술문서

### 기술 스택

- **프론트:** 단일 `index.html` PWA (GitHub Pages 배포)
- **복습 알고리즘:** [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) 5.4.2 (MIT)
- **동기화:** Firebase (Authentication, Cloud Firestore) Spark(무료) 요금제. Firebase JS SDK 12.19.0 중 app·auth·firestore/lite만 묶어서 사용. 사진은 동기화하지 않음
- **사진으로 자동 입력:** Cloudflare Worker(`worker/`) → Claude API (`claude-sonnet-5`). API 키는 Worker에만 있음

### 파일 구성

- `index.html`: 앱 전체 (화면, 저장, 복습, 자유 연습, 백업)
- `sw.js`: 오프라인에서도 열리게 해주는 서비스 워커
- `manifest.webmanifest`: 홈 화면 아이콘과 이름
- `privacy.html`: 개인정보처리방침
- `vendor/ts-fsrs.mjs`: FSRS 라이브러리
- `vendor/firebase.mjs`: Firebase SDK 번들 (Apache-2.0, 라이선스는 `vendor/firebase-LICENSE.txt`). 오프라인에서도 앱이 열리도록 직접 포함
- `firebase/`: Firestore 보안 규칙(`firestore.rules`)
- `worker/`: 사진으로 자동 입력용 Cloudflare Worker (로그인 확인, 하루 10장 제한, Claude 호출)
- `icons/`: 앱 아이콘

### 데이터 구조

- **카드:**
- **복습 기록:**
- **FSRS 파라미터:**

### 설정값

`index.html`의 `설정` 부분에서 바꿀 수 있습니다.

- 목표 유지율: `request_retention: 0.9`
- 자유 연습 점수: `correct: 1`, `wrong: -2`, 최근 제외 장수 `recentExclude: 3`
- 자동 입력용 사진 크기: `IMAGE_MAX = 1568`, `IMAGE_QUALITY = 0.8`
- 자동 입력 Worker 주소: `SCAN_URL` (비어 있으면 자동 입력 칸이 숨겨짐)
- 하루 사용 제한·모델: `worker/src/index.js`의 `DAILY_LIMIT = 10`, `MODEL = 'claude-sonnet-5'`
- Firebase 연결 정보: `FIREBASE` (아래 Firebase 설정 참고). `apiKey`가 비어 있으면 동기화 메뉴가 "준비 중"으로 나옵니다.

### 배포 (GitHub Pages)

1. 변경한 파일을 저장소에 올립니다.
2. `sw.js` 맨 위의 `CACHE = 'freedom-vN'` 숫자와 `index.html`의 `APP_VERSION`을 하나씩 올립니다. 그래야 폰에 저장된 옛 버전이 새 버전으로 바뀝니다.
3. **Settings → Pages**에서 Source는 **Deploy from a branch**, Branch는 **main / (root)** 로 둡니다.
4. 1~2분 뒤 배포 URL에서 확인합니다. 앱을 한두 번 껐다 켜면 반영됩니다.

### Firebase 설정 (처음 한 번)

1. [Firebase 콘솔](https://console.firebase.google.com)에서 프로젝트를 만듭니다. Spark(무료) 요금제로 충분합니다.
2. **Authentication → 시작하기 → 로그인 방법 → Google**을 사용 설정하고 저장합니다.
   Google 줄을 다시 열어 **외부 프로젝트의 클라이언트 ID 허용 목록**에 `index.html`의 `GOOGLE.clientId`를 추가합니다.
3. **Firestore Database → 데이터베이스 만들기** (위치: `asia-northeast3` 서울, 프로덕션 모드).
   **규칙** 탭에 `firebase/firestore.rules` 내용을 붙여 넣고 **게시**합니다.
4. **프로젝트 설정 → 일반 → 내 앱 → 웹 앱 추가**를 누르고, 나오는 `firebaseConfig`의
   `apiKey`, `authDomain`, `projectId`, `storageBucket`, `appId`를 `index.html`의 `FIREBASE`에 넣습니다.
   이 값들은 공개돼도 괜찮습니다. 데이터는 3번의 보안 규칙으로 보호됩니다.
5. Google Cloud 콘솔(로그인 클라이언트가 있는 프로젝트) → **Google 인증 플랫폼 → 데이터 액세스**에서 `drive.appdata` 범위를 지우고 `openid`, `email`, `profile`만 남깁니다.
   그다음 **대상**에서 앱을 **프로덕션으로 게시**하면 누구나 로그인할 수 있습니다.

### 사진으로 자동 입력 (Cloudflare Worker, 처음 한 번)

Claude API 키를 앱에 넣으면 누구나 꺼내 쓸 수 있어서, 키는 Worker에만 둡니다. Worker는 Firebase 로그인을 확인하고 1인당 하루 10장(한국 시간 자정 초기화)까지만 Claude에 보냅니다.

1. [Anthropic Console](https://platform.claude.com)에서 크레딧을 충전하고 **API 키**를 만듭니다. 월 사용 한도(Limits)도 정해 두세요.
2. [Cloudflare](https://dash.cloudflare.com) 무료 계정을 만듭니다.
3. 터미널에서:
   ```
   cd worker
   npm install
   npx wrangler login
   npx wrangler kv namespace create USAGE
   ```
   마지막 명령이 알려 주는 `id`를 `worker/wrangler.toml`의 `REPLACE_WITH_KV_ID` 자리에 넣습니다.
4. API 키를 비밀값으로 넣고 배포합니다:
   ```
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler deploy
   ```
5. 배포가 알려 주는 주소(`https://mooni-scan.<계정>.workers.dev`)를 `index.html`의 `SCAN_URL`에 넣습니다.
6. 다른 주소에서 앱을 열 때는 `worker/wrangler.toml`의 `ALLOWED_ORIGINS`에 그 주소를 추가하고 다시 배포합니다.

비용: 사진 한 장에 대략 10~30원(Claude Sonnet 5 기준, 사진 크기와 찾은 표현 수에 따라 다름)입니다. Cloudflare Worker와 KV는 무료 요금제 안에서 씁니다(KV 쓰기는 하루 1,000회까지라, 하루 약 1,000장까지).

### 아이폰에 설치

1. Safari로 배포 URL에 들어갑니다.
2. 공유 버튼 → **홈 화면에 추가**를 누릅니다.
3. 홈 화면 아이콘으로 열면 주소창 없이 앱처럼 실행되고, 한 번 열어두면 이후엔 오프라인으로도 열립니다.

### Mac에서 미리 확인하기

이 폴더에서 `python3 -m http.server 8000`을 실행하고 `http://localhost:8000`을 엽니다.
로그인까지 확인하려면 Google Cloud 콘솔의 OAuth 클라이언트에 `http://localhost:8000/`을 승인된 리디렉션 URI로 추가해 두세요.

### 이름 바꾸기

`manifest.webmanifest`의 `name`, `short_name`과 `index.html` 위쪽의 `<title>`, `apple-mobile-web-app-title`을 바꿉니다. 이미 홈 화면에 추가했다면 아이콘을 다시 추가해야 반영됩니다(먼저 백업하세요).

### 데이터 주의사항

- 카드와 복습 기록은 먼저 그 기기의 브라우저 안에 저장됩니다.
- **사진은 동기화하지 않습니다.** 이전 버전에서 카드에 붙인 사진은 그 기기에만 있고, 다른 기기에서는 "사진은 다른 기기에 있어요"로 보입니다.
  사진도 백업 파일(**동기화 · 백업 → 백업 파일 만들기**)에는 들어 있습니다.
- **카드 탭 → 동기화 → Google로 로그인**을 하면 Firebase에 자동으로 저장되고 같은 계정의 다른 기기와 맞춰집니다. 로그인은 한 번 하면 계속 유지됩니다.
- 로그인하지 않았다면 홈 화면 아이콘을 삭제할 때 데이터도 함께 지워질 수 있으니 **카드 탭 → 동기화 → 백업 파일 만들기**로 가끔 백업해 두세요.
- 이전 버전(Google Drive 동기화)을 쓰던 기기는 업데이트 후 다시 로그인하면 그 기기의 데이터가 Firebase로 올라갑니다. Drive에 있던 사본을 직접 옮기지는 않으니, 데이터가 있는 기기에서 한 번씩 로그인해 주세요.

### 의사결정 기록

| 날짜 | 결정 | 이유 |
|---|---|---|
| | Swift(iOS 네이티브) 중단 → PWA로 전환 | |
| | 동기화를 Google Drive → Firebase로 전환 | 기존 등록 카드는 유지하는 조건 |
| 2026-10-05 | 사진 저장·동기화 중단, 사진으로 자동 입력(Claude Sonnet 5)으로 대체 | 사진 저장(Cloud Storage)에 Blaze 요금제가 필요해서. 기존 사진은 백업 파일에서 꺼내 따로 보관 |

---

## 4. 디자인

### 화면 목록

- **복습**: 방향/카테고리 선택 후 복습, 자유 연습
- **카드**: 카드 추가·관리, 카테고리, 백업
- **기록**: 공부 캘린더

### 와이어프레임 / 스크린샷

<!-- 이미지 추가: ![설명](docs/screenshot.png) -->

### 디자인 규칙

- **메인 컬러:** `#EEF1F4` (배경/테마)
- **폰트:**
- **아이콘:** 웃는 카드 캐릭터 (`icons/`)

---

## 5. 피드백

| 날짜 | 출처 (나/지인/사용자 리뷰) | 유형 (아이디어/불편/버그/칭찬) | 내용 | 반영 여부 |
|---|---|---|---|---|
| | | | | ⬜ |

---

## 6. 수익모델

> ⏳ 추후 작성

- **후보:** 구독 / 광고 / 1회 결제
- **결정:**

---

## 7. 경쟁 앱 비교

> ⏳ 추후 작성

| 앱 | 핵심 기능 | 가격 | 장점 | 단점 | 우리와의 차이 |
|---|---|---|---|---|---|
| Anki | | | | | |
| | | | | | |
