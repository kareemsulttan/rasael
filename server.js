const http = require('http'), fs = require('fs'), path = require('path');
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.woff':'font/woff', '.txt':'text/plain; charset=utf-8', '.xml':'application/xml; charset=utf-8' };
const root = __dirname;
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/' || p === '') p = '/index.html';
  if (p === '/favicon.ico') p = '/images/favicon-32.png';   // بعض المتصفحات تطلبه مباشرة
  const file = path.join(root, path.normalize(p));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) {
      // ملف بامتداد غير موجود (robots.txt مثلًا) ← 404 حقيقي، لا الصفحة الرئيسية
      if (path.extname(p)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not found'); }
      return fs.readFile(path.join(root, 'index.html'), (e2, d2) => {
        res.writeHead(e2 ? 404 : 200, { 'Content-Type': types['.html'] }); res.end(d2 || 'Not found');
      });
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'public, max-age=3600' });
    res.end(data);
  });
}).listen(process.env.PORT || 8080, () => console.log('running'));
