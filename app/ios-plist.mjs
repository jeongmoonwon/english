// iOS 프로젝트를 만든 뒤(npx cap add ios) 한 번 실행: 권한 설명 문구·알림·구글 로그인 주소를 Info.plist에 넣음 (여러 번 실행해도 같음)
import fs from 'node:fs';
import path from 'node:path';
const dir = import.meta.dirname;
const plistPath = path.join(dir, 'ios/App/App/Info.plist');
const gsPath = path.join(dir, 'ios/App/App/GoogleService-Info.plist');
let plist = fs.readFileSync(plistPath, 'utf8');
// 권한을 왜 쓰는지 (모호하면 심사에서 반려: 가이드라인 5.1.1)
const usage = {
  NSMicrophoneUsageDescription: '말해서 카드를 넣고, 말로 답하는 복습과 대화 상대와 말로 대화할 때 목소리를 들으려고 마이크를 써요.',
  NSPhotoLibraryUsageDescription: '사진 속 외국어 표현을 읽어 카드로 만들 때 고른 사진만 써요.',
  NSCameraUsageDescription: '외국어가 적힌 것을 찍어 카드로 만들 때 카메라를 써요.',
};
/** 키가 있으면 그 값(안에 같은 태그가 겹쳐 있어도 짝을 맞춰)을 바꾸고, 없으면 맨 끝에 추가 */
const set = (key, xml) => {
  const k = plist.indexOf(`<key>${key}</key>`);
  if (k < 0) { plist = plist.replace(/<\/dict>\s*<\/plist>\s*$/, `\t<key>${key}</key>\n\t${xml}\n</dict>\n</plist>\n`); return; }
  const start = plist.indexOf('<', k + key.length + 11);
  const tag = plist.slice(start + 1).match(/^\w+/)[0];
  let end;
  if (plist.slice(start).match(/^<\w+\s*\/>/)) end = plist.indexOf('>', start) + 1;
  else {
    const re = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, 'g');
    re.lastIndex = start;
    let depth = 0, m;
    while ((m = re.exec(plist))) { if (m[2]) continue; depth += m[1] ? -1 : 1; if (!depth) { end = re.lastIndex; break; } }
  }
  plist = plist.slice(0, start) + xml + plist.slice(end);
};
for (const [k, v] of Object.entries(usage)) set(k, `<string>${v}</string>`);
set('UIBackgroundModes', '<array>\n\t\t<string>remote-notification</string>\n\t</array>');
set('ITSAppUsesNonExemptEncryption', '<false/>');   // 표준 HTTPS만 씀 (수출 규정 질문 생략)
// 구글 로그인이 앱으로 돌아오는 주소 (GoogleService-Info.plist의 REVERSED_CLIENT_ID)
if (fs.existsSync(gsPath)) {
  const rev = fs.readFileSync(gsPath, 'utf8').match(/<key>REVERSED_CLIENT_ID<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
  if (rev) set('CFBundleURLTypes', `<array>\n\t\t<dict>\n\t\t\t<key>CFBundleURLSchemes</key>\n\t\t\t<array>\n\t\t\t\t<string>${rev}</string>\n\t\t\t</array>\n\t\t</dict>\n\t</array>`);
  else console.warn('GoogleService-Info.plist에 REVERSED_CLIENT_ID가 없어요');
} else console.warn('ios/App/App/GoogleService-Info.plist를 먼저 넣어 주세요 (Firebase 콘솔에서 받음)');
fs.writeFileSync(plistPath, plist);
console.log('Info.plist 업데이트 완료');
