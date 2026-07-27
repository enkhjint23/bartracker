/* BarTrack — personal bar exam prep tracker
   Static, offline-capable, no backend. Progress lives in localStorage. */

'use strict';

/* ============================================================
   1. CONSTANTS & HELPERS
   ============================================================ */

const STORE_KEY = 'bartrack.v1';
const NEW_SHARE = 0.8;          // share of daily capacity spent on new material
const REVIEW_RATIO = 0.25;      // review re-tests 25% of a past day's questions
const MOCK_SIZE = 100;          // questions in a final-sprint mock exam
const MOCK_EVERY = 4;           // MCQ mock every Nth sprint day (case papers take the rest)

const WD_MN = ['Ня', 'Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя'];
const WD_FULL = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'];

const TYPE_META = {
  new:    { label: 'Шинэ материал',      color: '#5a63f0', tag: 'ШИНЭ',    bg: '#eef1fe', fg: '#5a63f0' },
  review: { label: 'Давталт',            color: '#8f7ff5', tag: 'ДАВТ',    bg: '#f0edfe', fg: '#6d5bd0' },
  case:   { label: 'Шүүхийн шийдвэр',    color: '#e0821b', tag: 'ШИЙДВЭР', bg: '#fff2e0', fg: '#c56d10' },
  mock:   { label: 'Сорилго шалгалт',    color: '#cc4038', tag: 'СОРИЛ',   bg: '#ffe1df', fg: '#cc4038' },
  weak:   { label: 'Сул талын давталт',  color: '#189150', tag: 'СУЛ',     bg: '#e6f7ee', fg: '#178a4c' },
  custom: { label: 'Миний даалгавар',    color: '#6a7089', tag: 'МИНИЙ',   bg: '#f0f1f7', fg: '#5a6079' },
  model:  { label: 'Жишиг хариулт судлах', color: '#0f8a8a', tag: 'ЖИШИГ',  bg: '#e2f6f6', fg: '#0c7070' },
  nav:    { label: 'Хуулийн индекс бэлдэх', color: '#7a5cd0', tag: 'ИНДЕКС', bg: '#f0ecfb', fg: '#5f45ad' },
  casework:{label: 'Кейс бодох',          color: '#c2185b', tag: 'КЕЙС',    bg: '#fde8f0', fg: '#a3134c' },
};
const TYPE_ORDER = ['casework', 'model', 'nav', 'new', 'review', 'case', 'mock', 'weak', 'custom'];

/* The three branches the written case paper is drawn from. */
const BRANCHES = [
  { key: 'crim', name: 'Эрүүгийн эрх зүй',
    codes: ['Эрүүгийн хууль', 'Эрүүгийн хэрэг хянан шийдвэрлэх тухай хууль'] },
  { key: 'civ',  name: 'Иргэний эрх зүй',
    codes: ['Иргэний хууль', 'Иргэний хэрэг шүүхэд хянан шийдвэрлэх тухай хууль'] },
  { key: 'adm',  name: 'Захиргааны эрх зүй',
    codes: ['Захиргааны ерөнхий хууль', 'Захиргааны хэрэг шүүхэд хянан шийдвэрлэх тухай хууль'] },
];

/* Court-decision study links, surfaced on ШИЙДВЭР tasks. */
const CASE_LINKS = [
  ['Тайлбар, зөвлөмж, тойм', 'https://www.supremecourt.mn/mn/home?page=advice&id=15&pr=0&tp=list&h=0'],
  ['Шийдвэрийн хураангуй — Эрүүгийн', 'https://www.supremecourt.mn/mn/home?page=pages&id=116&pr=115&tp=list&h=0'],
  ['Шийдвэрийн хураангуй — Иргэний', 'https://www.supremecourt.mn/mn/home?page=pages&id=117&pr=115&tp=list&h=0'],
  ['Шийдвэрийн хураангуй — Захиргааны', 'https://www.supremecourt.mn/mn/home?page=pages&id=118&pr=115&tp=list&h=0'],
  ['Хяналтын шатны тогтоол', 'https://www.supremecourt.mn/mn/home?page=courtjment&id=16&pr=166&tp=list&h=0'],
  ['Шүүгчийн тусгай санал', 'https://www.supremecourt.mn/mn/home?page=courtorder&id=167&pr=166&tp=list&h=0'],
  ['Бүрэн эх — shuukh.mn', 'https://shuukh.mn/'],
];

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const iso   = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const dayCount = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
const fmtDate  = s => { const d = parse(s); return `${d.getFullYear()} оны ${d.getMonth() + 1}-р сарын ${d.getDate()}, ${WD_FULL[d.getDay()]}`; };
const fmtShort = s => { const d = parse(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
const todayISO = () => iso(new Date());

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ============================================================
   2. STATE
   ============================================================ */

const DEFAULTS = {
  settings: {
    startDate: '2026-07-27',
    examDate:  '2026-10-10',
    weekdayQ:  85,
    weekendQ:  128,
    restDays:  [],          // 0=Sun … 6=Sat
    tailDays:  12,          // final sprint length
    minPerQ:   1.2,
    notifyTime: '20:00',
    notifyEnabled: false,
    casesPerWeek: 3,       // court decisions to brief each week
    casesPerSession: 2,    // decisions per ШИЙДВЭР task
    examTestPoints: 40,    // points for the MCQ paper
    examCasePoints: 60,    // points for the 3 written cases
    examPassMark: 70,      // total needed to pass
    examTestQ: 200,        // questions drawn at random from the bank
    baseTest: 31,          // last attempt, for reference
    baseCase: 36,
    caseTrack: true,       // timed written-case practice
    caseMinutes: 120,      // exam allows 2h per case
    openBook: true,        // case paper is open-book
  },
  custom: {},              // custom[dateISO] = [{id,name,type,q,unit,note}]
  // log[dateISO] = { tasks: { taskId: {topicId,type,q,correct,done} }, hours: n, note: '' }
  log: {},
  lastNotified: null,
};

let S = load();
let ui = { view: 'today', calMonth: null, calYear: null, selDay: null, sylFilter: 'all', sylQuery: '' };

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const parsed = JSON.parse(raw);
    return {
      settings: { ...DEFAULTS.settings, ...(parsed.settings || {}) },
      log: parsed.log || {},
      custom: parsed.custom || {},
      lastNotified: parsed.lastNotified || null,
    };
  } catch (e) {
    console.warn('Хадгалсан өгөгдөл уншигдсангүй, шинээр эхэлж байна.', e);
    return structuredClone(DEFAULTS);
  }
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(S));
  } catch (e) {
    toast('Хадгалж чадсангүй — санах ой дүүрсэн байж магадгүй.');
  }
}

function dayLog(date) {
  if (!S.log[date]) S.log[date] = { tasks: {}, hours: 0, note: '' };
  if (!S.log[date].tasks) S.log[date].tasks = {};
  return S.log[date];
}

/* ============================================================
   3. SCHEDULER
   ============================================================ */

let PLAN = null;   // { days: Map<dateISO, dayPlan>, order: [dateISO], milestones: [], stats: {} }

/* Projected exam score from measured performance.
   Recent work predicts better than lifetime averages, so both are reported. */
function projection() {
  const st = S.settings;
  const cutoff = iso(addDays(new Date(), -21));

  let aAll = 0, cAll = 0, aRec = 0, cRec = 0;
  const caseAll = [], caseRec = [];
  for (const date in S.log) {
    const tasks = S.log[date].tasks || {};
    for (const id in tasks) {
      const t = tasks[id];
      if (t.total > 0) {
        aAll += t.total; cAll += t.correct || 0;
        if (date >= cutoff) { aRec += t.total; cRec += t.correct || 0; }
      }
      if (t.selfScore != null) {
        caseAll.push(t.selfScore);
        if (date >= cutoff) caseRec.push(t.selfScore);
      }
    }
  }
  const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

  const testAcc = aRec >= 100 ? cRec / aRec : (aAll >= 50 ? cAll / aAll : null);
  const caseAcc = caseRec.length >= 2 ? mean(caseRec) / 100 : (caseAll.length ? mean(caseAll) / 100 : null);

  const testPts = testAcc === null ? null : testAcc * st.examTestPoints;
  const casePts = caseAcc === null ? null : caseAcc * st.examCasePoints;
  const total = (testPts === null && casePts === null) ? null : (testPts || 0) + (casePts || 0);

  // 95% sampling band on the MCQ paper — 200 questions is a small draw
  let band = null;
  if (testAcc !== null) {
    const sd = Math.sqrt(st.examTestQ * testAcc * (1 - testAcc)) / st.examTestQ;
    band = 2 * sd * st.examTestPoints;
  }
  // what the other half has to deliver, given where this half sits
  const needTest = casePts === null ? null : st.examPassMark - casePts;
  const needCase = testPts === null ? null : st.examPassMark - testPts;

  return {
    testAcc, caseAcc, testPts, casePts, total, band,
    needTest, needCase,
    testN: aRec >= 100 ? aRec : aAll, caseN: caseRec.length >= 2 ? caseRec.length : caseAll.length,
    pass: st.examPassMark, maxT: st.examTestPoints, maxC: st.examCasePoints,
    baseTotal: st.baseTest + st.baseCase,
  };
}

const num = (v, d = 1) => v === null ? '—' : v.toFixed(d);

