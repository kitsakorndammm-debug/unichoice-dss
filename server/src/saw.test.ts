// ทดสอบ SAW Engine: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, admissionChance, comparableScore, subjectScore, flagsFor, type CriteriaDef, type ProgramData, type Profile } from './saw.js';

const base: Omit<ProgramData, 'program_id' | 'program_name' | 'tuition_fee' | 'capacity'> = {
  uni_name: 'ม.ตัวอย่าง', region: 'กลาง', field: 'คอมพิวเตอร์และไอที', min_gpa: 2.5, min_score: 40,
  ranking: 10,
};
// เกณฑ์ benefit ในชุดทดสอบใช้ capacity (ตัวเลขเดียวกับตัวอย่างในสไลด์)
const P = (id: number, name: string, fee: number, cap: number): ProgramData => ({ ...base, program_id: id, program_name: name, tuition_fee: fee, capacity: cap });
const profile: Profile = { gpa: 3.2, exam_score: 60, budget: null, preferred_region: null, interest_field: null };

test('ตรงกับตัวอย่างในสไลด์ Project-1 (หน้า 9)', () => {
  const criteria: CriteriaDef[] = [
    { criteria_id: 1, code: 'tuition', criteria_name: 'ค่าเทอม', type: 'cost' },
    { criteria_id: 2, code: 'capacity', criteria_name: 'เกณฑ์ benefit', type: 'benefit' },
  ];
  const r = evaluate([P(1, 'A', 30000, 94), P(2, 'B', 45000, 88), P(3, 'C', 35000, 80)], criteria, { 1: 40, 2: 60 }, profile);
  assert.deepEqual(r.results.map((x) => x.program.program_name), ['A', 'C', 'B']);
  assert.equal(r.results[0].score, 100);
  assert.equal(Math.round(r.results[1].score), 85);
  assert.equal(Math.round(r.results[2].score), 83);
});

test('Business rules: ตัดหลักสูตรที่เกินงบ/ไม่ผ่านเกณฑ์', () => {
  const criteria: CriteriaDef[] = [{ criteria_id: 1, code: 'tuition', criteria_name: 'ค่าเทอม', type: 'cost' }];
  const progs = [P(1, 'ถูก', 30000, 90), P(2, 'แพง', 150000, 90), { ...P(3, 'เกรดสูง', 30000, 90), min_gpa: 3.8 }];
  const r = evaluate(progs, criteria, { 1: 100 }, { ...profile, budget: 100000 }, { withinBudget: true, eligibleOnly: true });
  assert.deepEqual(r.results.map((x) => x.program.program_name), ['ถูก']);
  assert.equal(r.excluded.length, 2);
});

test('โอกาสสอบติดเพิ่มตามส่วนต่างคะแนน', () => {
  const p = P(1, 'X', 1, 1);
  assert.ok(admissionChance({ ...profile, exam_score: 80 }, p) > admissionChance({ ...profile, exam_score: 45 }, p));
  assert.ok(admissionChance({ ...profile, gpa: 2.0, exam_score: 30 }, p) < 45);
});

test('เกณฑ์อันดับปรับสเกลแบบเส้นตรง: ดีสุด = 100, แย่สุด = 0, อันดับ 2 ไม่ถูกหักครึ่ง', () => {
  const criteria: CriteriaDef[] = [{ criteria_id: 1, code: 'ranking', criteria_name: 'อันดับ', type: 'cost' }];
  const progs = [1, 2, 22].map((rank, i) => ({ ...P(i + 1, `อันดับ ${rank}`, 1, 1), ranking: rank }));
  const r = evaluate(progs, criteria, { 1: 100 }, profile);
  assert.deepEqual(r.results.map((x) => x.score), [100, 95.24, 0]);
});

test('โอกาสสอบติดต่ำเท่ากันทุกตัวเลือก ต้องได้คะแนนต่ำ ไม่ใช่เต็ม', () => {
  const criteria: CriteriaDef[] = [{ criteria_id: 1, code: 'admission', criteria_name: 'โอกาสสอบติด', type: 'benefit' }];
  const hard = (id: number) => ({ ...P(id, `ยาก ${id}`, 1, 1), min_gpa: 3.75, min_score: 85 });
  const r = evaluate([hard(1), hard(2)], criteria, { 1: 100 }, { ...profile, gpa: 2.2, exam_score: 32 });
  assert.equal(r.results[0].admissionChance, 5);
  assert.equal(r.results[0].score, 5);
});

