# freedom (웹앱 버전)

유튜브에서 본 영어 표현을 망각곡선(FSRS)으로 외우는 개인 플래시카드 웹앱입니다.
아이폰 앱 버전과 기능이 같고, 무료로 기간 제한 없이 쓸 수 있습니다.

## 파일 구성

- `index.html` — 앱 전체 (화면, 저장, 복습, 자유 연습, 백업)
- `sw.js` — 오프라인에서도 열리게 해주는 파일
- `manifest.webmanifest` — 홈 화면 아이콘과 이름
- `vendor/ts-fsrs.mjs` — FSRS 라이브러리 (ts-fsrs 5.4.2, MIT)
- `icons/` — 앱 아이콘

## GitHub Pages로 올리기 (무료)

1. GitHub에서 새 저장소(Repository)를 만듭니다. 무료 계정은 Public이어야 Pages를 쓸 수 있습니다.
   코드만 공개되고, 카드와 사진은 각자 기기에만 저장되므로 올라가지 않습니다.
2. 저장소 화면에서 **Add file → Upload files**를 누르고, 이 폴더 안의 파일과 폴더를 전부 끌어다 놓은 뒤 **Commit changes**를 누릅니다.
   (`index.html`이 저장소 맨 위에 있어야 합니다.)
3. **Settings → Pages**에서 Source를 **Deploy from a branch**, Branch를 **main / (root)**로 두고 Save를 누릅니다.
4. 1~2분 뒤 `https://<아이디>.github.io/<저장소이름>/` 주소로 열립니다.

## 아이폰에 설치

1. Safari로 위 주소에 들어갑니다.
2. 공유 버튼 → **홈 화면에 추가**를 누릅니다.
3. 홈 화면 아이콘으로 열면 주소창 없이 앱처럼 실행됩니다. 한 번 열어두면 이후엔 인터넷 없이도 열립니다.

## 수정해서 다시 올릴 때

파일을 고쳐 저장소에 다시 올린 뒤, `sw.js` 맨 위의 `CACHE = 'freedom-v1'` 숫자를 하나 올려 주세요(v2, v3 …).
그래야 폰에 저장된 옛 버전이 새 버전으로 바뀝니다. 앱을 한두 번 껐다 켜면 반영됩니다.

## 데이터 주의사항

- 카드, 사진, 복습 기록은 **그 기기의 브라우저 안에만** 저장됩니다. 다른 기기와 자동으로 동기화되지 않습니다.
- 홈 화면 아이콘을 삭제하면 데이터도 함께 지워질 수 있습니다.
- 카드 탭의 **백업 → 백업 파일 만들기**로 가끔 파일 앱이나 iCloud Drive에 저장해 두세요.
  다른 기기나 새로 설치한 앱에서는 **백업 파일에서 복원하기**로 옮길 수 있습니다.

## 이름 바꾸기

`manifest.webmanifest`의 `name`, `short_name`과 `index.html` 위쪽의 `<title>`, `apple-mobile-web-app-title`을 바꾸면 됩니다.
이미 홈 화면에 추가했다면, 바꾼 뒤 아이콘을 다시 추가해야 이름이 반영됩니다(먼저 백업하세요).

## 설정값

`index.html`의 `설정` 부분에서 바꿀 수 있습니다.

- 목표 유지율: `request_retention: 0.9`
- 자유 연습 점수: `correct: 1`, `wrong: -2`, 최근 제외 장수 `recentExclude: 3`
- 사진 크기: `IMAGE_MAX = 1600`, `IMAGE_QUALITY = 0.8`

## Mac에서 미리 확인하기

이 폴더에서 터미널로 `python3 -m http.server 8000`을 실행하고 브라우저에서 `http://localhost:8000`을 엽니다.