/* Recorded accuracy for a topic, or null if untested. Read by the scheduler. */
function accuracyOf(topicId) {
  if (!topicId) return null;
  let a = 0, c = 0;
  for (const date in S.log) {
    const tasks = S.log[date].tasks || {};
    for (const id in tasks) {
      const t = tasks[id];
      if (t.topicId === topicId && t.total > 0) { a += t.total; c += t.correct || 0; }
    }
  }
  return a >= 10 ? c / a : null;
}

/* Only genuine question tasks count toward the daily test total. */
const qSum = tasks => tasks.reduce((a, t) => a + (t.counts === false ? 0 : t.q), 0);

/* Estimated minutes for a day: questions at minPerQ, plus any fixed-length blocks. */
function dayMinutes(date) {
  const tasks = tasksFor(date);
  const q = qSum(tasks) * S.settings.minPerQ;
  const fixed = tasks.reduce((a, t) => a + (t.minutes || 0), 0);
  const briefs = tasks.filter(t => t.type === 'case').reduce((a, t) => a + t.q * 20, 0);
  const study = tasks.filter(t => t.type === 'model' || t.type === 'nav').reduce((a, t) => a + t.q * 25, 0);
  return Math.round(q + fixed + briefs + study);
}
const hm = m => `${Math.floor(m / 60)}ц ${m % 60}м`;

function capacityFor(date, st) {
  const dow = date.getDay();
  if (st.restDays.includes(dow)) return 0;
  return (dow === 0 || dow === 6) ? st.weekendQ : st.weekdayQ;
}

function buildPlan() {
  const st = S.settings;
  const start = parse(st.startDate);
  const exam = parse(st.examDate);
  const total = dayCount(st.startDate, st.examDate);

  if (total < 3) {
    PLAN = { days: new Map(), order: [], milestones: [], stats: { error: 'Шалгалтын өдөр эхлэх өдрөөс хойш байх ёстой.' } };
    return PLAN;
  }

  const tailStart = addDays(exam, -st.tailDays);

  // --- enumerate days ---
  const days = new Map(), order = [];
  for (let i = 0; i < total; i++) {
    const d = addDays(start, i);
    const key = iso(d);
    const cap = capacityFor(d, st);
    days.set(key, {
      date: key, idx: i, cap,
      rest: cap === 0,
      phase: d >= tailStart ? 'sprint' : 'content',
      tasks: [], plannedQ: 0,
    });
    order.push(key);
  }

  const contentDays = order.filter(k => days.get(k).phase === 'content' && !days.get(k).rest);
  const sprintDays  = order.filter(k => days.get(k).phase === 'sprint'  && !days.get(k).rest);

  // --- fill content days with new material, in syllabus order ---
  const queue = SYLLABUS.topics.map(t => ({ ...t, left: t.q, cursor: 0 }));
  let qi = 0;
  const finishedOn = {};   // dateISO -> [topicId]

  for (const key of contentDays) {
    const day = days.get(key);
    let budget = Math.round(day.cap * NEW_SHARE);
    let n = 0;
    while (budget > 0 && qi < queue.length) {
      const t = queue[qi];
      const chunk = Math.min(budget, t.left);
      const from = t.cursor + 1, to = t.cursor + chunk;
      day.tasks.push({
        id: `${key}#n${n++}`, type: 'new', topicId: t.id, name: t.name,
        part: t.part, group: t.groupName, q: chunk,
        range: chunk < t.q ? `${from}–${to} дугаар тест` : `бүх ${t.q} тест`,
      });
      t.left -= chunk; t.cursor += chunk; budget -= chunk;
      if (t.left === 0) {
        (finishedOn[key] ||= []).push(t.id);
        qi++;
      }
    }
    day.plannedQ = qSum(day.tasks);
  }

  const unscheduled = queue.slice(qi).reduce((a, t) => a + t.left, 0);

  // --- spaced repetition: revisit day-7 and day-21 material ---
  const contentSet = new Set(contentDays);
  for (const key of contentDays) {
    const day = days.get(key);
    let budget = day.cap - day.plannedQ;
    if (budget <= 0) continue;
    let n = 0;
    for (const back of [7, 21]) {
      const srcKey = iso(addDays(parse(key), -back));
      if (!contentSet.has(srcKey)) continue;
      const src = days.get(srcKey);
      for (const t of src.tasks.filter(x => x.type === 'new')) {
        if (budget < 5) break;
        // Weight review by measured accuracy: weak topics get re-tested harder,
        // topics you've already mastered get a token pass.
        const acc = accuracyOf(t.topicId);
        const mult = acc === null ? 1 : acc < 0.6 ? 1.8 : acc < 0.75 ? 1.4 : acc < 0.85 ? 1 : 0.4;
        const q = Math.min(budget, Math.max(5, Math.round(t.q * REVIEW_RATIO * mult)));
        day.tasks.push({
          id: `${key}#r${n++}`, type: 'review', topicId: t.topicId, name: t.name,
          part: t.part, group: t.group, q,
          range: `${back} хоногийн өмнөх материал`,
        });
        budget -= q;
      }
    }
    day.plannedQ = qSum(day.tasks);
  }

  // --- final sprint: mocks + weak-area drilling ---
  sprintDays.forEach((key, i) => {
    const day = days.get(key);
    let n = 0;
    if (i % MOCK_EVERY === 0) {
      day.tasks.push({
        id: `${key}#m${n++}`, type: 'mock', topicId: null,
        name: `Бүрэн сорилго шалгалт #${Math.floor(i / MOCK_EVERY) + 1}`,
        q: MOCK_SIZE, range: 'Цаг барьж, бодит нөхцөлд', dynamic: false,
      });
    }
    day.tasks.push({
      id: `${key}#w${n++}`, type: 'weak', topicId: null,
      name: 'Сул талын давталт', q: Math.max(20, day.cap - (day.tasks[0]?.q || 0)),
      range: 'Оноо багатай сэдвүүдээс', dynamic: true,
    });
    day.plannedQ = qSum(day.tasks);
  });

  // --- court-decision briefing, spread across each week's study days ---
  const perWeek = clamp(st.casesPerWeek || 0, 0, 7);
  if (perWeek > 0) {
    const studyDays = order.filter(k => !days.get(k).rest);
    const weeks = {};
    for (const k of studyDays) {
      const wk = Math.floor(dayCount(order[0], k) / 7);
      (weeks[wk] ||= []).push(k);
    }
    for (const wk in weeks) {
      const list = weeks[wk];
      const n = Math.min(perWeek, list.length);
      // spread evenly through the week rather than clustering at the start
      for (let i = 0; i < n; i++) {
        const key = list[Math.floor(i * list.length / n)];
        const day = days.get(key);
        const lead = day.tasks.find(t => t.type === 'new') || day.tasks.find(t => t.topicId);
        day.tasks.push({
          id: `${key}#c0`, type: 'case', topicId: null,
          name: lead ? `Шүүхийн шийдвэр — ${lead.name}` : 'Шүүхийн шийдвэрийн тойм',
          q: st.casesPerSession || 2, unit: 'шийдвэр', counts: false, scorable: false,
          range: '5 мөрийн тойм бич: баримт → маргаан → зүйл заалт → үндэслэл → дүрэм',
        });
      }
    }
  }

  // --- written case-solving track ---
  // Weeks are indexed from the start date; branch rotates crim -> civ -> adm.
  const caseDays = [];
  if (st.caseTrack) {
    const studyDays = order.filter(k => !days.get(k).rest);
    const weeks = {};
    for (const k of studyDays) (weeks[Math.floor(dayCount(order[0], k) / 7)] ||= []).push(k);
    const wkKeys = Object.keys(weeks).map(Number).sort((a, b) => a - b);

    // Week 0: reverse-engineer the model answers, one pass per branch.
    // This is the highest-leverage block in the plan — it defines the target
    // that every later case attempt is measured against.
    const w0 = weeks[wkKeys[0]] || [];
    BRANCHES.forEach((b, i) => {
      const key = w0[Math.min(i, w0.length - 1)];
      if (!key) return;
      days.get(key).tasks.push({
        id: `${key}#md${i}`, type: 'model', topicId: null, branch: b.key,
        name: `Жишиг хариулт задлах — ${b.name}`,
        q: 3, unit: 'жишиг', counts: false, scorable: false,
        range: 'Бүтцийг гарга: хэсгүүд, дараалал, эшлэлийн хэлбэр, урт',
      });
    });

    // Weeks 0–1: build the open-book navigation kit, one code at a time.
    const navTargets = BRANCHES.flatMap(b => b.codes.map(c => ({ code: c, branch: b })));
    const navPool = [...(weeks[wkKeys[0]] || []), ...(weeks[wkKeys[1]] || [])];
    navTargets.forEach((t, i) => {
      const key = navPool[Math.floor(i * navPool.length / navTargets.length)];
      if (!key) return;
      days.get(key).tasks.push({
        id: `${key}#nv${i}`, type: 'nav', topicId: null, branch: t.branch.key,
        name: `Индекс, хавчуулга — ${t.code}`,
        q: 1, unit: 'код', counts: false, scorable: false,
        range: 'Нээлттэй ном: хаанаас юу олохоо тэмдэглэ',
      });
    });

    // From week 1 onward: one timed attempt a week, doubling in September.
    wkKeys.slice(1).forEach((wk, i) => {
      const list = weeks[wk];
      const branch = BRANCHES[i % 3];
      // prefer the roomiest day of the week — a 2h block needs space
      const content = list.filter(k => days.get(k).phase === 'content');
      const ranked = [...content].sort((a, b) => days.get(b).cap - days.get(a).cap);
      // Two attempts a week once September starts — the case half needs the reps.
      const reps = (list[0] >= '2026-09-01' ? 2 : 1);
      const picks = ranked.slice(0, reps);
      picks.forEach((pick, r) => {
      const branch2 = BRANCHES[(i + r) % 3];
      const day = days.get(pick);
      day.tasks.push({
        id: `${pick}#cw${r}`, type: 'casework', topicId: null, branch: branch2.key,
        name: `Кейс бодох (${Math.round(st.caseMinutes / 60)} цаг, ${st.openBook ? 'нээлттэй ном' : 'хаалттай'}) — ${branch2.name}`,
        q: 1, unit: 'кейс', counts: false, scorable: false, selfScored: true,
        range: 'Цаг барь. Жишиг хариултын бүтцээр бич',
        minutes: st.caseMinutes,
      });
      caseDays.push(pick);
      // compare against the model answer the next study day
      const nxt = list[list.indexOf(pick) + 1] || (weeks[wk + 1] || [])[0];
      if (nxt && days.get(nxt)) days.get(nxt).tasks.push({
        id: `${nxt}#cm${r}`, type: 'model', topicId: null, branch: branch2.key,
        name: `Жишиг хариулттай харьцуулах — ${branch2.name}`,
        q: 1, unit: 'кейс', counts: false, scorable: false,
        range: 'Юу орхигдсон, юу нэмэлт вэ — зөрүүг тэмдэглэ',
      });
      });
    });
  }

  // --- final sprint: full three-case papers alternating with MCQ mocks ---
  sprintDays.forEach((key, i) => {
    if (!st.caseTrack) return;
    if (i % MOCK_EVERY === 0) return;              // mock day, leave it
    if (i % 3 !== 1) return;
    const day = days.get(key);
    const paper = Math.floor(i / 3) + 1;
    // 6 hours of writing is the day; drop the drilling that would otherwise sit here
    day.tasks = day.tasks.filter(t => t.type === 'model');
    day.tasks.unshift({
      id: `${key}#cp`, type: 'casework', topicId: null,
      name: `Бүрэн кейсийн шалгалт #${paper} — 3 кейс, ${Math.round(st.caseMinutes * 3 / 60)} цаг`,
      q: 3, unit: 'кейс', counts: false, scorable: false, selfScored: true,
      range: 'Шалгалтын нөхцөлөөр: Эрүүгийн + Иргэний + Захиргааны',
      minutes: st.caseMinutes * 3,
    });
  });
  for (const key of order) {
    const d = days.get(key);
    d.plannedQ = qSum(d.tasks);
  }

  // --- milestones ---
  const milestones = [];
  if (st.caseTrack && caseDays.length) {
    milestones.push({ date: caseDays[0], label: 'Эхний цагтай кейс', kind: 'phase' });
  }
  for (const g of SYLLABUS.groups) {
    const last = SYLLABUS.topics.filter(t => t.group === g.id).slice(-1)[0];
    const when = Object.keys(finishedOn).find(k => finishedOn[k].includes(last.id));
    if (when) milestones.push({ date: when, label: `${g.name} (${g.part}-р хэсэг) дуусна`, kind: 'group' });
  }
  if (sprintDays.length) milestones.push({ date: sprintDays[0], label: 'Эцсийн давталт эхэлнэ', kind: 'phase' });
  milestones.push({ date: st.examDate, label: '🏛️ Шалгалтын өдөр', kind: 'exam' });
  milestones.sort((a, b) => a.date.localeCompare(b.date));

  const capacityTotal = contentDays.reduce((a, k) => a + Math.round(days.get(k).cap * NEW_SHARE), 0);

  PLAN = {
    days, order, milestones,
    stats: {
      totalDays: total, contentDays: contentDays.length, sprintDays: sprintDays.length,
      restDays: order.length - contentDays.length - sprintDays.length,
      capacityTotal, unscheduled, totalQ: SYLLABUS.totals.q,
    },
  };
  return PLAN;
}

