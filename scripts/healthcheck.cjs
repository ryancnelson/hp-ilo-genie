const http = require('node:http');
const req = http.get('http://127.0.0.1:8088/health', res => {
  res.resume();process.exitCode = res.statusCode === 200 ? 0 : 1;
});
req.setTimeout(3000, () => req.destroy());
req.on('error', () => {process.exitCode = 1;});
