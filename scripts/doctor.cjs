const net = require('node:net');
const {spawnSync} = require('node:child_process');
const cfg = require('../src/config.cjs').config();
console.log('Legacy client:', spawnSync(process.env.LEGACY_OPENSSL, ['version'], {encoding:'utf8'}).stdout.trim());
console.log('Target:', cfg.host + ':' + cfg.port, 'Cipher:', cfg.cipher);
const socket = net.connect(cfg.port, cfg.connectHost);
socket.setTimeout(4000);
socket.on('connect', () => {console.log('iLO TCP reachable.');socket.destroy();});
socket.on('timeout', () => socket.destroy(Error('TCP timeout')));
socket.on('error', err => {console.error(err.message);process.exitCode = 1;});
const tls = spawnSync(process.env.LEGACY_OPENSSL, ['s_client','-connect',`${cfg.connectHost}:${cfg.port}`,'-cipher',cfg.cipher], {input:'', encoding:'utf8',timeout:10000});
const output = (tls.stdout || '') + (tls.stderr || '');
for (const line of output.split('\n')) if (/Protocol\s*:|Cipher\s*:|New,.*Cipher is/.test(line)) console.log(line.trim());
if (tls.error || !/Cipher\s*:\s*(?!0000|NONE)\S+|Cipher is (?!\(NONE\))\S+/.test(output)) {
  console.error('Legacy TLS handshake did not succeed.');process.exitCode = 1;
}
