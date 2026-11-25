import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Parity guard for Phase 3 slice 6 (per-session collections): every collection
// command the client invokes must be whitelisted in the server command dispatch
// (t_server.rs), and the client must refresh collections on the SSE
// `collections-changed` event the server emits after collection writes.
const apiSrc = fs.readFileSync(new URL('../src/common/api.js', import.meta.url), 'utf8');
const serverSrc = fs.readFileSync(new URL('../../src-tauri/src/t_server.rs', import.meta.url), 'utf8');
const traySrc = fs.readFileSync(new URL('../src/components/CollectionTray.vue', import.meta.url), 'utf8');

const COLLECTION_COMMANDS = [
  'list_collections',
  'get_collection_counts',
  'create_collection',
  'rename_collection',
  'delete_collection',
  'reorder_collections',
  'add_files_to_collection',
  'remove_files_from_collection',
  'get_collection_selection_counts',
  'clear_collection',
  'get_collection_file_ids',
  'get_file_collections',
  'get_collection_count_and_sum',
  'get_collection_files',
  'get_collection_grouped_query_rows',
  'get_collection_group_file_ids',
  'get_collection_query_file_ids',
];

test('every client collection command is invoked through the transport', () => {
  for (const cmd of COLLECTION_COMMANDS) {
    assert.ok(
      apiSrc.includes(`invoke('${cmd}'`),
      `api.js must call invoke('${cmd}', ...) so remote mode reaches the server`,
    );
  }
});

test('every collection command is whitelisted in the server dispatch', () => {
  for (const cmd of COLLECTION_COMMANDS) {
    assert.ok(
      serverSrc.includes(`"${cmd}" =>`),
      `t_server.rs must whitelist "${cmd}" in handle_cmd`,
    );
  }
});

test('server emits collections-changed on collection writes and client listens for it', () => {
  for (const write of ['create_collection', 'rename_collection', 'delete_collection', 'reorder_collections', 'add_files_to_collection', 'remove_files_from_collection', 'clear_collection']) {
    assert.ok(serverSrc.includes(`"${write}"`), `server handles ${write}`);
  }
  assert.ok(serverSrc.includes('"collections-changed"'), 'server broadcasts collections-changed over SSE');
  assert.ok(traySrc.includes("'collections-changed'"), 'CollectionTray listens for collections-changed');
});

test('server scopes collections by session (session_id column + scope helpers)', () => {
  const sqliteSrc = fs.readFileSync(new URL('../../src-tauri/src/t_sqlite.rs', import.meta.url), 'utf8');
  assert.ok(sqliteSrc.includes('session_read_scope'), 'read scope helper exists');
  assert.ok(sqliteSrc.includes('session_write_scope'), 'write scope helper exists');
  assert.ok(sqliteSrc.includes('ALTER TABLE acollections ADD COLUMN session_id'), 'migration for existing DBs');
  assert.ok(sqliteSrc.includes('CURRENT_SESSION_ID') || fs.readFileSync(new URL('../../src-tauri/src/t_config.rs', import.meta.url), 'utf8').includes('CURRENT_SESSION_ID'), 'session global exists');
});
