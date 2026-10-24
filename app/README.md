# mooni의 단어장 — iOS 앱 (Capacitor)

웹앱(`../index.html`)을 앱 안에 그대로 넣어 iOS 앱으로 만듭니다. 웹 파일은 앱에 포함되고(서버에서 받아 오지 않음), 업데이트는 새 앱 버전으로 냅니다.
앱 안에서는 `NATIVE`(index.html)가 켜져서 로그인·알림을 기기 기능으로 씁니다. 웹에서는 지금과 똑같이 동작합니다.

## 한 번만: 준비

1. **Xcode**를 App Store에서 설치하고 한 번 열어 추가 구성요소를 설치합니다.
   `sudo xcode-select -s /Applications/Xcode.app`
2. **Apple Developer Program** 가입 (연 $99). App Store Connect에서 앱을 만들고 번들 ID `com.mooni.wordbook`을 등록합니다.
   다른 번들 ID를 쓰려면 `capacitor.config.json`의 `appId`도 바꿔 주세요.
3. **Firebase 콘솔** (프로젝트 `mooni-wordbook-66dd9`)
   - 프로젝트 설정 → 내 앱 → **iOS 앱 추가** (번들 ID 같게) → `GoogleService-Info.plist` 받기
   - Authentication → 로그인 방법 → **Apple** 사용 설정
   - 프로젝트 설정 → 클라우드 메시징 → **APNs 인증 키(.p8)** 올리기 (Apple Developer → Keys에서 만든 키, Key ID·Team ID와 함께)
   - 프로젝트 설정 → 서비스 계정 → **새 비공개 키 생성** → 받은 JSON을 Worker 비밀값으로:
     `cd ../worker && npx wrangler secret put FCM_SA < 받은파일.json`

## iOS 프로젝트 만들기

```sh
cd app
npm install
npm run build                       # 웹 파일을 www/에 넣음
npx cap add ios --packagemanager SPM
cp ~/Downloads/GoogleService-Info.plist ios/App/App/
node ios-plist.mjs                  # 권한 설명 문구·알림·구글 로그인 주소
npx cap sync ios
npx cap open ios
```

Xcode에서 App 타깃 → **Signing & Capabilities**
- Team 선택
- **+ Capability**: Push Notifications, Sign in with Apple, Background Modes(Remote notifications)
- `GoogleService-Info.plist`가 App 타깃에 들어가 있는지 확인

웹앱을 고친 뒤에는 `npm run sync`로 다시 넣고 빌드합니다.

## App Store 제출 메모

- **심사 메모(App Review Information)**: "Apple로 로그인으로 바로 써 볼 수 있어요. AI 기능은 처음 쓸 때 외부 AI(OpenAI) 사용 동의를 받아요." 데모 계정이 필요하다고 하면 Apple 로그인으로 충분하다고 적습니다.
- **연령 등급**: AI가 만드는 자유 대화가 있으므로 설문에서 해당 항목(사용자 생성/AI 콘텐츠)을 정확히 답합니다.
- **개인정보 라벨(App Privacy)** — 수집하고 계정과 연결됨, 추적 안 함:
  - 연락처 정보: 이메일 주소, 이름 (로그인)
  - 사용자 콘텐츠: 오디오 데이터(대화·말하기), 사진(사진 읽기), 기타 사용자 콘텐츠(카드, 대화 내용, 관심사, 넣은 링크, 의견)
  - 식별자: 사용자 ID
  - 사용 데이터: 제품 상호작용(하루 사용 횟수)
  - 목적: 앱 기능
- **개인정보처리방침 주소**: `https://jeongmoonwon.github.io/english/privacy.html`
- **구글 캘린더**: 앱에서는 아직 숨겨 둠(구글이 앱 안 로그인 창을 막고, 캘린더 권한은 구글 앱 검증이 따로 필요). 웹에서는 그대로 동작.
- **인앱 결제**: 나중에 AI 사용량 등 디지털 기능을 유료로 팔면 Apple 인앱 결제를 써야 합니다(가이드라인 3.1).
