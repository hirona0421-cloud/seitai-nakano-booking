from pathlib import Path
from PIL import Image
import json

ROOT = Path('.')
ASSETS = ROOT / 'assets'
logo_path = ASSETS / 'nakano-logo.png'
logo = Image.open(logo_path).convert('RGBA')

BG = (246, 243, 238, 255)

def make_icon(size, filename, padding_ratio=0.12):
    canvas = Image.new('RGBA', (size, size), BG)
    max_w = int(size * (1 - padding_ratio * 2))
    max_h = int(size * (1 - padding_ratio * 2))
    scale = min(max_w / logo.width, max_h / logo.height)
    w = max(1, int(logo.width * scale))
    h = max(1, int(logo.height * scale))
    resized = logo.resize((w, h), Image.Resampling.LANCZOS)
    x = (size - w) // 2
    y = (size - h) // 2
    canvas.alpha_composite(resized, (x, y))
    canvas.convert('RGB').save(ASSETS / filename, 'PNG', optimize=True)

make_icon(192, 'app-icon-192.png', 0.10)
make_icon(512, 'app-icon-512.png', 0.10)
make_icon(512, 'app-icon-maskable-512.png', 0.20)
make_icon(180, 'apple-touch-icon.png', 0.10)

manifest = {
    'id': '/seitai-nakano-booking/',
    'name': '整体なかの オンライン予約',
    'short_name': '整体なかの',
    'description': '整体なかののオンライン予約',
    'start_url': './',
    'scope': './',
    'display': 'standalone',
    'background_color': '#f6f3ee',
    'theme_color': '#741b16',
    'lang': 'ja',
    'prefer_related_applications': False,
    'icons': [
        {'src': './assets/app-icon-192.png', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any'},
        {'src': './assets/app-icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any'},
        {'src': './assets/app-icon-maskable-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'},
    ],
}
(ROOT / 'manifest.webmanifest').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')

(ROOT / 'offline.html').write_text('''<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#741b16">
<title>整体なかの｜通信を確認してください</title>
<style>
body{margin:0;background:#f6f3ee;color:#2f2d2a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Yu Gothic",Meiryo,sans-serif}
main{max-width:520px;margin:auto;padding:48px 20px;text-align:center}.card{background:#fff;border:1px solid #e7e0d7;border-radius:18px;padding:28px 20px}img{display:block;width:min(240px,70%);height:auto;margin:0 auto 22px}h1{font-size:22px;margin:0 0 12px}p{color:#6f6861;line-height:1.8}.btn{display:block;margin-top:22px;padding:14px;border-radius:13px;background:#61574d;color:#fff;text-decoration:none;font-weight:700}
</style>
</head>
<body><main><div class="card"><img src="./assets/nakano-logo.png" alt="整体なかの"><h1>通信状況をご確認ください</h1><p>予約状況は最新情報を確認して表示するため、インターネット接続が必要です。</p><a class="btn" href="./">もう一度開く</a></div></main></body></html>''')

(ROOT / 'sw.js').write_text('''const CACHE_NAME='nakano-pwa-shell-v1';
const OFFLINE_URL='./offline.html';
const SHELL=[
  OFFLINE_URL,
  './assets/nakano-logo.png',
  './assets/app-icon-192.png',
  './assets/app-icon-512.png'
];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).catch(()=>caches.match(OFFLINE_URL)));
  }
});
''')

(ROOT / 'pwa-register.js').write_text('''(()=>{
  if('serviceWorker' in navigator){
    window.addEventListener('load',()=>{
      navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(err=>console.warn('PWA registration failed',err));
    },{once:true});
  }

  let installPrompt=null;
  let installButton=null;

  const removeButton=()=>{
    installButton?.remove();
    installButton=null;
  };

  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    installPrompt=event;
    if(installButton)return;
    const anchor=document.getElementById('lineStatus')||document.querySelector('.header');
    if(!anchor)return;
    const button=document.createElement('button');
    button.type='button';
    button.className='secondary';
    button.id='installNakanoApp';
    button.textContent='ホーム画面に追加';
    button.style.marginTop='10px';
    button.addEventListener('click',async()=>{
      if(!installPrompt)return;
      button.disabled=true;
      try{
        await installPrompt.prompt();
        await installPrompt.userChoice;
      }catch(err){
        console.warn('PWA install prompt failed',err);
      }finally{
        installPrompt=null;
        removeButton();
      }
    });
    anchor.insertAdjacentElement('afterend',button);
    installButton=button;
  });

  window.addEventListener('appinstalled',()=>{
    installPrompt=null;
    removeButton();
  });
})();
''')

index = ROOT / 'index.html'
s = index.read_text()
head_marker = '<meta name="theme-color" content="#741b16">'
head_insert = '''<link rel="manifest" href="./manifest.webmanifest?v=20260816-1">
<link rel="apple-touch-icon" href="./assets/apple-touch-icon.png?v=20260816-1">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="整体なかの">'''
if 'rel="manifest"' not in s:
    s = s.replace(head_marker, head_insert + '\n' + head_marker, 1)

body_marker = '</body></html>'
script = '<script src="./pwa-register.js?v=20260816-1" defer></script>\n'
if 'pwa-register.js' not in s:
    s = s.replace(body_marker, script + body_marker, 1)
index.write_text(s)
