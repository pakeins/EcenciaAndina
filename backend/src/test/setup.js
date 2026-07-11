// setup.js - Vitest global setup file
// Each test file that needs a fresh module should do its own
// `delete require.cache[require.resolve('...')]` locally.
// A blanket cache-clear of all routes here forces every heavy module
// (e.g. telegram.js with 2000+ lines) to be re-parsed for all 49 test files,
// causing ~24s of unnecessary import overhead.
