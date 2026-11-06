/* Guarda a estrutura do app para abrir mesmo sem sinal. Os dados seguem pelo banco. */
const CACHE = "nexum-v24";
const ARQS = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png", "../assets/favicon.png", "../assets/marca/obra-fundo.jpg", "../assets/marca/nexum-n-claro.svg", "../assets/base.css", "../assets/vendor/html5-qrcode.min.js", "../assets/vendor/xlsx.mini.min.js", "../assets/vendor/msal-browser.min.js", "../assets/diligenciamento.js", "../assets/exemplo-docs.js", "../assets/dados.js", "../assets/ui.js", "../assets/atualizacao.js", "../assets/vendor/firebase-app-compat.js", "../assets/vendor/firebase-auth-compat.js", "../assets/vendor/firebase-firestore-compat.js", "../assets/nuvem-config.js", "../assets/nuvem.js", "../assets/marca/nexum-n-escuro.svg"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.endsWith("versao.json")) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
