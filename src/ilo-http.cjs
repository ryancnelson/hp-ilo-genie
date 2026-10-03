'use strict';
const http = require('node:http');
function iloRequest(endpoint, {token, body, method = 'GET'} = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const headers = {Connection: 'close'};
    if (token) headers.Cookie = 'sessionKey=' + token;
    if (payload) Object.assign(headers, {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload)});
    const req = http.request({hostname:'127.0.0.1', port:8080, path:endpoint, method, headers, timeout:15000}, res => {
      let text = '';
      res.on('data', chunk => {text += chunk; if (text.length > 1024*1024) req.destroy(Error('iLO response too large.'));});
      res.on('error', reject);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) throw Error('iLO returned HTTP ' + res.statusCode + '. Sign in again if the session expired.');
          resolve(JSON.parse(text));
        } catch (err) {reject(err instanceof SyntaxError ? Error('iLO returned an invalid response. Check the target and TLS bridge.') : err);}
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(Error('iLO request timed out. Check network access and the selected cipher.')));
    req.end(payload);
  });
}
module.exports = {iloRequest};
