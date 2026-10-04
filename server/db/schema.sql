-- =====================================================================
-- University & Program Selection DSS — PostgreSQL schema
-- แปลงจาก ER Diagram ใน Project-1 (9 เอนทิตี) + ปรับปรุง 1 จุด:
--   เพิ่มตาราง evaluation_run เพื่อรวมผลการประเมินที่คำนวณ "ในรอบเดียวกัน"
--   (เดิม EVALUATION ผูกกับหลักสูตรทีละแถว ทำให้ดูประวัติย้อนหลังเป็นรอบไม่ได้)
-- หมายเหตุ: ใช้ชื่อ users แทน USER เพราะ USER เป็นคำสงวนของ PostgreSQL
-- =====================================================================

DROP TABLE IF EXISTS saved_list, evaluation_detail, evaluation, evaluation_run,
  user_weight, criteria, program, university, student_profile, users CASCADE;
DROP TYPE IF EXISTS user_role, uni_type, criteria_type CASCADE;

CREATE TYPE user_role     AS ENUM ('student', 'admin');
CREATE TYPE uni_type      AS ENUM ('รัฐ', 'เอกชน');
CREATE TYPE criteria_type AS ENUM ('benefit', 'cost');

-- USER : บัญชีผู้ใช้ทุกประเภท
CREATE TABLE users (
  user_id     SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(100) NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,              -- scrypt hash
  role        user_role    NOT NULL DEFAULT 'student',
  phone       VARCHAR(15),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- STUDENT_PROFILE : โปรไฟล์ผู้สมัคร (1:1 กับ users)
CREATE TABLE student_profile (
  profile_id        SERIAL PRIMARY KEY,
  user_id           INT NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
  gpa               DECIMAL(3,2) CHECK (gpa BETWEEN 0 AND 4),
  exam_score        DECIMAL(5,2) CHECK (exam_score BETWEEN 0 AND 100), -- คะแนนสอบ TCAS (TGAT/TPAT/A-Level) คิดเป็นร้อยละ
  subject_scores    JSONB,                        -- คะแนนรายวิชา (ไม่บังคับ) เช่น {"tgat":70,"a61":55} ใช้คิดคะแนนรวมตามสูตรของแต่ละหลักสูตร
  budget            DECIMAL(10,2),                -- งบค่าเล่าเรียนต่อปี
  home_province     VARCHAR(50),                  -- จังหวัดที่อยู่ ใช้คิดระยะทางถึงมหาวิทยาลัย (NULL = ยังไม่ระบุ)
  home_lat          DECIMAL(8,5),                 -- ตำแหน่งจริงจากเบราว์เซอร์ (ผู้ใช้กดอนุญาตเอง ปัดเหลือทศนิยม 3 ตำแหน่ง ≈ 100 ม.)
  home_lng          DECIMAL(8,5),                 --   มีค่า = ใช้แทนพิกัดตัวจังหวัด
  preferred_region  VARCHAR(50),                  -- NULL / 'ทั้งหมด' = ไม่จำกัดภูมิภาค
  interest_field    VARCHAR(100),                 -- NULL = ทุกสาขา
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- UNIVERSITY
CREATE TABLE university (
  uni_id    SERIAL PRIMARY KEY,
  uni_name  VARCHAR(150) NOT NULL UNIQUE,
  short_name VARCHAR(20),
  region    VARCHAR(50)  NOT NULL,
  province  VARCHAR(50),
  lat       DECIMAL(8,5),          -- พิกัดวิทยาเขตหลัก ใช้วัดระยะทางจากบ้านผู้ใช้ (NULL = ใช้พิกัดตัวจังหวัด)
  lng       DECIMAL(8,5),
  type      uni_type     NOT NULL,
  website   VARCHAR(255)
);

-- PROGRAM : หลักสูตรที่เปิดสอน (N:1 กับ university)
CREATE TABLE program (
  program_id      SERIAL PRIMARY KEY,
  uni_id          INT NOT NULL REFERENCES university(uni_id) ON DELETE CASCADE,
  program_name    VARCHAR(150) NOT NULL,
  faculty         VARCHAR(100) NOT NULL,
  field           VARCHAR(100) NOT NULL,          -- กลุ่มสาขา ใช้กรองตามความสนใจ
  degree          VARCHAR(50)  NOT NULL DEFAULT 'ปริญญาตรี',
  tuition_fee     DECIMAL(10,2) NOT NULL CHECK (tuition_fee >= 0),   -- ค่าเทอมต่อ 1 ภาคการศึกษา (ค่าจริงจากประกาศ) ใช้แสดงผล
  yearly_cost     DECIMAL(10,2) NOT NULL CHECK (yearly_cost >= 0),   -- ค่าเล่าเรียนเฉลี่ยต่อปี = ค่าเทอม × จำนวนเทอมต่อปี ใช้คำนวณ SAW และเทียบกับงบ
  min_gpa         DECIMAL(3,2)  NOT NULL CHECK (min_gpa BETWEEN 0 AND 4),     -- GPAX ขั้นต่ำ: ตามประกาศเกณฑ์รอบ 3 เมื่อมีสถิติทางการ (0 = ไม่กำหนด) ไม่งั้นเป็นค่าประมาณ
  gpax_weight     DECIMAL(3,2)  NOT NULL DEFAULT 0 CHECK (gpax_weight BETWEEN 0 AND 1), -- สัดส่วน GPAX ในคะแนนรวมที่ใช้คัดเลือกรอบ 3 (ใช้แปลงคะแนนของผู้ใช้ให้เทียบกับสถิติได้)
  min_score       DECIMAL(5,2)  NOT NULL CHECK (min_score BETWEEN 0 AND 100), -- คะแนนต่ำสุดของผู้ที่สอบติด (จริงเมื่อ score_source มีค่า ไม่งั้นเป็นค่าประมาณ)
  score_weights   JSONB,                                                      -- สูตรคะแนนคัดเลือกรอบ 3 รายวิชา (%) ตามประกาศ เช่น {"tgat":20,"a61":40,"a82":40} (NULL = ไม่ทราบ)
  max_score       DECIMAL(5,2)  CHECK (max_score BETWEEN 0 AND 100),          -- คะแนนสูงสุดของผู้ที่สอบติด (มีเฉพาะข้อมูลจริง)
  applicants      INT,                                                        -- จำนวนผู้สมัครรอบ 3 (มีเฉพาะข้อมูลจริง)
  score_source    VARCHAR(60),                                                -- ที่มาของสถิติ เช่น 'TCAS69 รอบ 3 Admission' (NULL = ค่าประมาณ)
  capacity        INT           NOT NULL CHECK (capacity > 0),                -- จำนวนรับ (จริงเมื่อ score_source มีค่า)
  ranking         INT           NOT NULL CHECK (ranking > 0),         -- อันดับมหาวิทยาลัยในไทย ตาม THE WUR (1 = ดีที่สุด)
  description     TEXT,
  UNIQUE (uni_id, program_name)
);

-- CRITERIA : เกณฑ์มาตรฐานกลาง (Admin จัดการ)
--   code ผูกเกณฑ์กับแหล่งข้อมูลที่ SAW Engine ใช้คำนวณ
CREATE TABLE criteria (
  criteria_id     SERIAL PRIMARY KEY,
  code            VARCHAR(30)  NOT NULL UNIQUE,
  criteria_name   VARCHAR(100) NOT NULL,
  type            criteria_type NOT NULL,
  description     VARCHAR(255),
  default_weight  DECIMAL(5,2) NOT NULL DEFAULT 0 CHECK (default_weight BETWEEN 0 AND 100),
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order      INT          NOT NULL DEFAULT 0
);

-- USER_WEIGHT : น้ำหนักที่ผู้ใช้กำหนดต่อเกณฑ์ (M:N users–criteria)
CREATE TABLE user_weight (
  weight_id    SERIAL PRIMARY KEY,
  user_id      INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  criteria_id  INT NOT NULL REFERENCES criteria(criteria_id) ON DELETE CASCADE,
  weight_value DECIMAL(5,2) NOT NULL CHECK (weight_value BETWEEN 0 AND 100),
  UNIQUE (user_id, criteria_id)
);

-- EVALUATION_RUN : การกดคำนวณ 1 ครั้ง (เพิ่มใหม่จาก Project-1)
CREATE TABLE evaluation_run (
  run_id            SERIAL PRIMARY KEY,
  user_id           INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  run_date          TIMESTAMPTZ NOT NULL DEFAULT now(),
  profile_snapshot  JSONB NOT NULL,   -- โปรไฟล์ ณ เวลาที่คำนวณ
  weights_snapshot  JSONB NOT NULL,   -- น้ำหนัก ณ เวลาที่คำนวณ
  options           JSONB NOT NULL DEFAULT '{}'::jsonb,
  stability         DECIMAL(5,2)      -- ผลวิเคราะห์ความไว (% ที่อันดับ 1 ไม่เปลี่ยน)
);

-- EVALUATION : คะแนนรวม SAW ของแต่ละหลักสูตรในรอบนั้น
CREATE TABLE evaluation (
  eval_id     SERIAL PRIMARY KEY,
  run_id      INT NOT NULL REFERENCES evaluation_run(run_id) ON DELETE CASCADE,
  user_id     INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  program_id  INT NOT NULL REFERENCES program(program_id) ON DELETE CASCADE,
  eval_date   TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_score DECIMAL(6,2) NOT NULL,   -- 0–100
  rank        INT NOT NULL,
  admission_chance DECIMAL(5,2),
  risk_level  VARCHAR(10),             -- low / medium / high
  flags       JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- EVALUATION_DETAIL : คะแนนรายเกณฑ์
CREATE TABLE evaluation_detail (
  detail_id        SERIAL PRIMARY KEY,
  eval_id          INT NOT NULL REFERENCES evaluation(eval_id) ON DELETE CASCADE,
  criteria_id      INT NOT NULL REFERENCES criteria(criteria_id) ON DELETE CASCADE,
  raw_value        DECIMAL(12,2),
  normalized_score DECIMAL(6,4) NOT NULL,
  weighted_score   DECIMAL(6,4) NOT NULL
);

-- SAVED_LIST : รายการโปรด
CREATE TABLE saved_list (
  save_id     SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  program_id  INT NOT NULL REFERENCES program(program_id) ON DELETE CASCADE,
  saved_date  TIMESTAMPTZ NOT NULL DEFAULT now(),
  note        VARCHAR(255),
  UNIQUE (user_id, program_id)
);

CREATE INDEX idx_program_uni      ON program(uni_id);
CREATE INDEX idx_eval_run         ON evaluation(run_id);
CREATE INDEX idx_eval_program     ON evaluation(program_id);
CREATE INDEX idx_run_user         ON evaluation_run(user_id, run_date DESC);
CREATE INDEX idx_detail_eval      ON evaluation_detail(eval_id);