/* dynamic tasks (weak-area drills) get their topic list at render time */
function weakTopics(limit = 5) {
  const rows = SYLLABUS.topics.map(t => ({ ...t, ...topicStats(t.id) }))
    .filter(t => t.attempted >= 10)
    .map(t => ({ ...t, acc: Math.round(t.correct / t.attempted * 100) }))
    .sort((a, b) => a.acc - b.acc);
  return rows.slice(0, limit);
}

/* ============================================================
   4. DERIVED PROGRESS
   ============================================================ */

function topicStats(topicId) {
  let done = 0, attempted = 0, correct = 0;
  for (const date in S.log) {
    const tasks = S.log[date].tasks || {};
    for (const id in tasks) {
      const t = tasks[id];
      if (t.topicId !== topicId) continue;
      if (t.done) done += t.q || 0;
      if (t.total > 0) { attempted += t.total; correct += t.correct || 0; }
    }
  }
  return { done, attempted, correct };
}

function allTopicStats() {
  const map = {};
  for (const t of SYLLABUS.topics) map[t.id] = { done: 0, attempted: 0, correct: 0 };
  for (const date in S.log) {
    const tasks = S.log[date].tasks || {};
    for (const id in tasks) {
      const t = tasks[id];
      if (!t.topicId || !map[t.topicId]) continue;
      if (t.done) map[t.topicId].done += t.q || 0;
      if (t.total > 0) { map[t.topicId].attempted += t.total; map[t.topicId].correct += t.correct || 0; }
    }
  }
  return map;
}

function dayStats(date) {
  const plan = PLAN.days.get(date);
  const log = S.log[date] || { tasks: {} };
  const tasks = log.tasks || {};
  const planned = plan ? plan.plannedQ : 0;
  let doneQ = 0, doneCount = 0, attempted = 0, correct = 0;
  for (const id in tasks) {
    const t = tasks[id];
    if (t.done) { if (t.counts !== false) doneQ += t.q || 0; doneCount++; }
    if (t.total > 0) { attempted += t.total; correct += t.correct || 0; }
  }
  const totalCount = tasksFor(date).length;
  const completion = planned ? clamp(doneQ / planned, 0, 1) : (doneCount ? 1 : 0);
  const accuracy = attempted ? correct / attempted : null;
  const logged = doneCount > 0 || attempted > 0;
  const score = logged ? Math.round(completion * 50 + (accuracy === null ? completion : accuracy) * 50) : null;
  return { planned, doneQ, doneCount, totalCount, attempted, correct, completion, accuracy, score, logged, hours: log.hours || 0 };
}

function levelOf(sc) { return sc >= 85 ? 'great' : sc >= 72 ? 'good' : sc >= 60 ? 'ok' : 'low'; }
const TONE = {
  great: { bg: '#d3f4e1', fg: '#0f8a4f', label: 'Маш сайн өдөр' },
  good:  { bg: '#e4f6d2', fg: '#5b8f21', label: 'Сайн өдөр' },
  ok:    { bg: '#fdefcf', fg: '#b07d10', label: 'Дунд зэрэг' },
  low:   { bg: '#ffe1df', fg: '#cc4038', label: 'Сул өдөр' },
};

function streaks() {
  const dates = Object.keys(S.log).filter(d => dayStats(d).doneCount > 0).sort();
  if (!dates.length) return { current: 0, best: 0 };
  let best = 1, run = 1;
  for (let i = 1; i < dates.length; i++) {
    run = (dayCount(dates[i - 1], dates[i]) === 1) ? run + 1 : 1;
    best = Math.max(best, run);
  }
  const last = dates[dates.length - 1];
  const gap = dayCount(last, todayISO());
  let current = 0;
  if (gap <= 1) {
    current = 1;
    for (let i = dates.length - 1; i > 0; i--) {
      if (dayCount(dates[i - 1], dates[i]) === 1) current++; else break;
    }
  }
  return { current, best };
}

/* ============================================================
   5. RENDER — shared chrome
   ============================================================ */

function render() {
  renderChrome();
  ({ today: renderToday, calendar: renderCalendar, syllabus: renderSyllabus,
     stats: renderStats, settings: renderSettings })[ui.view]();
}

function renderChrome() {
  const st = S.settings, t = todayISO();
  $('#todayDate').textContent = fmtDate(t);

  const left = dayCount(t, st.examDate);
  const total = dayCount(st.startDate, st.examDate);
  const elapsed = clamp(dayCount(st.startDate, t), 0, total);
  $('#daysLeft').textContent = Math.max(0, left);
  $('#dayOf').textContent = `${total} хоногийн ${clamp(elapsed + 1, 1, total)} дахь өдөр`;
  $('#sprintFill').style.width = `${Math.round(elapsed / total * 100)}%`;
  $('#examLabel').textContent = `Шалгалт · ${fmtShort(st.examDate)}`;

  const s = streaks();
  $('#streakNum').textContent = s.current;
  $('#streakBest').textContent = s.best;

  const titles = { today: 'Өнөөдөр', calendar: 'Хуанли', syllabus: 'Хуулийн жагсаалт', stats: 'Статистик', settings: 'Тохиргоо' };
  $('#topbarTitle').textContent = titles[ui.view];

  $$('.nav-item').forEach(b => b.classList.toggle('is-on', b.dataset.view === ui.view));
  $$('.view').forEach(v => v.classList.toggle('hidden', v.id !== `view-${ui.view}`));
}

