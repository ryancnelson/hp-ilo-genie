'use strict';
function localHost(host) {
  return /^(localhost|127\.0\.0\.1)(:[0-9]{1,5})?$/.test(host || '');
}
function authorized(req, nonce) {
  return localHost(req.headers.host) && req.headers.origin === 'http://' + req.headers.host &&
    String(req.headers.cookie || '').split(';').some(c => c.trim() === 'iloGenie=' + nonce);
}
module.exports = {localHost, authorized};
