/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS preload for tests */
// Preload for scripts/test-alert-flow.ts: points the app's Supabase client at the
// in-memory fake. Run with --conditions=react-server so "server-only" is a no-op.
const Module = require("node:module");
const path = require("node:path");
const fake = path.join(__dirname, "supabase.ts");
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === "../supabase" || request === "@/lib/supabase") return fake;
  return orig.call(this, request, parent, ...rest);
};
