-- IMMS Real-time Meeting System - Supabase Schema

-- Users table (Supabase Auth 연동)
-- Supabase Auth가 자동으로 auth.users 테이블을 생성하므로 별도 users 테이블은 불필요
-- 대신 user_profiles 테이블로 추가 정보 저장

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'participant',
  team TEXT,
  job TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Meetings table
CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  goal TEXT,
  host_id UUID NOT NULL REFERENCES auth.users(id),
  meeting_mode TEXT NOT NULL DEFAULT 'normal' CHECK (meeting_mode IN ('normal', 'demo_balance')),
  status TEXT DEFAULT 'waiting', -- waiting, in_progress, completed
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Participants table
CREATE TABLE IF NOT EXISTS participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  role TEXT DEFAULT 'participant', -- host, participant
  UNIQUE(meeting_id, user_id)
);

-- Transcripts table
CREATE TABLE IF NOT EXISTS transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  speaker TEXT NOT NULL,
  text TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  canvas_stage TEXT NOT NULL DEFAULT 'ideation',
  canvas_target_id TEXT NOT NULL DEFAULT '',
  turn_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Existing projects created before stage-aware STT need these columns.
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS canvas_stage TEXT NOT NULL DEFAULT 'ideation';
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS canvas_target_id TEXT NOT NULL DEFAULT '';

-- Agendas table
CREATE TABLE IF NOT EXISTS agendas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  state TEXT DEFAULT 'PROPOSED', -- PROPOSED, ACTIVE, CLOSING, CLOSED
  flow_type TEXT DEFAULT 'discussion', -- discussion, decision, action-planning
  summary TEXT,
  keywords TEXT[], -- PostgreSQL array type
  start_turn_id INTEGER,
  end_turn_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Decisions table