/* ============================================================
   6. RENDER — Today
   ============================================================ */

function renderToday() {
  const date = todayISO();
  const plan = PLAN.days.get(date);
  const log = S.log[date] || { tasks: {} };
  const st = dayStats(date);

  const CIRC = 2 * Math.PI * 52;
  const ring = $('#ringFg');
  ring.setAttribute('stroke-dasharray', CIRC);
  ring.setAttribute('stroke-dashoffset', CIRC * (1 - (st.totalCount ? st.doneCount / st.totalCount : 0)));
  $('#doneCount').textContent = st.doneCount;
  $('#totalCount').textContent = st.totalCount;

  $('#accPct').textContent = st.attempted ? `${Math.round(st.accuracy * 100)}%` : '—';
  $('#accSub').textContent = st.attempted ? `${st.correct}/${st.attempted} зөв` : 'оноо бүртгээгүй';
  $('#qDone').textContent = st.doneQ;
  $('#qGoal').textContent = st.planned;
  $('#qFill').style.width = `${st.planned ? Math.round(st.doneQ / st.planned * 100) : 0}%`;

  // ---- task list ----
  const host = $('#taskList');
  if (!plan) {
    const untilStart = dayCount(date, S.settings.startDate);
    if (untilStart > 0) {
      const first = PLAN.days.get(PLAN.order[0]);
      host.innerHTML = `<div class="empty"><div class="big">🚀</div>
        <div class="txt">Төлөвлөгөө ${untilStart} хоногийн дараа эхэлнэ (${fmtShort(S.settings.startDate)}).</div></div>
        <div class="sel-topics" style="border-top:1px solid var(--line-2);margin-top:4px">
          <div class="stat-cap" style="margin-bottom:8px">ЭХНИЙ ӨДӨР</div>
          ${first.tasks.map(t => `<div class="sel-topic">• ${esc(t.name)} — <b>${t.q}</b> тест</div>`).join('')}
        </div>`;
      $('#planSummary').textContent = `${untilStart} хоногийн дараа`;
    } else {
      host.innerHTML = emptyBox('🏛️', date === S.settings.examDate
        ? 'Шалгалтын өдөр. Амжилт хүсье!'
        : 'Төлөвлөгөөний хугацаа дууссан.');
      $('#planSummary').textContent = '—';
    }
    renderWeak(); renderMilestones();
    return;
  }
  if (plan.rest) {
    host.innerHTML = emptyBox('☕️', 'Амралтын өдөр. Тархиа амраа.');
    $('#planSummary').textContent = 'амралт';
    renderWeak(); renderMilestones();
    return;
  }

  $('#planSummary').textContent = `${st.doneCount}/${st.totalCount} дуусгасан · ~${hm(dayMinutes(date))}`;

  renderTaskList(host, date);
  renderProjMini();
  renderWeak();
  renderMilestones();
}

/* Plan tasks for a date, plus anything the user added themselves. */
function tasksFor(date) {
  const plan = PLAN.days.get(date);
  const base = plan && !plan.rest ? plan.tasks : [];
  return [...base, ...(S.custom[date] || [])];
}

/* The editable checklist — used by Today and by the calendar's day detail. */
function renderTaskList(host, date) {
  const log = S.log[date] || { tasks: {} };
  const items = tasksFor(date);
  const groups = {};
  for (const t of items) (groups[t.type] ||= []).push(t);

  host.innerHTML = TYPE_ORDER.filter(k => groups[k]).map(k => {
    const m = TYPE_META[k];
    const list = groups[k];
    const done = list.filter(t => log.tasks?.[t.id]?.done).length;
    return `<div class="tgroup">
      <div class="tgroup-head">
        <span class="tgroup-sq" style="background:${m.color}"></span>
        <span class="tgroup-label">${m.label}</span>
        <span class="tgroup-count">${done}/${list.length}</span>
      </div>
      <div class="tasks">${list.map(t => taskRow(t, log, date)).join('')}</div>
    </div>`;
  }).join('') + addTaskForm(date);

  wireTasks(date, host);
}

function addTaskForm(date) {
  return `<div class="add-task">
    <button class="btn add-open" data-addopen="${date}">+ Даалгавар нэмэх</button>
    <div class="add-fields hidden" data-addform="${date}">
      <input class="input" data-addname placeholder="Даалгаврын нэр" maxlength="120">
      <select class="input select" data-addtype>
        <option value="custom">Миний даалгавар</option>
        <option value="case">Шүүхийн шийдвэр</option>
        <option value="new">Тест</option>
      </select>
      <input class="input" type="number" data-addq min="1" max="500" value="1" aria-label="Тоо">
      <button class="btn btn-primary" data-addsave="${date}">Нэмэх</button>
    </div>
  </div>`;
}

function taskRow(t, log, date) {
  const rec = log.tasks?.[t.id] || {};
  const m = TYPE_META[t.type];
  const done = !!rec.done;
  const unit = t.unit || 'тест';
  const scorable = t.scorable !== false && t.counts !== false;
  let sub = t.range || '';

  if (t.dynamic && t.type === 'weak') {
    const w = weakTopics(3);
    sub = w.length ? w.map(x => x.name.slice(0, 26)).join(' · ') : 'Оноо бүртгэсний дараа сэдэв тодорхойлогдоно';
  }

  const meta = [sub, `${t.q} ${unit}`, t.part ? `${t.part}-р хэсэг` : '']
    .filter(Boolean).map(esc).join(' · ');

  const right = scorable
    ? `<div class="score">
         <input type="number" min="0" max="${t.q}" placeholder="зөв" value="${rec.correct ?? ''}"
           data-correct="${t.id}" aria-label="Зөв хариултын тоо">
         <span>/ ${t.q}</span>
       </div>`
    : t.selfScored
    ? `<div class="score">
         <input type="number" min="0" max="100" placeholder="%" value="${rec.selfScore ?? ''}"
           data-self="${t.id}" aria-label="Жишиг хариулттай харьцуулсан өөрийн үнэлгээ">
         <span>/ 100</span>
       </div>`
    : (t.custom ? `<button class="task-del" data-del="${t.id}" aria-label="Устгах" title="Устгах">✕</button>` : '');

  const links = t.type === 'case'
    ? `<div class="case-links">${CASE_LINKS.map(([n, u]) =>
        `<a href="${u}" target="_blank" rel="noopener">${esc(n)}</a>`).join('')}</div>`
    : '';

  return `<div class="task ${done ? 'done' : ''}" data-task="${t.id}">
    <button class="task-box" data-toggle="${t.id}" aria-pressed="${done}" aria-label="Дуусгах"
      style="${done ? `background:${m.color};border-color:${m.color}` : ''}">${done ? '✓' : ''}</button>
    <div class="task-main">
      <div class="task-label">${esc(t.name)}</div>
      <div class="task-meta">${meta}</div>
      ${links}
    </div>
    ${right}
    <span class="task-tag" style="background:${m.bg};color:${m.fg}">${m.tag}</span>
  </div>`;
}

function wireTasks(date, scope) {
  const root = scope || document;
  const find = id => tasksFor(date).find(t => t.id === id);
  const stamp = (rec, task) => {
    rec.topicId = task.topicId ?? null; rec.type = task.type;
    rec.q = task.q; rec.counts = task.counts !== false;
    return rec;
  };

  $$('[data-toggle]', root).forEach(btn => btn.addEventListener('click', () => {
    const task = find(btn.dataset.toggle);
    if (!task) return;
    const l = dayLog(date);
    const rec = l.tasks[task.id] || {};
    rec.done = !rec.done;
    l.tasks[task.id] = stamp(rec, task);
    save(); render();
  }));

  $$('[data-correct]', root).forEach(inp => inp.addEventListener('change', () => {
    const task = find(inp.dataset.correct);
    if (!task) return;
    const l = dayLog(date);
    const rec = l.tasks[task.id] || {};
    const v = inp.value.trim();
    if (v === '') { delete rec.correct; delete rec.total; }
    else {
      rec.correct = clamp(parseInt(v, 10) || 0, 0, task.q);
      rec.total = task.q;
      rec.done = true;
    }
    l.tasks[task.id] = stamp(rec, task);
    save(); render();
  }));

  $$('[data-self]', root).forEach(inp => inp.addEventListener('change', () => {
    const task = find(inp.dataset.self);
    if (!task) return;
    const l = dayLog(date);
    const rec = l.tasks[task.id] || {};
    const v = inp.value.trim();
    if (v === '') delete rec.selfScore;
    else { rec.selfScore = clamp(parseInt(v, 10) || 0, 0, 100); rec.done = true; }
    rec.branch = task.branch || null;
    l.tasks[task.id] = stamp(rec, task);
    save(); render();
  }));

  $$('[data-del]', root).forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.del;
    S.custom[date] = (S.custom[date] || []).filter(t => t.id !== id);
    if (!S.custom[date].length) delete S.custom[date];
    if (S.log[date]?.tasks) delete S.log[date].tasks[id];
    save(); render();
    toast('Устгалаа');
  }));

  $$('[data-addopen]', root).forEach(btn => btn.addEventListener('click', () => {
    const form = $(`[data-addform="${date}"]`, root);
    form.classList.toggle('hidden');
    btn.classList.toggle('hidden');
    if (!form.classList.contains('hidden')) $('[data-addname]', form).focus();
  }));

  $$('[data-addsave]', root).forEach(btn => btn.addEventListener('click', () => {
    const form = $(`[data-addform="${date}"]`, root);
    const name = $('[data-addname]', form).value.trim();
    if (!name) { toast('Нэрээ бичнэ үү'); return; }
    const type = $('[data-addtype]', form).value;
    const q = clamp(parseInt($('[data-addq]', form).value, 10) || 1, 1, 500);
    const isQuiz = type === 'new';
    (S.custom[date] ||= []).push({
      id: `${date}#u${Date.now().toString(36)}`,
      type: type === 'new' ? 'custom' : type,
      name, q, custom: true,
      unit: isQuiz ? 'тест' : (type === 'case' ? 'шийдвэр' : 'ширхэг'),
      counts: isQuiz, scorable: isQuiz,
      range: 'Миний нэмсэн',
    });
    save(); render();
    toast('Нэмлээ');
  }));
}

