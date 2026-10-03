'use strict';
const path = require('node:path');
function config(env = process.env) {
  const host = env.ILO_HOST;
  if (!host || host.length > 253 || !/^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(host)) {
    throw Error('Set ILO_HOST to the iLO IPv4 address or DNS hostname.');
  }
  const port = Number(env.ILO_PORT || 443);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid ILO_PORT.');
  const cipher = env.ILO_CIPHER || 'DES-CBC3-SHA';
  if (!/^[A-Za-z0-9:+!@=._-]+$/.test(cipher)) throw Error('Invalid ILO_CIPHER.');
  const connectHost = env.ILO_CONNECT_HOST || host;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(connectHost)) throw Error('Invalid ILO_CONNECT_HOST.');
  const consolePort = env.ILO_CONSOLE_PORT ? Number(env.ILO_CONSOLE_PORT) : null;
  if (consolePort !== null && (!Number.isInteger(consolePort) || consolePort < 1 || consolePort > 65535)) throw Error('Invalid ILO_CONSOLE_PORT.');
  return {host, connectHost, consolePort, port, cipher, dataDir: env.DATA_DIR || '/data',
    sessionFile: env.ILO_SESSION_FILE || null,
    publicDir: path.join(__dirname, '../public')};
}
module.exports = {config};
