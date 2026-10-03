'use strict';
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const tls = require('node:tls');
const {spawn, spawnSync} = require('node:child_process');
const cfg = require('./config.cjs').config();
process.umask(0o077);
fs.mkdirSync(cfg.dataDir, {recursive:true});
const cert = path.join(cfg.dataDir, 'localhost.crt');
const key = path.join(cfg.dataDir, 'localhost.key');
const valid = fs.existsSync(key) && fs.existsSync(cert) && spawnSync('openssl', ['x509','-checkend','86400','-noout','-in',cert], {stdio:'ignore'}).status === 0;
if (!valid) {
  const result = spawnSync('openssl', ['req','-x509','-newkey','rsa:2048','-sha256','-nodes','-days','365',
    '-keyout',key,'-out',cert,'-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1',
    '-addext','basicConstraints=critical,CA:FALSE','-addext','extendedKeyUsage=serverAuth'], {stdio:'pipe'});
  if (result.status !== 0) throw Error('Could not generate the localhost TLS certificate. Check DATA_DIR permissions.');
}
const children = new Set(), sockets = new Set();let stopping = false;
function upstream(socket) {
  sockets.add(socket);
  const child = spawn(process.env.LEGACY_OPENSSL || '/opt/legacy/bin/openssl',
    ['s_client','-quiet','-no_ign_eof','-connect',`${cfg.connectHost}:${cfg.port}`,'-cipher',cfg.cipher], {stdio:['pipe','pipe','pipe']});
  children.add(child);
  socket.setTimeout(120000, () => socket.destroy());
  socket.on('error', () => socket.destroy());
  socket.on('close', () => {sockets.delete(socket);child.kill('SIGTERM');});
  child.on('error', err => {console.error('Legacy TLS client:',err.message);socket.destroy();});
  child.on('close', () => {children.delete(child);socket.end();});
  child.stdin.on('error', () => socket.destroy());
  child.stdout.on('error', () => socket.destroy());
  // HTTP streams can contain credentials. Only optional TLS diagnostics are logged.
  child.stderr.on('data', data => {if (process.env.DEBUG) process.stderr.write(data);});
  socket.pipe(child.stdin);child.stdout.pipe(socket);
}
const internal = net.createServer(upstream);
const management = tls.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert),minVersion:'TLSv1.2'}, upstream);
management.on('tlsClientError', () => {});
function stop(code = 0) {
  if (stopping) return;stopping = true;
  internal.close();management.close();
  for (const socket of sockets) socket.destroy();
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 1200);
}
for (const server of [internal,management]) server.on('error', err => {console.error(err.message);stop(1);});
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => stop());
management.listen(8443, '0.0.0.0');
internal.listen(8080, '127.0.0.1', () => {
  const child = spawn(process.execPath, [path.join(__dirname,'server.cjs')], {stdio:'inherit'});children.add(child);
  child.on('error', err => {console.error(err.message);stop(1);});
  child.on('exit', code => {children.delete(child);if (!stopping) {console.error(`Console server exited (${code}).`);stop(1);}});
});
console.log(`hp-ilo-genie → ${cfg.host}:${cfg.port}; console :8088; management TLS :8443`);
