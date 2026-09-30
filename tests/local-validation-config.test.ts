import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import config from '../playwright.config.js';

test('managed browser fixtures isolate their destructive resets from the regular player save',()=>{
  const server=config.webServer;
  assert.ok(server&&!Array.isArray(server));
  assert.equal(server.env?.WORLD_DB_PATH,fileURLToPath(new URL('../data/latticefolk.e2e.sqlite',import.meta.url)));
  assert.notEqual(server.env?.WORLD_DB_PATH,fileURLToPath(new URL('../data/latticefolk.sqlite',import.meta.url)));
  assert.equal(server.reuseExistingServer,false,'never reset an already-running user server');
  assert.equal(config.workers,1,'the suite intentionally shares one isolated world');
  assert.equal(config.fullyParallel,false);
});
