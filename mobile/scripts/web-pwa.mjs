// После `expo export -p web`: превращает сайт в «приложение» для iPhone и Android —
// иконка на экране «Домой», запуск без адресной строки, тёмная строка состояния.
// Запуск: node scripts/web-pwa.mjs dist <версия>
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [dir = 'dist', version = 'dev'] = process.argv.slice(2);
const file = path.join(dir, 'index.html');
let html = readFileSync(file, 'utf8');

html = html.replace(/<html[^>]*>/, '<html lang="ru">');
html = html.replace(/<title>[^<]*<\/title>/, '<title>Кактус</title>');
// viewport-fit=cover — приложение под «чёлкой» и полосой «Домой», отступы даёт safe-area
html = html.replace(/<meta name="viewport"[^>]*>/, '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">');
const head = [
  '<link rel="manifest" href="/manifest.webmanifest">',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="Кактус">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
  '<meta name="theme-color" content="#0B0F14">',
  '<meta name="format-detection" content="telephone=no">',
  '<style>html,body{background:#0B0F14;overscroll-behavior:none}</style>',
].join('');
html = html.replace('</head>', `${head}</head>`);
writeFileSync(file, html);
writeFileSync(path.join(dir, 'version.txt'), `${version}\n`);
console.log('PWA: готово', file);
