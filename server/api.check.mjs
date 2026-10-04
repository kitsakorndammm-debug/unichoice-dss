// ชุดทดสอบ API กับระบบที่รันอยู่: npm run check:api  (ตั้ง API_URL ได้ ค่าเริ่มต้น http://localhost:4000)
// หมายเหตุ: สร้างผู้ใช้ทดสอบ @test.local และแก้/คืนค่าข้อมูลบางรายการระหว่างทดสอบ ไม่ควรรันกับฐานข้อมูลที่ใช้งานจริง
const B = (process.env.API_URL || 'http://localhost:4000') + '/api';
let pass = 0, fail = 0;
const ok = (name, cond, info = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  -> ' + info : ''}`); };
const call = async (path, { method, body, token } = {}) => {
  const r = await fetch(B + path, { method: method ?? (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
};
const login = async (email, password) => (await call('/auth/login', { body: { email, password } })).json?.token;

const S = await login('student@dss.local', 'student1234');
const A = await login('admin@dss.local', 'admin1234');
ok('login student/admin', !!S && !!A);
ok('login wrong password = 401', (await call('/auth/login', { body: { email: 'student@dss.local', password: 'x' } })).status === 401);
ok('no token = 401', (await call('/programs')).status === 401);
ok('student on admin = 403', (await call('/admin/stats', { token: S })).status === 403);
ok('garbage token = 401', (await call('/programs', { token: 'a.b.c' })).status === 401);

// ---- new user with empty profile
const email = `t${Date.now()}@test.local`;
const reg = await call('/auth/register', { body: { name: 'ทดสอบ', email, password: 'secret12' } });
ok('register', reg.status === 201);
const N = reg.json.token;
ok('register duplicate = 409', (await call('/auth/register', { body: { name: 'ทดสอบ', email, password: 'secret12' } })).status === 409);
const e0 = await call('/evaluate', { token: N, body: {} });
ok('evaluate with empty profile works', e0.status === 200 && e0.json.results.length > 0, `n=${e0.json?.results?.length} top chance=${e0.json?.results?.[0]?.admissionChance}`);
ok('empty profile: no NaN scores', e0.json.results.every((r) => Number.isFinite(r.score) && r.score >= 0 && r.score <= 100));
ok('empty profile: chance all 50 (unknown)', e0.json.results.every((r) => r.admissionChance === 50));

// ---- validation
ok('profile gpa 5 = 400', (await call('/profile', { method: 'PUT', token: N, body: { gpa: 5 } })).status === 400);
ok('profile exam -1 = 400', (await call('/profile', { method: 'PUT', token: N, body: { exam_score: -1 } })).status === 400);
ok('profile budget -1 = 400', (await call('/profile', { method: 'PUT', token: N, body: { budget: -1 } })).status === 400);
const bogus = await call('/profile', { method: 'PUT', token: N, body: { home_province: 'ดาวอังคาร', interest_field: 'สาขาที่ไม่มีจริง', preferred_region: 'นอกโลก' } });
ok('profile unknown province/field/region rejected', bogus.status === 400, `status=${bogus.status}`);
const crit = (await call('/criteria', { token: N })).json.criteria;
const w = (vals) => crit.map((c, i) => ({ criteriaId: c.criteria_id, value: vals[i] }));
ok('weights all zero = 400', (await call('/evaluate', { token: N, body: { weights: w([0, 0, 0, 0]) } })).status === 400);
ok('weights negative = 400', (await call('/evaluate', { token: N, body: { weights: w([-10, 50, 30, 30]) } })).status === 400);
ok('save with sum != 100 = 400', (await call('/evaluate', { token: N, body: { weights: w([10, 10, 10, 10]), save: true } })).status === 400);
const unk = await call('/evaluate', { token: N, body: { weights: [{ criteriaId: 9999, value: 100 }] } });
ok('weights only unknown criteria = 400 (not 500)', unk.status === 400, `status=${unk.status} ${unk.text.slice(0, 80)}`);

// ---- single-criterion extremes
const P = { gpa: 3.2, exam_score: 60, budget: 50000, preferred_region: 'ทั้งหมด', interest_field: 'คอมพิวเตอร์และไอที', home_province: 'พิษณุโลก' };
const ev = async (vals, options = { matchField: true }) => (await call('/evaluate', { token: N, body: { weights: w(vals), profile: P, options } })).json;
const byCode = Object.fromEntries(crit.map((c, i) => [c.code, i]));
const only = (code) => crit.map((c) => (c.code === code ? 100 : 0));
let r = await ev(only('tuition'));
ok('100% tuition → cheapest first', r.results[0].program.yearly_cost === Math.min(...r.results.map((x) => x.program.yearly_cost)), `${r.results[0].program.short_name} ${r.results[0].program.tuition_fee}`);
r = await ev(only('ranking'));
ok('100% ranking → best-ranked uni first', r.results[0].program.ranking === Math.min(...r.results.map((x) => x.program.ranking)), `${r.results[0].program.short_name} #${r.results[0].program.ranking}`);
r = await ev(only('location'));
ok('100% location → nearest first (a Phitsanulok campus, within 15 km of the province centre)', r.results[0].distanceKm <= 15 && r.results[0].program.province === 'พิษณุโลก' && r.results.every((x, i, a) => i === 0 || x.distanceKm >= Math.min(a[i - 1].distanceKm, 1000) - 10), // คะแนนความใกล้ปัดเป็นจำนวนเต็ม ระยะจึงสลับกันได้ไม่เกิน 10 กม. (เกิน 1,000 กม. ได้ 0 เท่ากันหมด)
  `${r.results[0].program.short_name} ${r.results[0].distanceKm}km`);
r = await ev(only('admission'));
ok('100% admission → highest chance first', r.results[0].admissionChance === Math.max(...r.results.map((x) => x.admissionChance)), `${r.results[0].program.short_name} ${r.results[0].admissionChance}%`);
ok('matchField → only that field', r.results.every((x) => x.program.field === P.interest_field));
r = await ev(crit.map((c) => c.default_weight), { matchField: true, withinBudget: true, eligibleOnly: true });
// คะแนนที่ใช้เทียบ = GPAX (ร้อยละ) ผสมคะแนนสอบตามสัดส่วน GPAX ของหลักสูตร (เฉพาะหลักสูตรที่มีสถิติจริง)
const mine = (p) => { const w = p.max_score != null ? Number(p.gpax_weight ?? 0) : 0; return w * P.gpa * 25 + (1 - w) * P.exam_score; };
ok('withinBudget+eligibleOnly respected', r.results.every((x) => x.program.yearly_cost <= P.budget && x.program.min_gpa <= P.gpa && x.program.min_score <= mine(x.program) + 0.01), `n=${r.results.length}`);
ok('GPAX-weighted programs are compared with the blended score', r.results.some((x) => Number(x.program.gpax_weight) > 0 && x.program.min_score > P.exam_score),
  `${r.results.filter((x) => Number(x.program.gpax_weight) > 0).length} programs with GPAX weight`);
ok('candidates + excluded = total', r.summary.candidates + r.summary.excluded === r.summary.total);
ok('weighted parts sum to score', r.results.every((x) => Math.abs(x.details.reduce((s, d) => s + d.weighted, 0) * 100 - x.score) < 0.05));
ok('ranks non-decreasing, scores non-increasing', r.results.every((x, i, a) => i === 0 || (x.rank >= a[i - 1].rank && x.score <= a[i - 1].score)));

// ---- monotonicity: better exam score never lowers admission chance; bigger budget never removes options
const lo = await ev(crit.map((c) => c.default_weight));
const hi = (await call('/evaluate', { token: N, body: { weights: w(crit.map((c) => c.default_weight)), profile: { ...P, exam_score: 90, gpa: 3.9 }, options: { matchField: true } } })).json;
const chance = (res) => new Map(res.results.map((x) => [x.program.program_id, x.admissionChance]));
const cl = chance(lo), ch = chance(hi);
ok('higher GPA/exam never lowers chance', [...cl].every(([id, c]) => ch.get(id) >= c));

// ---- save / history / report / detail / delete
await call('/profile', { method: 'PUT', token: N, body: P });
const sv = await call('/evaluate', { token: N, body: { weights: w(crit.map((c) => c.default_weight)), options: { matchField: true, withinBudget: true }, save: true } });
ok('save run', sv.status === 200 && sv.json.runId > 0, `runId=${sv.json?.runId}`);
const run = await call(`/evaluations/${sv.json.runId}`, { token: N });
ok('run detail matches saved result', run.status === 200 && run.json.results.length === sv.json.results.length && Math.abs(run.json.results[0].total_score - sv.json.results[0].score) < 0.01);
ok('other user cannot read run = 404', (await call(`/evaluations/${sv.json.runId}`, { token: S })).status === 404);
ok('admin can read run', (await call(`/evaluations/${sv.json.runId}`, { token: A })).status === 200);
const rep = await fetch(`${B}/reports/${sv.json.runId}/export?token=${N}`);
const html = await rep.text();
ok('report renders', rep.status === 200 && html.includes('รายงานผล') && !html.includes('undefined') && !html.includes('NaN'), html.includes('undefined') ? 'contains "undefined"' : html.includes('NaN') ? 'contains NaN' : '');
const hist = await call('/evaluations/history', { token: N });
ok('history lists run', hist.json.runs.length === 1 && hist.json.runs[0].top.length >= 1);
const pid = sv.json.results[0].program.program_id;
ok('save favourite', (await call('/saved-list', { token: N, body: { programId: pid } })).status === 201);
ok('save favourite twice ok', (await call('/saved-list', { token: N, body: { programId: pid } })).status === 201);
ok('favourite unknown program = 4xx', [400, 404, 409].includes((await call('/saved-list', { token: N, body: { programId: 999999 } })).status));
const det = await call(`/programs/${pid}`, { token: N });
ok('program detail', det.status === 200 && det.json.saved === true && det.json.evaluation);
const fieldAll = (await call('/evaluate', { token: N, body: { options: { matchField: true, sensitivity: false } } })).json;
const same = fieldAll.results.find((x) => x.program.program_id === pid);
ok('detail is scoped to same field and matches field-scoped evaluate', det.json.totalPrograms === fieldAll.results.length && Math.abs(det.json.evaluation.score - same.score) < 0.01 && det.json.evaluation.rank === same.rank, `detail=${det.json.evaluation?.score} rank ${det.json.evaluation?.rank}/${det.json.totalPrograms} vs field-evaluate=${same?.score} rank ${same?.rank}/${fieldAll.results.length}`);
const unis = (await call('/admin/universities', { token: A })).json.universities;
ok('admin university unknown province = 400', (await call(`/admin/universities/${unis[0].uni_id}`, { method: 'PUT', token: A, body: { ...unis[0], province: 'ดาวอังคาร' } })).status === 400);
ok('admin university valid update ok', (await call(`/admin/universities/${unis[0].uni_id}`, { method: 'PUT', token: A, body: unis[0] })).status === 200);
// ties at rank 1 must not break dashboard
const tieRun = await call('/evaluate', { token: N, body: { weights: w(only('tuition')), options: { matchField: true }, save: true } });
ok('shared rank only when score and chance are equal', tieRun.json.results.every((x, i, a) => i === 0 || (x.rank === a[i - 1].rank) === (x.score === a[i - 1].score && x.admissionChance === a[i - 1].admissionChance)), `rank-1 count=${tieRun.json.results.filter((x) => x.rank === 1).length}`);
ok('program 0 / abc = 400, missing = 404', (await call('/programs/abc', { token: N })).status === 400 && (await call('/programs/999999', { token: N })).status === 404);
ok('delete run', (await call(`/evaluations/${sv.json.runId}`, { method: 'DELETE', token: N })).status === 200 && (await call(`/evaluations/${sv.json.runId}`, { token: N })).status === 404);

// ---- programs search
const pr = await call(`/programs?maxFee=16000&sort=fee`, { token: N });
ok('maxFee filter + sort', pr.json.programs.every((p, i, a) => p.tuition_fee <= 16000 && (i === 0 || p.tuition_fee >= a[i - 1].tuition_fee)), `n=${pr.json.programs.length}`);
ok('search SQL-injection-ish text safe', (await call(`/programs?q=${encodeURIComponent("'; DROP TABLE program;--")}`, { token: N })).status === 200);
ok('sort param injection ignored', (await call(`/programs?sort=${encodeURIComponent('p.tuition_fee; DROP TABLE users')}`, { token: N })).status === 200);

// ---- admin: edit program → cache invalidated → evaluate changes; then restore
const all = (await call('/admin/programs', { token: A })).json.programs;
const target = all.find((p) => p.short_name === 'มน.' && p.program_name === 'วิทยาการคอมพิวเตอร์');
const before = (await ev(only('tuition'))).results.find((x) => x.program.program_id === target.program_id);
const upd = await call(`/admin/programs/${target.program_id}`, { method: 'PUT', token: A, body: { ...target, tuition_fee: 1000, yearly_cost: 2000 } });
const after = (await ev(only('tuition'))).results[0];
ok('admin edit → evaluation reflects immediately (cache bust)', upd.status === 200 && after.program.program_id === target.program_id && after.program.tuition_fee === 1000, `before fee ${before.program.tuition_fee}, after top ${after.program.short_name} ${after.program.tuition_fee}`);
ok('admin restore program', (await call(`/admin/programs/${target.program_id}`, { method: 'PUT', token: A, body: target })).status === 200);
ok('admin invalid program (fee -1, gpa 9) = 400', (await call(`/admin/programs/${target.program_id}`, { method: 'PUT', token: A, body: { ...target, tuition_fee: -1, min_gpa: 9 } })).status === 400);

// ---- admin: CSV export → import roundtrip (dry run)
const csv = await (await fetch(`${B}/admin/programs/export.csv`, { headers: { Authorization: `Bearer ${A}` } })).text();
const imp = await call('/admin/programs/import', { token: A, body: { csv, dryRun: true } });
ok('CSV export→import dry-run: all rows valid', imp.status === 200 && imp.json.errors.length === 0 && imp.json.valid === all.length, `total=${imp.json?.total} valid=${imp.json?.valid} errors=${imp.json?.errors?.length} first=${JSON.stringify(imp.json?.errors?.[0] ?? '')}`);
const badCsv = 'university,program_name,faculty,field,tuition_fee,min_gpa,min_score,capacity,ranking\nมน.,ทดสอบ,คณะ,วิทยาศาสตร์,"17,100",2.5,45,80,12\nไม่มีจริง,x,y,z,1,1,1,1,1\nมน.,ทดสอบ,คณะ,วิทยาศาสตร์,abc,2.5,45,80,12\nมน.,ทดสอบ2,คณะ,วิทยาศาสตร์,100,5,45,80,12';
const bi = await call('/admin/programs/import', { token: A, body: { csv: badCsv, dryRun: true } });
ok('CSV: "17,100" accepted, bad rows reported', bi.json.valid === 1 && bi.json.errors.length === 3, `valid=${bi.json?.valid} errors=${JSON.stringify(bi.json?.errors)}`);
const bf = await call('/admin/programs/import', { token: A, body: { csv: 'university,program_name,faculty,field,tuition_fee,min_gpa,min_score,capacity,ranking\nมน.,ทดสอบสาขาแปลก,คณะ,สาขาที่ไม่มีในระบบ,100,2,40,10,1', dryRun: true } });
ok('CSV: unknown field group rejected', bf.json.valid === 0, `valid=${bf.json?.valid}`);

// ---- admin: disable a criterion → still works with 3; restore
const ac = (await call('/admin/criteria', { token: A })).json.criteria;
const loc = ac.find((c) => c.code === 'location');
await call(`/admin/criteria/${loc.criteria_id}`, { method: 'PUT', token: A, body: { ...loc, is_active: false } });
const e3 = await call('/evaluate', { token: N, body: { options: { matchField: true } } });
ok('criterion disabled → evaluate uses 3 criteria', e3.status === 200 && e3.json.weights.length === 3 && Math.abs(e3.json.weights.reduce((s, x) => s + x.weight, 0) - 1) < 0.001, `status=${e3.status} n=${e3.json?.weights?.length}`);
await call(`/admin/criteria/${loc.criteria_id}`, { method: 'PUT', token: A, body: { ...loc, is_active: true } });
ok('criterion restored', (await call('/criteria', { token: N })).json.criteria.length === 4);

// ---- admin stats / users
const st = await call('/admin/stats', { token: A });
ok('admin stats (with tied rank-1 runs present)', st.status === 200 && st.json.counts?.programs === all.length && st.json.recentRuns.length > 0, `status=${st.status} ${JSON.stringify(st.json?.counts ?? st.json)}`);
// ---- ค่าเล่าเรียนต่อปี: มวล. (3 เทอม/ปี) = ค่าเทอม × 3, ที่อื่น × 2
const wu = all.filter((p) => p.short_name === 'มวล.'), nu = all.filter((p) => p.short_name === 'มน.');
ok('yearly cost: WU = fee × 3, NU = fee × 2', wu.length > 0 && wu.every((p) => p.yearly_cost === p.tuition_fee * 3) && nu.every((p) => p.yearly_cost === p.tuition_fee * 2), `WU ${wu[0]?.tuition_fee}→${wu[0]?.yearly_cost}`);
const blank = await call(`/admin/programs/${target.program_id}`, { method: 'PUT', token: A, body: { ...target, yearly_cost: '' } });
ok('admin: blank yearly cost defaults to fee × 2', blank.status === 200 && blank.json.program.yearly_cost === target.tuition_fee * 2, `yearly=${blank.json?.program?.yearly_cost}`);
const oldCsv = await call('/admin/programs/import', { token: A, body: { csv: 'university,program_name,faculty,field,tuition_fee,min_gpa,min_score,capacity,ranking\nมน.,ทดสอบไม่มีคอลัมน์รายปี,คณะ,วิทยาศาสตร์,17100,2.5,45,80,12', dryRun: true } });
ok('CSV without yearly_cost column still accepted', oldCsv.json.valid === 1 && oldCsv.json.errors.length === 0);
// ---- ตำแหน่งจริง (lat/lng) และระยะทางถึงพิกัดมหาวิทยาลัย
const geo = await call('/profile', { method: 'PUT', token: N, body: { home_lat: 16.74812345, home_lng: 100.19398765 } });
ok('profile stores lat/lng rounded to 3 decimals', geo.status === 200 && geo.json.profile.home_lat === 16.748 && geo.json.profile.home_lng === 100.194, JSON.stringify([geo.json?.profile?.home_lat, geo.json?.profile?.home_lng]));
ok('profile lat out of range = 400', (await call('/profile', { method: 'PUT', token: N, body: { home_lat: 123, home_lng: 100 } })).status === 400);
const near = (await call('/evaluate', { token: N, body: { weights: w(only('location')), options: { matchField: true } } })).json.results[0];
ok('exact location → NU is ~0 km', near.program.short_name === 'มน.' && near.distanceKm <= 1, `${near.program.short_name} ${near.distanceKm} km`);
const withDist = (await call('/programs?sort=fee', { token: N })).json.programs;
ok('program search returns distance + campus coords', withDist.every((p) => Number.isFinite(p.distanceKm) && p.uni_lat != null && p.uni_lng != null));
const half = await call('/profile', { method: 'PUT', token: N, body: { home_lat: 16.7, home_lng: null } });
ok('lat without lng is discarded', half.status === 200 && half.json.profile.home_lat == null && half.json.profile.home_lng == null);
// ---- สถิติ TCAS จริง
const real = all.filter((p) => p.score_source);
ok('real TCAS stats on most programs', real.length >= 200 && real.every((p) => p.max_score >= p.min_score && p.min_gpa >= 0 && p.min_gpa <= 4 && Number(p.gpax_weight) >= 0 && Number(p.gpax_weight) <= 1 && p.applicants >= 0), `real=${real.length}/${all.length}`);
ok('admin users list', (await call('/admin/users', { token: A })).status === 200);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
