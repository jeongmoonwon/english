// 웹앱 파일을 앱 안(www)에 넣음: 심사 뒤 서버에서 기능이 바뀌지 않게, 업데이트는 새 앱 버전으로 (App Store 가이드라인 2.5.2)
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const out = path.resolve(import.meta.dirname, 'www');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of ['index.html', 'privacy.html', 'manifest.webmanifest']) fs.copyFileSync(path.join(root, f), path.join(out, f));
for (const d of ['vendor', 'icons']) fs.cpSync(path.join(root, d), path.join(out, d), { recursive: true });
console.log('www ready:', fs.readdirSync(out).join(', '));
