const {test} = require('node:test');
const assert = require('node:assert/strict');
const {config} = require('../src/config.cjs');
const {authorized, localHost} = require('../src/security.cjs');
test('target configuration rejects URLs, command fragments, and invalid ports', () => {
  assert.equal(config({ILO_HOST:'192.0.2.10'}).port,443);
  for (const host of ['', 'https://ilo.example', 'ilo;id', '-connect', 'ilo\nfoo']) assert.throws(() => config({ILO_HOST:host}));
  assert.throws(() => config({ILO_HOST:'ilo.example',ILO_PORT:'99999'}));
});
test('control requests require matching loopback origin and cookie', () => {
  const req = (host, origin, cookie) => ({headers:{host,origin,cookie}});
  assert.ok(authorized(req('localhost:8088','http://localhost:8088','iloGenie=abc'),'abc'));
  assert.ok(authorized(req('127.0.0.1:8089','http://127.0.0.1:8089','iloGenie=abc'),'abc'));
  assert.equal(authorized(req('localhost:8088','https://example.com','iloGenie=abc'),'abc'),false);
  assert.equal(authorized(req('evil.example:8088','http://evil.example:8088','iloGenie=abc'),'abc'),false);
  assert.equal(authorized(req('localhost:8088','http://localhost:8088','iloGenie=bad'),'abc'),false);
  assert.equal(authorized(req('localhost:8088',undefined,'iloGenie=abc'),'abc'),false);
  assert.equal(localHost('localhost.evil.example'),false);
});