function emptyBox(icon, txt) {
  return `<div class="empty"><div class="big">${icon}</div><div class="txt">${esc(txt)}</div></div>`;
}

function renderWeak() {
  const w = weakTopics(5);
  const host = $('#weakList');
  if (!w.length) {
    host.innerHTML = `<p class="card-note" style="margin:0">Тестийн оноогоо бүртгэж эхлэхэд сул талууд энд гарч ирнэ.</p>`;
    return;
  }
  host.innerHTML = w.map(t => {
    const color = t.acc < 60 ? '#cc4038' : t.acc < 75 ? '#d98a12' : '#189150';
    return `<div class="weak">
      <div class="weak-top"><span class="weak-name">${esc(t.name)}</span><span class="weak-pct" style="color:${color}">${t.acc}%</span></div>
      <div class="weak-sub">${esc(t.groupName)} · ${t.part}-р хэсэг · ${t.attempted} тест</div>
      <div class="weak-bar"><div class="weak-fill" style="width:${t.acc}%;background:${color}"></div></div>
    </div>`;
  }).join('');
}

function renderMilestones() {
  const t = todayISO();
  const up = PLAN.milestones.filter(m => m.date >= t).slice(0, 5);
  const host = $('#milestoneList');
  if (!up.length) { host.innerHTML = `<p class="card-note" style="margin:0">Үе шат үлдээгүй.</p>`; return; }
  host.innerHTML = up.map((m, i) => {
    const inD = dayCount(t, m.date);
    const c = m.kind === 'exam' ? ['#cc4038', '#ffe1df'] : m.kind === 'phase' ? ['#189150', '#e6f7ee'] : ['#5a63f0', '#eef1fe'];
    return `<div class="ms">
      <div class="ms-rail">
        <span class="ms-dot" style="background:${c[0]};border-color:${c[1]}"></span>
        ${i < up.length - 1 ? '<span class="ms-line"></span>' : ''}
      </div>
      <div style="padding-bottom:4px">
        <div class="ms-label">${esc(m.label)}</div>
        <div class="ms-date" style="color:${c[0]}">${fmtShort(m.date)} · ${inD === 0 ? 'өнөөдөр' : `${inD} хоногийн дараа`}</div>
      </div>
    </div>`;
  }).join('');
}

/* ============================================================
   7. RENDER — Calendar
   ============================================================ */

function renderCalendar() {
  const now = new Date();
  if (ui.calMonth === null) { ui.calMonth = now.getMonth(); ui.calYear = now.getFullYear(); }
  const { calMonth: m, calYear: y } = ui;

  $('#monthLabel').textContent = `${y} оны ${m + 1}-р сар`;
  $('#calWeekdays').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(i => `<div>${WD_MN[i]}</div>`).join('');

  const first = new Date(y, m, 1).getDay();
  const offset = (first + 6) % 7;              // Monday-start
  const dim = new Date(y, m + 1, 0).getDate();
  const t = todayISO(), st = S.settings;

  let html = '';
  for (let i = 0; i < offset; i++) html += `<div class="cell blank"></div>`;
  for (let d = 1; d <= dim; d++) {
    const key = iso(new Date(y, m, d));
    const plan = PLAN.days.get(key);
    const ds = dayStats(key);
    const isExam = key === st.examDate;
    const cls = ['cell'];
    let bg = '#f3f5fb', fg = '#b6bccd', badge = '';

    if (isExam) { cls.push('is-exam'); fg = '#cc4038'; badge = '🏛️'; }
    else if (plan?.rest) { cls.push('rest'); fg = '#c8cedd'; }
    else if (ds.score !== null) { const tn = TONE[levelOf(ds.score)]; bg = tn.bg; fg = tn.fg; badge = ds.score; }
    else if (plan) { badge = ''; fg = key < t ? '#cc4038' : '#b6bccd'; }

    if (key === t) cls.push('is-today');
    if (key === ui.selDay) cls.push('is-sel');

    html += `<button class="${cls.join(' ')}" data-day="${key}" style="${isExam ? '' : `background:${bg}`}">
      <span class="cell-day" style="color:${fg}">${d}</span>
      <span class="cell-badge" style="color:${fg}">${badge}</span>
    </button>`;
  }
  $('#calGrid').innerHTML = html;
  $$('[data-day]').forEach(b => b.addEventListener('click', () => { ui.selDay = b.dataset.day; renderCalendar(); }));

  renderSelectedDay();

  // month rollup
  let sum = 0, cnt = 0, q = 0, hrs = 0;
  for (let d = 1; d <= dim; d++) {
    const key = iso(new Date(y, m, d));
    const ds = dayStats(key);
    if (ds.score !== null) { sum += ds.score; cnt++; q += ds.doneQ; hrs += ds.hours; }
  }
  $('#mAvg').textContent = cnt ? Math.round(sum / cnt) : 0;
  $('#mDays').textContent = cnt;
  $('#mQ').textContent = q;
  $('#mHours').textContent = Math.round(hrs);
}

function renderSelectedDay() {
  const key = ui.selDay;
  const host = $('#selBody');
  if (!key) { $('#selDate').textContent = '— өдөр сонго —'; host.innerHTML = ''; return; }

  $('#selDate').textContent = fmtDate(key);
  const plan = PLAN.days.get(key), ds = dayStats(key), st = S.settings;

  if (key === st.examDate) {
    host.innerHTML = `<div class="sel-score" style="background:#ffe1df">
      <div class="sel-score-num" style="color:#cc4038">🏛️</div>
      <div><div style="font-size:13px;font-weight:700;color:#cc4038">Шалгалтын өдөр</div>
      <div style="font-size:11.5px;color:#cc4038;opacity:.75;font-weight:500">Амжилт хүсье</div></div></div>`;
    return;
  }
  if (!plan) { host.innerHTML = emptyBox('📅', 'Төлөвлөгөөний хугацаанаас гадуур.'); return; }
  if (plan.rest) { host.innerHTML = emptyBox('☕️', 'Амралтын өдөр.'); return; }

  let head = '';
  if (ds.logged) {
    const tn = TONE[levelOf(ds.score)];
    head = `<div class="sel-score" style="background:${tn.bg}">
      <div class="sel-score-num" style="color:${tn.fg}">${ds.score}</div>
      <div><div style="font-size:13px;font-weight:700;color:${tn.fg}">${tn.label}</div>
      <div style="font-size:11.5px;color:${tn.fg};opacity:.75;font-weight:500">гүйцэтгэлийн оноо</div></div></div>`;
  } else {
    head = `<div class="sel-score" style="background:#f3f5fb">
      <div class="sel-score-num" style="color:#aab0c6">—</div>
      <div><div style="font-size:13px;font-weight:700;color:#8990a8">${key < todayISO() ? 'Бүртгэгдээгүй' : 'Хараахан болоогүй'}</div>
      <div style="font-size:11.5px;color:#aab0c6;font-weight:500">${plan.plannedQ} тест төлөвлөсөн</div></div></div>`;
  }

  const mins = dayMinutes(key);
  const isToday = key === todayISO();
  host.innerHTML = head + `
    <div class="kv"><span>Даалгавар</span><span>${ds.doneCount}/${ds.totalCount}</span></div>
    <div class="kv"><span>Тест</span><span>${ds.doneQ}/${plan.plannedQ}</span></div>
    <div class="kv"><span>Зөв хариулт</span><span>${ds.attempted ? Math.round(ds.accuracy * 100) + '%' : '—'}</span></div>
    <div class="kv"><span>Ойролцоо хугацаа</span><span>${hm(mins)}</span></div>
    <div class="sel-edit">
      <div class="stat-cap" style="margin-bottom:9px">${
        isToday ? 'ӨНӨӨДРИЙН ДААЛГАВАР' : (key < todayISO() ? 'СҮҮЛЭЭР БҮРТГЭХ' : 'ТӨЛӨВЛӨСӨН')
      }</div>
      <div id="selTasks"></div>
    </div>`;

  renderTaskList($('#selTasks'), key);
}

