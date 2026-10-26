// 웹 앱(index.html 등)을 desktop/app 으로 복사한다. 먼저 저장소 루트에서 python3 build.py
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..'), out = path.join(__dirname, 'app');
fs.rmSync(out, {recursive: true, force: true}); fs.mkdirSync(out, {recursive: true});
for (const f of ['index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable.png', 'apple-touch-icon.png', 'Ollama_켜기.bat']) fs.copyFileSync(path.join(root, f), path.join(out, f));
fs.mkdirSync(path.join(__dirname, 'build'), {recursive: true});
fs.copyFileSync(path.join(root, 'icon-512.png'), path.join(__dirname, 'build', 'icon.png'));
console.log('app files ->', out);