test('ค่าเล่าเรียนเทียบเป็นรายปี: 3 เทอมต่อปีแพงกว่า 2 เทอมแม้ค่าเทอมต่อเทอมถูกกว่า', () => {
  const criteria: CriteriaDef[] = [{ criteria_id: 1, code: 'tuition', criteria_name: 'ค่าเล่าเรียนต่อปี', type: 'cost' }];
  const two = P(1, '2 เทอม เทอมละ 30,000', 30000, 1);                             // 60,000/ปี (ค่าเริ่มต้น × 2)
  const three = { ...P(2, '3 เทอม เทอมละ 25,000', 25000, 1), yearly_cost: 75000 }; // 75,000/ปี
  const r = evaluate([three, two], criteria, { 1: 100 }, { ...profile, budget: 70000 });
  assert.equal(r.results[0].program.program_id, 1);
  assert.deepEqual(r.results[1].flags, ['over_budget']); // งบเทียบกับค่าเล่าเรียนต่อปี
  assert.deepEqual(r.results[0].flags, []);
});

test('คะแนนเท่ากันได้อันดับร่วม', () => {
  const criteria: CriteriaDef[] = [{ criteria_id: 1, code: 'tuition', criteria_name: 'ค่าเทอม', type: 'cost' }];
  const r = evaluate([P(1, 'A', 100, 1), P(2, 'B', 100, 1), P(3, 'C', 200, 1)], criteria, { 1: 100 }, profile);
  assert.deepEqual(r.results.map((x) => x.rank), [1, 1, 3]);
});

test('ความใกล้บ้านคิดจากระยะทางจากจังหวัดที่อยู่ ไม่ใช่ภูมิภาค', () => {
  const criteria: CriteriaDef[] = [{ criteria_id: 1, code: 'location', criteria_name: 'ความใกล้บ้าน', type: 'benefit' }];
  const at = (id: number, province: string) => ({ ...P(id, province, 1, 1), province, region: 'เหนือ' });
  const r = evaluate([at(1, 'เชียงราย'), at(2, 'พิษณุโลก'), at(3, 'สงขลา')], criteria, { 1: 100 }, { ...profile, home_province: 'พิษณุโลก', preferred_region: 'เหนือ' });
  assert.deepEqual(r.results.map((x) => x.program.program_name), ['พิษณุโลก', 'เชียงราย', 'สงขลา']);
  assert.equal(r.results[0].score, 100);
  assert.equal(r.results[0].distanceKm, 0);
  assert.ok(r.results[1].distanceKm! > 300 && r.results[1].distanceKm! < 400); // พิษณุโลก–เชียงราย ราว 350 กม.
  assert.equal(r.results[2].score, 0);                                          // สงขลาไกลเกิน 1,000 กม.
});

test('มีตำแหน่งจริง (lat/lng) ใช้ตำแหน่งจริงแทนจังหวัด และวัดถึงพิกัดมหาวิทยาลัย', () => {
  const criteria: CriteriaDef[] = [{ criteria_id: 1, code: 'location', criteria_name: 'ความใกล้บ้าน', type: 'benefit' }];
  const nu = { ...P(1, 'มน.', 1, 1), province: 'พิษณุโลก', uni_lat: 16.748, uni_lng: 100.193 };
  const cmu = { ...P(2, 'มช.', 1, 1), province: 'เชียงใหม่', uni_lat: 18.803, uni_lng: 98.953 };
  // ผู้ใช้เลือกจังหวัดพิษณุโลกไว้ แต่ตำแหน่งจริงอยู่ในตัวเมืองเชียงใหม่ → ต้องยึดตำแหน่งจริง
  const r = evaluate([nu, cmu], criteria, { 1: 100 }, { ...profile, home_province: 'พิษณุโลก', home_lat: 18.79, home_lng: 98.98 });
  assert.equal(r.results[0].program.program_name, 'มช.');
  assert.ok(r.results[0].distanceKm! <= 5);
  assert.ok(r.results[1].distanceKm! > 230 && r.results[1].distanceKm! < 290);
});