/* ============================================================
   8. RENDER — Syllabus
   ============================================================ */

function renderSyllabus() {
  const stats = allTopicStats();
  const done = SYLLABUS.topics.filter(t => stats[t.id].done >= t.q).length;
  const doneQ = SYLLABUS.topics.reduce((a, t) => a + Math.min(stats[t.id].done, t.q), 0);
  $('#sylSummary').textContent = `${done}/${SYLLABUS.totals.topics} хууль · ${doneQ.toLocaleString()}/${SYLLABUS.totals.q.toLocaleString()} тест`;

  const q = ui.sylQuery.toLowerCase();
  const rows = SYLLABUS.topics.filter(t => {
    const s = stats[t.id];
    const acc = s.attempted ? s.correct / s.attempted * 100 : null;
    if (q && !t.name.toLowerCase().includes(q)) return false;
    switch (ui.sylFilter) {
      case 'todo':   return s.done === 0;
      case 'active': return s.done > 0 && s.done < t.q;
      case 'done':   return s.done >= t.q;
      case 'weak':   return acc !== null && acc < 70;
      default:       return true;
    }
  });

  if (!rows.length) { $('#sylList').innerHTML = emptyBox('🔍', 'Илэрц олдсонгүй.'); return; }

  const byGroup = {};
  for (const t of rows) (byGroup[t.group] ||= []).push(t);

  $('#sylList').innerHTML = SYLLABUS.groups.filter(g => byGroup[g.id]).map(g => {
    const items = byGroup[g.id];
    return `<div class="syl-group">
      <div class="syl-group-head">
        <span class="syl-group-title">${g.part}-р хэсэг · ${esc(g.name)}</span>
        <span class="muted-sm">${items.length} хууль</span>
      </div>
      ${items.map(t => {
        const s = stats[t.id];
        const pct = Math.round(Math.min(s.done, t.q) / t.q * 100);
        const acc = s.attempted ? Math.round(s.correct / s.attempted * 100) : null;
        const ac = acc === null ? '#c3cad6' : acc < 60 ? '#cc4038' : acc < 75 ? '#d98a12' : '#189150';
        return `<div class="syl-row">
          <div class="syl-name">${esc(t.name)}<small>${t.q} тест</small></div>
          <div class="syl-prog">
            <div class="syl-bar"><div class="syl-fill" style="width:${pct}%"></div></div>
            <span class="syl-pct">${pct}% · ${Math.min(s.done, t.q)}/${t.q}</span>
          </div>
          <div class="syl-acc" style="color:${ac}">${acc === null ? '—' : acc + '%'}</div>
        </div>`;
      }).join('')}
    </div>`;
  }).join('');
}

/* ============================================================
   9. RENDER — Stats
   ============================================================ */

function renderProjection() {
  const p = projection(), st = S.settings;
  const host = $('#projCard');
  if (!host) return;

  const margin = p.total === null ? null : p.total - p.pass;
  const tone = margin === null ? 'info-box' : margin >= 6 ? 'ok-box' : margin >= 0 ? 'warn-box' : 'bad-box';
  const verdict = margin === null ? 'Хангалттай бүртгэл алга'
    : margin >= 6 ? `Тэнцэнэ · +${num(margin)} нөөцтэй`
    : margin >= 0 ? `Тэнцэх зааг дээр · ердөө +${num(margin)}`
    : `Одоогийн түвшинд унана · ${num(margin)}`;

  const bar = (label, pts, max, color) => {
    const w = pts === null ? 0 : clamp(pts / max * 100, 0, 100);
    return `<div class="pb">
      <div class="pb-top"><span>${label}</span><span class="pb-pts" style="color:${color}">${num(pts)} / ${max}</span></div>
      <div class="pb-bar"><div class="pb-fill" style="width:${w}%;background:${color}"></div></div>
    </div>`;
  };

  host.innerHTML = `
    <div class="proj-head">
      <div>
        <div class="stat-cap">ТААМАГЛАСАН НИЙТ ОНОО</div>
        <div class="proj-total">${num(p.total, 1)}<span class="proj-den">/ ${p.maxT + p.maxC}</span></div>
        <div class="proj-sub">Тэнцэх босго ${p.pass} · өмнөх удаа ${p.baseTotal}</div>
      </div>
      <div class="pace ${tone}" style="margin:0;flex:1;min-width:200px">
        <div class="pace-title">${verdict}</div>
        <div class="pace-sub">${p.testAcc === null ? 'Тестийн оноогоо бүртгэ' :
          `Тест ${(p.testAcc * 100).toFixed(1)}% (${p.testN.toLocaleString()} асуулт)`}${
          p.caseAcc === null ? ' · кейс бүртгэгдээгүй' : ` · кейс ${(p.caseAcc * 100).toFixed(0)}% (${p.caseN} удаа)`}</div>
      </div>
    </div>
    ${bar('Тест', p.testPts, p.maxT, '#5a63f0')}
    ${bar('Кейс', p.casePts, p.maxC, '#c2185b')}
    ${p.band === null ? '' : `<div class="proj-note">200 асуултын санамсаргүй түүврээс болж тестийн оноо
      <b>±${num(p.band)}</b> хэлбэлзэнэ (95%). Тиймээс 2-3 онооны нөөц эрсдэлтэй.</div>`}
    <div class="proj-split">
      <div><span class="proj-k">Кейс одоогийн түвшинд бол тестээс</span>
        <span class="proj-v">${p.needTest === null ? '—' : `${num(p.needTest)} / ${p.maxT}` +
          (p.needTest > p.maxT ? ' ← боломжгүй' : ` (${(p.needTest / p.maxT * 100).toFixed(0)}%)`)}</span></div>
      <div><span class="proj-k">Тест одоогийн түвшинд бол кейсээс</span>
        <span class="proj-v">${p.needCase === null ? '—' : `${num(p.needCase)} / ${p.maxC}` +
          (p.needCase > p.maxC ? ' ← боломжгүй' : ` (${(p.needCase / p.maxC * 100).toFixed(0)}%)`)}</span></div>
    </div>`;
}

function renderProjMini() {
  const p = projection();
  const host = $('#projMini');
  if (!host) return;
  const margin = p.total === null ? null : p.total - p.pass;
  const color = margin === null ? '#9298b0' : margin >= 6 ? '#189150' : margin >= 0 ? '#d98a12' : '#cc4038';
  host.innerHTML = `
    <div class="mini-row">
      <div>
        <div class="stat-cap">ТААМАГЛАСАН ОНОО</div>
        <div class="mini-total" style="color:${color}">${num(p.total, 1)}<span class="proj-den">/ ${p.maxT + p.maxC}</span></div>
      </div>
      <div class="mini-split">
        <div><span>Тест</span><b style="color:#5a63f0">${num(p.testPts)}</b><small>/${p.maxT}</small></div>
        <div><span>Кейс</span><b style="color:#c2185b">${num(p.casePts)}</b><small>/${p.maxC}</small></div>
        <div><span>Босго</span><b>${p.pass}</b><small>${margin === null ? '' : (margin >= 0 ? `+${num(margin)}` : num(margin))}</small></div>
      </div>
    </div>`;
}

