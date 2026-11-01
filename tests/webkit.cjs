// 시험 파일을 고치지 않고 사파리 엔진(webkit)으로 돌린다: require('playwright').chromium 을 webkit 으로 바꿔 끼운다
const Module = require('module'); const load = Module._load;
Module._load = function(req, ...a){ const m = load.call(this, req, ...a); if (req === 'playwright') return new Proxy(m, {get: (t, k) => k === 'chromium' ? t.webkit : t[k]}); return m; };