test('มีสถิติคะแนนจริง: โอกาสสอบติดคิดจากตำแหน่งระหว่างคะแนนต่ำสุด–สูงสุด ไม่ใช้ GPA', () => {
  const real = { ...P(1, 'จริง', 1, 1), min_gpa: 0, min_score: 50, max_score: 70 };
  const at = (exam: number, gpa = 2.0) => admissionChance({ ...profile, gpa, exam_score: exam }, real);
  assert.equal(at(50), 50);          // เท่าคนสุดท้ายที่ติด
  assert.equal(at(60), 73);          // กึ่งกลาง
  assert.equal(at(70), 95);          // เท่าคนที่ได้คะแนนสูงสุด
  assert.equal(at(30), 5);           // ต่ำกว่ามาก
  assert.equal(at(60, 2.0), at(60, 4.0)); // GPA ไม่มีผล
});

test('หลักสูตรที่คัดเลือกด้วย GPAX: เทียบสถิติด้วย GPAX (ร้อยละ) ผสมคะแนนสอบตามสัดส่วนของหลักสูตร', () => {
  const real = { ...P(1, 'จริง', 1, 1), min_gpa: 0, min_score: 80, max_score: 100 };
  const me = { ...profile, gpa: 3.6, exam_score: 50 }; // GPAX 3.6 = ร้อยละ 90
  assert.equal(comparableScore(me, { ...real, gpax_weight: 0 }), 50);
  assert.equal(comparableScore(me, { ...real, gpax_weight: 1 }), 90);
  assert.equal(comparableScore(me, { ...real, gpax_weight: 0.5 }), 70);
  assert.equal(admissionChance(me, { ...real, gpax_weight: 1 }), 73);  // 90 อยู่กึ่งกลางช่วง 80–100
  assert.equal(admissionChance(me, { ...real, gpax_weight: 0 }), 5);   // คะแนนสอบ 50 ต่ำกว่าช่วงมาก
  assert.deepEqual(flagsFor({ ...real, gpax_weight: 1 }, me).includes('below_min_score'), false);
  assert.deepEqual(flagsFor({ ...real, gpax_weight: 0 }, me).includes('below_min_score'), true);
  // ไม่มีสถิติจริง (ค่าประมาณ) → ไม่ใช้สัดส่วน GPAX
  assert.equal(comparableScore(me, { ...real, max_score: null, gpax_weight: 1 }), 50);
});

test('คะแนนรายวิชา: คิดคะแนนรวมตามสูตรของหลักสูตร วิชาที่ไม่ได้กรอกใช้คะแนนสอบรวมแทน', () => {
  const prog = { ...P(1, 'จริง', 1, 1), min_gpa: 0, min_score: 60, max_score: 80, score_weights: { tgat: 20, a61: 40, a82: 40 } };
  const me = { ...profile, gpa: 3.0, exam_score: 50, subject_scores: { tgat: 70, a61: 55, a82: 75 } };
  assert.equal(subjectScore(me, prog), 66);                       // 70×0.2 + 55×0.4 + 75×0.4
  assert.equal(comparableScore(me, prog), 66);
  assert.equal(admissionChance(me, prog), 64);                    // 50 + 45 × (66−60)/20 = 63.5
  // กรอกไม่ครบ: วิชาที่ขาดใช้คะแนนสอบรวม (50)
  assert.equal(subjectScore({ ...me, subject_scores: { a61: 90 } }, prog), 66); // 50×0.2 + 90×0.4 + 50×0.4
  // สูตรมี GPAX: ใช้ GPA × 25
  assert.equal(subjectScore(me, { ...prog, score_weights: { gpax: 50, tgat: 50 } }), 72.5); // 75×0.5 + 70×0.5
  // ไม่ได้กรอกวิชาที่สูตรนี้ใช้เลย / ไม่รู้สูตร / ไม่มีสถิติจริง → กลับไปใช้คะแนนสอบรวม
  assert.equal(subjectScore({ ...me, subject_scores: { a66: 99 } }, prog), null);
  assert.equal(comparableScore({ ...me, subject_scores: { a66: 99 } }, prog), 50);
  assert.equal(subjectScore(me, { ...prog, score_weights: null }), null);
  assert.equal(subjectScore(me, { ...prog, max_score: null }), null);
  assert.equal(subjectScore({ ...me, subject_scores: null }, prog), null);
});

test('น้ำหนักรวมเป็น 0 ต้อง error', () => {
  const criteria: CriteriaDef[] = [{ criteria_id: 1, code: 'tuition', criteria_name: 'ค่าเทอม', type: 'cost' }];
  assert.throws(() => evaluate([P(1, 'A', 1, 1)], criteria, { 1: 0 }, profile));
});
