/* test-math.js — metric tests for index.html, no browser needed.
 *
 * index.html stays a single file, so this pulls the maths out of it by name and
 * runs it on synthetic traces whose answers are known by construction.
 * Run: node test-math.js
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

/* Lift a top-level function or const-array out of the app source by brace matching. */
function lift(name, kind = 'fn') {
  const start = src.indexOf(kind === 'fn' ? `function ${name}(` : `const ${name}`);
  if (start < 0) throw new Error(`test-math: could not find ${name} in index.html`);
  const [open, close] = kind === 'fn' ? ['{', '}'] : ['[', ']'];
  let depth = 0;
  for (let i = src.indexOf(open, start); i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`test-math: unbalanced ${open}${close} in ${name}`);
}

/* Square canvas so aspect === 1 and the expected numbers stay exact. */
const { analyse, smooth, otsu } = new Function(`
  const ov = { width: 720, height: 720 };
  let rejected = 0;
  ${lift('LIMBS', 'arr')};
  ${lift('smooth')}
  ${lift('otsu')}
  ${lift('analyse')}
  return { analyse, smooth, otsu };
`)();

/* ---------- fixtures ---------- */

const FPS = 30;

/* One frame. `limbs` maps a landmark index to {x,y}; everything else sits at origin. */
function frame(t, com, limbs = {}, torso = 1) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0, y: 0 }));
  for (const [i, p] of Object.entries(limbs)) lm[i] = p;
  return { t, com, torso, lm, conf: 1 };
}

/* A clip where `movers` (landmark indices) travel fast during [t0,t1] and are
   still otherwise. COM is supplied by comAt(t). */
function clip(seconds, comAt, bursts) {
  const F = [];
  const pos = {};                                   // landmark -> current {x,y}
  for (const L of [15, 16, 27, 28]) pos[L] = { x: 0, y: 0 };
  for (let n = 0; n <= seconds * FPS; n++) {
    const t = n / FPS;
    for (const b of bursts) {
      if (t >= b.t0 && t < b.t1) {
        for (const L of b.movers) pos[L] = { x: pos[L].x + 0.05, y: pos[L].y };
      }
    }
    F.push(frame(t, comAt(t), JSON.parse(JSON.stringify(pos))));
  }
  return F;
}

const rising = (seconds) => (t) => ({ x: 0, y: 1 - t / seconds });   // y grows downward

/* ---------- assertions ---------- */

let failed = 0, passed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ''}`); }
}
const near = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol;

/* A throw inside one group is a failure of that group, not the end of the run. */
function section(name, body) {
  console.log(`\n${name}`);
  try { body(); }
  catch (e) { failed++; console.log(`  FAIL ${name} threw\n         ${e.message}`); }
}

function unionOf(moves) {
  let total = 0, cur = null;
  for (const m of [...moves].sort((a, b) => a.t0 - b.t0)) {
    if (cur && m.t0 <= cur[1]) cur[1] = Math.max(cur[1], m.t1);
    else { if (cur) total += cur[1] - cur[0]; cur = [m.t0, m.t1]; }
  }
  return cur ? total + (cur[1] - cur[0]) : 0;
}

/* ---------- tests ---------- */

section('smooth / otsu', () => {
  check('smooth preserves length', smooth([1, 2, 3, 4, 5], 3).length === 5);
  check('smooth leaves a constant alone', smooth([7, 7, 7, 7], 3).every(v => near(v, 7, 1e-9)));
  const t = otsu([0, 0, 0, 0, 0, 5, 5, 5, 5, 5]);
  check('otsu splits a bimodal signal', t > 0 && t < 5, `threshold=${t}`);
});

section('analyse() runs at all', () => {
  /* Regression: `med` was referenced after per-frame torso scaling replaced it,
     so analyse() threw ReferenceError on every clip. */
  let err = null;
  try { analyse(clip(4, rising(4), [{ t0: 1, t1: 2, movers: [15] }])); }
  catch (e) { err = e; }
  check('no undefined identifiers', err === null, err && String(err.message));
});

section('path economy', () => {
  const straight = analyse(clip(4, rising(4), [{ t0: 1, t1: 2, movers: [15] }]));
  check('straight-line COM gives economy ~1', near(straight.economy, 1, 0.05),
        `got ${straight.economy}`);

  const zig = analyse(clip(4, (t) => ({ x: 0.3 * Math.sin(t * 8), y: 1 - t / 4 }),
                            [{ t0: 1, t1: 2, movers: [15] }]));
  check('wandering COM scores worse than straight', zig.economy > straight.economy,
        `zig=${zig.economy} straight=${straight.economy}`);

  /* Guard: a boulder that finishes near its start has a near-zero denominator. */
  const loop = analyse(clip(4, (t) => ({ x: 0, y: 1 - 0.3 * Math.sin(t * Math.PI / 4) }),
                             [{ t0: 1, t1: 2, movers: [15] }]));
  check('near-zero net displacement yields NaN, not a huge number',
        !Number.isFinite(loop.economy), `got ${loop.economy}`);
});

section('static ratio', () => {
  /* Two limbs moving over the SAME window. Summing burst durations double-counts
     that window; only the union is wall-clock time. */
  const A = analyse(clip(4, rising(4), [
    { t0: 1.0, t1: 2.0, movers: [15, 16] },
  ]));

  const sum = A.moves.reduce((s, m) => s + (m.t1 - m.t0), 0);
  const uni = unionOf(A.moves);

  check('fixture actually overlaps (else this test proves nothing)', sum > uni + 1e-6,
        `sum=${sum.toFixed(3)} union=${uni.toFixed(3)}`);
  check('static ratio is built from the union, not the sum',
        near(A.staticRatio, 1 - uni / A.duration, 1e-6),
        `got ${A.staticRatio.toFixed(4)}, union says ${(1 - uni / A.duration).toFixed(4)}, ` +
        `sum would say ${(1 - sum / A.duration).toFixed(4)}`);
  check('static ratio stays in [0,1]', A.staticRatio >= 0 && A.staticRatio <= 1);
  check('a mostly-still clip is not reported as 0% static', A.staticRatio > 0.2,
        `got ${(A.staticRatio * 100).toFixed(0)}%`);
});

section('move segmentation', () => {
  const A = analyse(clip(6, rising(6), [
    { t0: 1.0, t1: 1.6, movers: [15] },
    { t0: 3.0, t1: 3.6, movers: [16] },
    { t0: 4.5, t1: 5.1, movers: [27] },
  ]));
  check('finds roughly one burst per limb motion', A.moves.length >= 3 && A.moves.length <= 5,
        `got ${A.moves.length}`);
  check('bursts are ordered by start time',
        A.moves.every((m, i) => i === 0 || m.t0 >= A.moves[i - 1].t0));
  check('every burst clears the minimum duration',
        A.moves.every(m => m.t1 - m.t0 >= 0.13));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