function renderStats() {
  renderProjection();
  const stats = allTopicStats();
  const st = S.settings, t = todayISO();
  const doneQ = SYLLABUS.topics.reduce((a, x) => a + Math.min(stats[x.id].done, x.q), 0);
  const pct = Math.round(doneQ / SYLLABUS.totals.q * 100);

  let att = 0, cor = 0;
  for (const id in stats) { att += stats[id].attempted; cor += stats[id].correct; }
  const acc = att ? Math.round(cor / att * 100) : null;

  let hours = 0, studied = 0;
  for (const d in S.log) { const ds = dayStats(d); if (ds.doneCount) { studied++; hours += ds.doneQ * st.minPerQ / 60; } }

  $('#kpiRow').innerHTML = [
    ['НИЙТ ЯВЦ', `${pct}%`, `${doneQ.toLocaleString()} / ${SYLLABUS.totals.q.toLocaleString()} тест`],
    ['ДУНДАЖ ОНОО', acc === null ? '—' : `${acc}%`, att ? `${cor.toLocaleString()}/${att.toLocaleString()} зөв` : 'бүртгэл алга'],
    ['ХИЧЭЭЛСЭН ӨДӨР', studied, `~${Math.round(hours)} цаг`],
    ['ҮЛДСЭН ХОНОГ', Math.max(0, dayCount(t, st.examDate)), `шалгалт ${fmtShort(st.examDate)}`],
  ].map(([c, n, s]) => `<div class="kpi"><div class="kpi-cap">${c}</div><div class="kpi-num">${n}</div><div class="kpi-sub">${esc(s)}</div></div>`).join('');

  // group progress
  $('#groupProgress').innerHTML = SYLLABUS.groups.map(g => {
    const items = SYLLABUS.topics.filter(x => x.group === g.id);
    const d = items.reduce((a, x) => a + Math.min(stats[x.id].done, x.q), 0);
    const p = Math.round(d / g.q * 100);
    const color = p >= 90 ? '#189150' : p >= 40 ? '#5a63f0' : '#c3cad6';
    return `<div class="gp">
      <div class="gp-top"><span class="gp-name">${g.part}-р хэсэг · ${esc(g.name)}</span><span class="gp-val">${p}%</span></div>
      <div class="gp-bar"><div class="gp-fill" style="width:${p}%;background:${color}"></div></div>
      <div class="kpi-sub">${d.toLocaleString()}/${g.q.toLocaleString()} тест · ${items.length} хууль</div>
    </div>`;
  }).join('');

  // pace
  const shouldBy = PLAN.order.filter(k => k <= t).reduce((a, k) => {
    const p = PLAN.days.get(k);
    return a + (p.phase === 'content' ? p.tasks.filter(x => x.type === 'new').reduce((b, x) => b + x.q, 0) : 0);
  }, 0);
  const diff = doneQ - shouldBy;
  const box = diff >= 0 ? 'ok-box' : diff > -300 ? 'warn-box' : 'bad-box';
  const remainDays = PLAN.order.filter(k => k > t && PLAN.days.get(k).phase === 'content' && !PLAN.days.get(k).rest).length;
  const remainQ = SYLLABUS.totals.q - doneQ;
  $('#paceBox').innerHTML = `
    <div class="pace ${box}">
      <div class="pace-title">${diff >= 0 ? `Хуваарьтаа байна (+${diff})` : `Хоцорч байна (${diff})`}</div>
      <div class="pace-sub">Өнөөдрийг хүртэл ${shouldBy.toLocaleString()} тест төлөвлөсний ${doneQ.toLocaleString()}-г хийсэн.</div>
    </div>
    <div class="kv"><span>Үлдсэн тест</span><span>${remainQ.toLocaleString()}</span></div>
    <div class="kv"><span>Үлдсэн хичээлийн өдөр</span><span>${remainDays}</span></div>
    <div class="kv"><span>Өдөрт шаардлагатай</span><span>${remainDays ? Math.ceil(remainQ / remainDays) : '—'} тест</span></div>`;

  // case-practice rollup, per branch
  const bStats = {};
  for (const b of BRANCHES) bStats[b.key] = { done: 0, planned: 0, scores: [] };
  for (const k of PLAN.order) {
    for (const t of PLAN.days.get(k).tasks) {
      if (t.type !== 'casework' || !t.branch) continue;
      bStats[t.branch].planned++;
      const rec = S.log[k]?.tasks?.[t.id];
      if (rec?.done) bStats[t.branch].done++;
      if (rec?.selfScore != null) bStats[t.branch].scores.push(rec.selfScore);
    }
  }
  const allScores = Object.values(bStats).flatMap(b => b.scores);
  const avg = allScores.length ? Math.round(allScores.reduce((a, x) => a + x, 0) / allScores.length) : null;
  $('#caseBox').innerHTML = !S.settings.caseTrack
    ? `<p class="card-note" style="margin:0">Кейсийн дасгал унтраалттай байна.</p>`
    : `<div class="pace ${avg === null ? 'info-box' : avg >= 75 ? 'ok-box' : avg >= 55 ? 'warn-box' : 'bad-box'}">
         <div class="pace-title">${avg === null ? 'Дасгал эхлээгүй' : `Дундаж ${avg}% (жишиг хариулттай харьцуулсан)`}</div>
         <div class="pace-sub">${allScores.length} кейс бодож үнэлсэн · шалгалтын оноо 50% энэ хэсэгт</div>
       </div>` +
      BRANCHES.map(b => {
        const x = bStats[b.key];
        const a = x.scores.length ? Math.round(x.scores.reduce((p, c) => p + c, 0) / x.scores.length) : null;
        const pct = x.planned ? Math.round(x.done / x.planned * 100) : 0;
        return `<div class="gp">
          <div class="gp-top"><span class="gp-name">${b.name}</span>
            <span class="gp-val">${x.done}/${x.planned}${a === null ? '' : ` · ${a}%`}</span></div>
          <div class="gp-bar"><div class="gp-fill" style="width:${pct}%;background:#c2185b"></div></div>
        </div>`;
      }).join('');

  // sparkline — last 14 days
  const days = [];
  for (let i = 13; i >= 0; i--) days.push(iso(addDays(new Date(), -i)));
  $('#spark').innerHTML = days.map(d => {
    const ds = dayStats(d);
    const h = ds.score === null ? 4 : clamp(ds.score, 5, 100);
    const c = ds.score === null ? '#eef0f7' : TONE[levelOf(ds.score)].fg;
    return `<div class="spark-col" title="${d}">
      <div class="spark-bar" style="height:${h}%;background:${c}"></div>
      <div class="spark-lbl">${parse(d).getDate()}</div>
    </div>`;
  }).join('');
}

/* ============================================================
   10. RENDER — Settings
   ============================================================ */

function renderSettings() {
  const st = S.settings;
  $('#setStart').value = st.startDate;
  $('#setExam').value = st.examDate;
  $('#setWeekday').value = st.weekdayQ;
  $('#setWeekend').value = st.weekendQ;
  $('#setTail').value = st.tailDays;
  $('#setMinPerQ').value = st.minPerQ;
  $('#setNotifyTime').value = st.notifyTime;
  $('#setCasesWeek').value = st.casesPerWeek;
  $('#setCasesSession').value = st.casesPerSession;
  $('#setCaseMinutes').value = st.caseMinutes;
  $('#setTestPoints').value = st.examTestPoints;
  $('#setCasePoints').value = st.examCasePoints;
  $('#setPassMark').value = st.examPassMark;
  $('#setTestQ').value = st.examTestQ;
  $('#setBaseTest').value = st.baseTest;
  $('#setBaseCase').value = st.baseCase;
  $('#setCaseTrack').classList.toggle('on', !!st.caseTrack);
  $('#setOpenBook').classList.toggle('on', !!st.openBook);
  $('#setCaseTrack').onclick = () => { st.caseTrack = !st.caseTrack; save(); buildPlan(); renderSettings(); };
  $('#setOpenBook').onclick  = () => { st.openBook  = !st.openBook;  save(); buildPlan(); renderSettings(); };

  $('#restChips').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(i =>
    `<button class="chip ${st.restDays.includes(i) ? 'on' : ''}" data-rest="${i}">${WD_FULL[i]}</button>`).join('');
  $$('[data-rest]').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.rest;
    st.restDays = st.restDays.includes(i) ? st.restDays.filter(x => x !== i) : [...st.restDays, i];
    save(); buildPlan(); renderSettings(); renderChrome();
  }));

  const s = PLAN.stats;
  const box = $('#feasibility');
  if (s.error) { box.className = 'feasibility bad-box'; box.textContent = s.error; }
  else if (s.unscheduled > 0) {
    box.className = 'feasibility bad-box';
    box.innerHTML = `<b>${s.unscheduled.toLocaleString()} тест хуваарьт багтаагүй.</b><br>
      Өдрийн ачааллаа нэмэх эсвэл "Автоматаар тэнцвэржүүлэх" дар.`;
  } else {
    const slack = s.capacityTotal - s.totalQ;
    box.className = 'feasibility ok-box';
    const mins = Math.round(st.weekdayQ * st.minPerQ);
    box.innerHTML = `<b>Бүх ${s.totalQ.toLocaleString()} тест хуваарьт багтсан.</b><br>
      ${s.contentDays} хичээлийн өдөр + ${s.sprintDays} эцсийн давталтын өдөр + ${s.restDays} амралт.<br>
      Ажлын өдөрт ойролцоогоор <b>${Math.floor(mins / 60)}ц ${mins % 60}м</b> · нөөц ${slack.toLocaleString()} тест.`;
  }

  const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
  const ns = $('#notifState');
  const msg = {
    unsupported: ['bad-box', 'Энэ хөтөч мэдэгдэл дэмждэггүй.'],
    denied: ['bad-box', 'Мэдэгдэл хаагдсан. Хөтчийн тохиргооноос сайтад зөвшөөрөл өг.'],
    granted: [st.notifyEnabled ? 'ok-box' : 'info-box', st.notifyEnabled
      ? `Сануулга асаалттай — өдөр бүр ${st.notifyTime} цагт. Апп нээлттэй эсвэл дэвсгэрт ажиллаж байхад л ирнэ.`
      : 'Зөвшөөрөл авсан. "Сануулга асаах" дарж идэвхжүүл.'],
    default: ['info-box', 'Сануулга асаахад хөтөч зөвшөөрөл асууна.'],
  }[perm];
  ns.className = `notif-state ${msg[0]}`;
  ns.textContent = msg[1];
}

/* ============================================================
   11. NOTIFICATIONS
   ============================================================ */

let notifTimer = null;

function scheduleNotification() {
  clearTimeout(notifTimer);
  const st = S.settings;
  if (!st.notifyEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;

  const [h, m] = st.notifyTime.split(':').map(Number);
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
  if (target <= now) target.setDate(target.getDate() + 1);

  notifTimer = setTimeout(() => { fireReminder(); scheduleNotification(); }, target - now);
}

function fireReminder() {
  const date = todayISO();
  if (S.lastNotified === date) return;
  const plan = PLAN.days.get(date);
  if (!plan || plan.rest) return;
  const ds = dayStats(date);
  if (ds.totalCount && ds.doneCount >= ds.totalCount) return;   // already finished

  const left = ds.totalCount - ds.doneCount;
  const body = `${left} даалгавар · ${plan.plannedQ - ds.doneQ} тест үлдлээ. Шалгалт хүртэл ${dayCount(date, S.settings.examDate)} хоног.`;
  notify('BarTrack — өнөөдрийн төлөвлөгөө', body);
  S.lastNotified = date;
  save();
}

function notify(title, body) {
  const opts = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'bartrack-daily' };
  if (navigator.serviceWorker?.ready) {
    navigator.serviceWorker.ready.then(r => r.showNotification(title, opts)).catch(() => new Notification(title, opts));
  } else {
    new Notification(title, opts);
  }
}

