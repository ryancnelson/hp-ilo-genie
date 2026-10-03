'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const {WebSocketServer, WebSocket} = require('ws');
const {ConsoleConnection} = require('./connection.cjs');
const {iloRequest} = require('./ilo-http.cjs');
const {localHost, authorized} = require('./security.cjs');
const cfg = require('./config.cjs').config();
const nonce = crypto.randomBytes(32).toString('hex');
const clients = new Set();
let consoleClient = null, connecting = null, lastFrame = null, token = null, idleTimer = null;
let status = 'Sign in to open the console.';

function send(ws, message) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}
function broadcast(message) {for (const ws of clients) send(ws, message);}
function setStatus(message) {status = message;broadcast({t:'status', message});console.log(message);}
function releaseInput() {
  try {if (consoleClient?.telnet) {consoleClient.keyboard([]);consoleClient.mouse(0,0,0);}} catch {}
}
async function ensureConsole() {
  if (connecting) return connecting;
  if (consoleClient) return;
  if (!token && cfg.sessionFile) {
    try {token = fs.readFileSync(cfg.sessionFile, 'utf8').trim();} catch {}
  }
  if (!token) throw Error('Sign in to iLO to open the console.');
  connecting = (async () => {
    const c = new ConsoleConnection({token});consoleClient = c;lastFrame = null;
    c.on('status', setStatus);
    c.on('debug', message => {if (process.env.DEBUG) console.log(message);});
    c.on('closed', () => {
      if (consoleClient === c) {consoleClient = null;lastFrame = null;setStatus('Console disconnected. Click Reconnect.');}
    });
    try {await c.connect();broadcast({t:'ready', name:c.name});}
    catch (err) {c.close();throw err;}
  })().finally(() => {connecting = null;});
  return connecting;
}

const staticFiles = new Map([
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['public/app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['public/style.css', 'text/css; charset=utf-8']],
  ['/license', ['LICENSE', 'text/plain; charset=utf-8']],
  ['/source.tar.gz', ['source.tar.gz', 'application/gzip']]
]);
let loginBusy = false;
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'");
  if (!localHost(req.headers.host)) {res.writeHead(403);res.end();return;}
  if (req.method === 'GET' && req.url === '/health') {res.end('ok');return;}
  if (req.method === 'GET' && staticFiles.has(req.url)) {
    const [file, type] = staticFiles.get(req.url);
    if (req.url === '/') res.setHeader('Set-Cookie', `iloGenie=${nonce}; HttpOnly; SameSite=Strict; Path=/`);
    res.setHeader('Content-Type', type);
    const stream = fs.createReadStream(path.join(__dirname, '..', file));
    stream.on('error', () => {res.writeHead(404);res.end();});stream.pipe(res);return;
  }
  if (req.method === 'POST' && req.url === '/login') {
    if (!authorized(req, nonce)) {res.writeHead(403);res.end();return;}
    if (loginBusy) {res.writeHead(409);res.end(JSON.stringify({error:'A sign-in request is already in progress.'}));return;}
    loginBusy = true;
    try {
      let text = '';
      for await (const chunk of req) {text += chunk;if (text.length > 4096) throw Error('Request too large.');}
      const p = JSON.parse(text);
      if (typeof p.username !== 'string' || typeof p.password !== 'string' || !p.username || !p.password) throw Error('Enter username and password.');
      const result = await iloRequest('/json/login_session', {method:'POST', body:{method:'login', user_login:p.username, password:p.password}});
      if (!/^[a-f0-9]{32}$/i.test(result.session_key || '')) throw Error('iLO rejected the login.');
      token = result.session_key;
      releaseInput();consoleClient?.close();
      if (connecting) {try {await connecting;} catch {}}
      await ensureConsole();
      res.setHeader('Content-Type', 'application/json');res.end('{"ok":true}');
    } catch (err) {res.writeHead(400, {'Content-Type':'application/json'});res.end(JSON.stringify({error:err.message}));}
    finally {loginBusy = false;}
    return;
  }
  res.writeHead(404);res.end();
});
server.requestTimeout = 20000;
const wss = new WebSocketServer({noServer:true, maxPayload:16384});
server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/console' || !authorized(req, nonce)) {socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
});
wss.on('connection', ws => {
  clearTimeout(idleTimer);clients.add(ws);
  send(ws, {t:'target', name:cfg.host});send(ws, {t:'status', message:status});
  if (lastFrame) ws.send(lastFrame);
  ensureConsole().catch(err => send(ws, {t:'error', message:err.message}));
  ws.on('message', data => {
    try {
      const m = JSON.parse(data), c = consoleClient;
      if (m.t === 'reconnect') ensureConsole().catch(err => send(ws, {t:'error', message:err.message}));
      if (!c?.telnet) return;
      if (m.t === 'refresh') c.refresh();
      if (m.t === 'key' && Array.isArray(m.keys) && m.keys.length <= 14 && m.keys.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) c.keyboard(m.keys);
      if (m.t === 'mouse' && Number.isFinite(m.x) && Number.isFinite(m.y) && m.x >= 0 && m.x <= 1 && m.y >= 0 && m.y <= 1 && Number.isInteger(m.buttons)) c.mouse(m.x,m.y,m.buttons & 7);
    } catch (err) {send(ws, {t:'error', message:err.message});}
  });
  ws.on('error', () => ws.close());
  ws.on('close', () => {
    clients.delete(ws);releaseInput();
    if (!clients.size) idleTimer = setTimeout(() => {if (!clients.size) consoleClient?.close();}, 3000);
  });
});
setInterval(() => {
  const c = consoleClient;
  if (!c?.dirty || !c.frame) return;
  c.dirty = false;lastFrame = c.png();
  for (const ws of clients) if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 1024*1024) ws.send(lastFrame);
}, 125).unref();
function stop() {
  releaseInput();consoleClient?.close();for (const ws of clients) ws.close();
  server.close(() => process.exit());setTimeout(() => process.exit(), 1000).unref();
}
process.on('SIGINT', stop);process.on('SIGTERM', stop);
server.listen(8088, '0.0.0.0', () => console.log('HP iLO Genie browser console listening on :8088'));
