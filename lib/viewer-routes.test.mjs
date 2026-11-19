import test from 'node:test';
import assert from 'node:assert/strict';
import { viewerRoute } from './viewer-routes.mjs';

const id = '123e4567-e89b-12d3-a456-426614174000';

test('viewer proxy permits only read routes and blocks every mutation method', () => {
  assert.deepEqual(viewerRoute('/', 'GET'), { kind: 'upstream' });
  assert.deepEqual(viewerRoute(`/api/runs/${id}/diff`, 'GET'), { kind: 'upstream' });
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    assert.equal(viewerRoute('/api/runs', method), null);
    assert.equal(viewerRoute(`/api/runs/${id}/repair`, method), null);
  }
});

test('viewer preflight is answered locally and mutating endpoints are not allowlisted', () => {
  assert.deepEqual(viewerRoute('/api/preflight', 'GET'), { kind: 'preflight' });
  assert.equal(viewerRoute('/api/runs', 'POST'), null);
  assert.equal(viewerRoute(`/api/runs/${id}/verify`, 'GET'), null);
  assert.equal(viewerRoute('/api/secret', 'GET'), null);
  assert.equal(viewerRoute('/../.patchloop/state.json', 'GET'), null);
});