/* Missed-reminder catch-up: if the app opens after the reminder time and today is unfinished. */
function catchUpReminder() {
  const st = S.settings;
  if (!st.notifyEnabled || Notification.permission !== 'granted') return;
  const [h, m] = st.notifyTime.split(':').map(Number);
  const now = new Date();
  if (now.getHours() * 60 + now.getMinutes() >= h * 60 + m) fireReminder();
}

/* ============================================================
   12. EXPORTS
   ============================================================ */

function download(name, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fold(line) {
  // RFC 5545 line folding at 74 chars
  const out = [];
  while (line.length > 74) { out.push(line.slice(0, 74)); line = ' ' + line.slice(74); }
  out.push(line);
  return out.join('\r\n');
}

function exportIcs() {
  const st = S.settings;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const escT = s => String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BarTrack//Bar Exam Prep//MN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:BarTrack — Шалгалтын бэлтгэл',
  ];

  for (const key of PLAN.order) {
    const p = PLAN.days.get(key);
    if (p.rest || !p.tasks.length) continue;
    const mins = dayMinutes(key);
    const desc = p.tasks.map(t => `• ${t.name} — ${t.q} тест (${t.range})`).join('\n');
    const d = key.replace(/-/g, '');
    const [sh, sm] = st.notifyTime.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin = Math.min(startMin + mins, 23 * 60 + 59);
    const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}${String(m % 60).padStart(2, '0')}00`;
    lines.push('BEGIN:VEVENT',
      `UID:bartrack-${d}@local`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${d}T${hhmm(startMin)}`,          // floating local time — imports cleanly everywhere
      `DTEND:${d}T${hhmm(endMin)}`,
      fold(`SUMMARY:${escT(`📘 ${p.plannedQ} тест · ~${Math.floor(mins / 60)}ц${mins % 60}м`)}`),
      fold(`DESCRIPTION:${escT(desc)}`),
      'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY',
      fold(`DESCRIPTION:${escT('BarTrack — өнөөдрийн төлөвлөгөө')}`), 'END:VALARM',
      'END:VEVENT');
  }

  const ed = st.examDate.replace(/-/g, '');
  lines.push('BEGIN:VEVENT', `UID:bartrack-exam@local`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ed}`, `DTEND;VALUE=DATE:${iso(addDays(parse(st.examDate), 1)).replace(/-/g, '')}`,
    'SUMMARY:🏛️ Хуульчийн шалгалт', 'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY',
    'DESCRIPTION:Маргааш шалгалт', 'END:VALARM', 'END:VEVENT');

  lines.push('END:VCALENDAR');
  download('bartrack-plan.ics', lines.join('\r\n'), 'text/calendar;charset=utf-8');
  toast('Хуанлийн файл татагдлаа');
}

/* ============================================================
   13. WIRING
   ============================================================ */

function setView(v) {
  ui.view = v;
  $('#sidebar').classList.remove('open');
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function commitSettings() {
  const st = S.settings;
  const start = $('#setStart').value, exam = $('#setExam').value;
  if (!start || !exam || parse(exam) <= parse(start)) { toast('Огноо буруу байна'); return; }
  st.startDate = start;
  st.examDate = exam;
  st.weekdayQ = clamp(parseInt($('#setWeekday').value, 10) || 60, 10, 400);
  st.weekendQ = clamp(parseInt($('#setWeekend').value, 10) || 90, 10, 400);
  st.tailDays = clamp(parseInt($('#setTail').value, 10) || 0, 0, 30);
  st.minPerQ  = clamp(parseFloat($('#setMinPerQ').value) || 1.2, 0.3, 5);
  st.notifyTime = $('#setNotifyTime').value || '20:00';
  st.casesPerWeek = clamp(parseInt($('#setCasesWeek').value, 10) || 0, 0, 7);
  st.casesPerSession = clamp(parseInt($('#setCasesSession').value, 10) || 1, 1, 10);
  st.caseMinutes = clamp(parseInt($('#setCaseMinutes').value, 10) || 120, 30, 300);
  st.examTestPoints = clamp(parseInt($('#setTestPoints').value, 10) || 40, 1, 200);
  st.examCasePoints = clamp(parseInt($('#setCasePoints').value, 10) || 60, 1, 200);
  st.examPassMark   = clamp(parseInt($('#setPassMark').value, 10) || 70, 1, 400);
  st.examTestQ      = clamp(parseInt($('#setTestQ').value, 10) || 200, 10, 1000);
  st.baseTest       = clamp(parseInt($('#setBaseTest').value, 10) || 0, 0, 200);
  st.baseCase       = clamp(parseInt($('#setBaseCase').value, 10) || 0, 0, 200);
  save(); buildPlan(); render(); scheduleNotification();
  toast('Хадгаллаа — төлөвлөгөө шинэчлэгдлээ');
}

function autoBalance() {
  const st = S.settings;
  const start = parse($('#setStart').value || st.startDate);
  const exam = parse($('#setExam').value || st.examDate);
  const tail = clamp(parseInt($('#setTail').value, 10) || 0, 0, 30);
  const tailStart = addDays(exam, -tail);
  const total = Math.round((exam - start) / 86400000);

  let wd = 0, we = 0;
  for (let i = 0; i < total; i++) {
    const d = addDays(start, i);
    if (d >= tailStart) continue;
    if (st.restDays.includes(d.getDay())) continue;
    (d.getDay() === 0 || d.getDay() === 6) ? we++ : wd++;
  }
  if (!wd && !we) { toast('Хичээлийн өдөр алга'); return; }

  // weekend load = 1.5× weekday
  const need = SYLLABUS.totals.q / NEW_SHARE;
  const x = need / (wd + 1.5 * we);
  const weekday = Math.ceil(x / 5) * 5;
  $('#setWeekday').value = weekday;
  $('#setWeekend').value = Math.ceil(weekday * 1.5 / 5) * 5;
  commitSettings();
}

function init() {
  buildPlan();

  $('#nav').addEventListener('click', e => {
    const b = e.target.closest('[data-view]');
    if (b) setView(b.dataset.view);
  });
  $('#hamburger').addEventListener('click', () => $('#sidebar').classList.toggle('open'));

  $('#prevMonth').addEventListener('click', () => {
    if (--ui.calMonth < 0) { ui.calMonth = 11; ui.calYear--; }
    renderCalendar();
  });
  $('#nextMonth').addEventListener('click', () => {
    if (++ui.calMonth > 11) { ui.calMonth = 0; ui.calYear++; }
    renderCalendar();
  });

  $('#sylSearch').addEventListener('input', e => { ui.sylQuery = e.target.value; renderSyllabus(); });
  $('#sylFilter').addEventListener('change', e => { ui.sylFilter = e.target.value; renderSyllabus(); });

  $('#saveSettings').addEventListener('click', commitSettings);
  $('#autoBalance').addEventListener('click', autoBalance);

  $('#enableNotif').addEventListener('click', async () => {
    if (!('Notification' in window)) { toast('Хөтөч дэмжихгүй байна'); return; }
    const p = await Notification.requestPermission();
    S.settings.notifyEnabled = (p === 'granted');
    save(); scheduleNotification(); renderSettings();
    toast(p === 'granted' ? 'Сануулга асаалаа' : 'Зөвшөөрөл өгөгдсөнгүй');
  });
  $('#testNotif').addEventListener('click', () => {
    if (Notification.permission !== 'granted') { toast('Эхлээд сануулга асаа'); return; }
    notify('BarTrack', 'Сануулга ажиллаж байна ✓');
  });

  $('#exportIcs').addEventListener('click', exportIcs);
  $('#exportJson').addEventListener('click', () => {
    download(`bartrack-backup-${todayISO()}.json`, JSON.stringify(S, null, 2), 'application/json');
    toast('Нөөц татагдлаа');
  });
  $('#importJsonBtn').addEventListener('click', () => $('#importJson').click());
  $('#importJson').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!d.settings || !d.log) throw new Error('bad shape');
        S = { settings: { ...DEFAULTS.settings, ...d.settings }, log: d.log,
              custom: d.custom || {}, lastNotified: d.lastNotified || null };
        save(); buildPlan(); render();
        toast('Сэргээлээ');
      } catch { toast('Файл уншигдсангүй'); }
    };
    r.readAsText(f);
    e.target.value = '';
  });
  $('#resetAll').addEventListener('click', () => {
    if (!confirm('Бүх явц устгагдана. Итгэлтэй байна уу?')) return;
    localStorage.removeItem(STORE_KEY);
    S = structuredClone(DEFAULTS);
    buildPlan(); render();
    toast('Цэвэрлэлээ');
  });

  render();
  scheduleNotification();
  catchUpReminder();

  if (navigator.serviceWorker && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  // re-render on day rollover / tab refocus
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); catchUpReminder(); } });
}

document.addEventListener('DOMContentLoaded', init);