CREATE TABLE IF NOT EXISTS decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  agenda_id UUID REFERENCES agendas(id) ON DELETE SET NULL,
  issue TEXT NOT NULL,
  conclusion TEXT,
  final_status TEXT DEFAULT 'Pending', -- Approved, Pending, Rejected
  evidence JSONB, -- Store as JSON array
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Action Items table
CREATE TABLE IF NOT EXISTS action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  agenda_id UUID REFERENCES agendas(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  owner TEXT,
  due_date TEXT,
  status TEXT DEFAULT 'Open', -- Open, In progress, Done
  evidence JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reports table
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  content JSONB NOT NULL, -- Store full report as JSON
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shared runtime state for each meeting
CREATE TABLE IF NOT EXISTS meeting_runtime_states (
  meeting_id UUID PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,
  shared_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  llm_cache JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Existing projects created before demo mode metadata need this column.
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS meeting_mode TEXT NOT NULL DEFAULT 'normal';
UPDATE meetings SET meeting_mode = 'normal' WHERE meeting_mode IS NULL OR meeting_mode NOT IN ('normal', 'demo_balance');
ALTER TABLE meetings ALTER COLUMN meeting_mode SET DEFAULT 'normal';
ALTER TABLE meetings ALTER COLUMN meeting_mode SET NOT NULL;
DO $$
BEGIN
  ALTER TABLE meetings
    ADD CONSTRAINT meetings_meeting_mode_check CHECK (meeting_mode IN ('normal', 'demo_balance'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

UPDATE meetings
SET meeting_mode = 'demo_balance'
FROM meeting_runtime_states
WHERE meeting_runtime_states.meeting_id = meetings.id
  AND COALESCE(meeting_runtime_states.shared_state->'demo_config'->>'mode', '') = 'demo_balance'
  AND COALESCE(meeting_runtime_states.shared_state->'demo_config'->>'option_a', '') <> ''
  AND COALESCE(meeting_runtime_states.shared_state->'demo_config'->>'option_b', '') <> '';

-- Personal runtime state for each user inside a meeting
CREATE TABLE IF NOT EXISTS meeting_user_states (
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  personal_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (meeting_id, user_id)
);

-- Enable Row Level Security (RLS)
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_runtime_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_user_states ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- user_profiles: 본인 프로필만 읽기/쓰기
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
CREATE POLICY "Users can view own profile" ON user_profiles FOR SELECT TO authenticated USING ((select auth.uid()) = id);
CREATE POLICY "Users can update own profile" ON user_profiles FOR UPDATE TO authenticated USING ((select auth.uid()) = id) WITH CHECK ((select auth.uid()) = id);
CREATE POLICY "Users can insert own profile" ON user_profiles FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = id);

-- meetings: 로그인한 모든 사용자가 모든 회의를 보고, 본인 host_id로 회의를 만들 수 있음
DROP POLICY IF EXISTS "Anyone can view meetings they participate in" ON meetings;
DROP POLICY IF EXISTS "Authenticated users can view all meetings" ON meetings;
DROP POLICY IF EXISTS "Users can create meetings" ON meetings;
DROP POLICY IF EXISTS "Hosts can update own meetings" ON meetings;
DROP POLICY IF EXISTS "Authenticated users can update meetings" ON meetings;
DROP POLICY IF EXISTS "Authenticated users can delete meetings" ON meetings;
CREATE POLICY "Authenticated users can view all meetings" ON meetings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create meetings" ON meetings FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = host_id);
CREATE POLICY "Authenticated users can update meetings" ON meetings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete meetings" ON meetings FOR DELETE TO authenticated USING (true);

-- participants: 로그인한 모든 사용자가 참여자 목록을 볼 수 있고, 본인 참여 기록을 만들 수 있음
DROP POLICY IF EXISTS "Anyone can view participants of their meetings" ON participants;
DROP POLICY IF EXISTS "Authenticated users can view all participants" ON participants;
DROP POLICY IF EXISTS "Users can join meetings" ON participants;
CREATE POLICY "Authenticated users can view all participants" ON participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can join meetings" ON participants FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);

-- transcripts: 로그인한 모든 사용자가 모든 회의 전사를 읽을 수 있음
DROP POLICY IF EXISTS "Participants can view transcripts" ON transcripts;
DROP POLICY IF EXISTS "Authenticated users can view all transcripts" ON transcripts;
DROP POLICY IF EXISTS "Participants can insert transcripts" ON transcripts;
CREATE POLICY "Authenticated users can view all transcripts" ON transcripts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Participants can insert transcripts" ON transcripts FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);

-- agendas, decisions, action_items, reports: 로그인한 모든 사용자가 모든 회의 결과를 읽을 수 있음
DROP POLICY IF EXISTS "Participants can view agendas" ON agendas;
DROP POLICY IF EXISTS "Authenticated users can view all agendas" ON agendas;
CREATE POLICY "Authenticated users can view all agendas" ON agendas FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Participants can view decisions" ON decisions;
DROP POLICY IF EXISTS "Authenticated users can view all decisions" ON decisions;
CREATE POLICY "Authenticated users can view all decisions" ON decisions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Participants can view action_items" ON action_items;
DROP POLICY IF EXISTS "Authenticated users can view all action_items" ON action_items;
CREATE POLICY "Authenticated users can view all action_items" ON action_items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Participants can view reports" ON reports;
DROP POLICY IF EXISTS "Authenticated users can view all reports" ON reports;
CREATE POLICY "Authenticated users can view all reports" ON reports FOR SELECT TO authenticated USING (true);

-- shared runtime state: 로그인한 모든 사용자가 모든 회의 공유 캔버스 상태를 읽을 수 있음
DROP POLICY IF EXISTS "Participants can view runtime states" ON meeting_runtime_states;
DROP POLICY IF EXISTS "Authenticated users can view all runtime states" ON meeting_runtime_states;
CREATE POLICY "Authenticated users can view all runtime states" ON meeting_runtime_states FOR SELECT TO authenticated USING (true);

-- personal runtime state: 모든 회의 접근은 허용하되, 개인 상태는 본인 것만 읽기/쓰기
DROP POLICY IF EXISTS "Participants can view own meeting user states" ON meeting_user_states;
DROP POLICY IF EXISTS "Users can view own meeting user states" ON meeting_user_states;
DROP POLICY IF EXISTS "Participants can insert own meeting user states" ON meeting_user_states;
DROP POLICY IF EXISTS "Users can insert own meeting user states" ON meeting_user_states;
DROP POLICY IF EXISTS "Participants can update own meeting user states" ON meeting_user_states;
DROP POLICY IF EXISTS "Users can update own meeting user states" ON meeting_user_states;
CREATE POLICY "Users can view own meeting user states" ON meeting_user_states FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY "Users can insert own meeting user states" ON meeting_user_states FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Users can update own meeting user states" ON meeting_user_states FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
