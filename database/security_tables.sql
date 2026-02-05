-- Security Enhancement Tables for 3PL FAST
-- Run these in Supabase SQL Editor

-- 1. IP Whitelist Table
CREATE TABLE IF NOT EXISTS ip_whitelist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ip_address VARCHAR(45) NOT NULL UNIQUE,
  description TEXT,
  user_id UUID REFERENCES user_profiles(id),
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ip_whitelist_active ON ip_whitelist(ip_address, is_active);

-- 2. Two-Factor Authentication Table
CREATE TABLE IF NOT EXISTS user_2fa (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES user_profiles(id) UNIQUE NOT NULL,
  secret VARCHAR(255) NOT NULL,
  is_enabled BOOLEAN DEFAULT false,
  backup_codes TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Login Audit Table
CREATE TABLE IF NOT EXISTS login_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES user_profiles(id),
  email VARCHAR(255),
  ip_address VARCHAR(45),
  user_agent TEXT,
  login_status VARCHAR(50) NOT NULL,
  failure_reason TEXT,
  location JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_login_audit_user ON login_audit(user_id, created_at DESC);
CREATE INDEX idx_login_audit_status ON login_audit(login_status, created_at DESC);

-- 4. User Activity Timeline Table
CREATE TABLE IF NOT EXISTS user_activity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES user_profiles(id) NOT NULL,
  activity_type VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id UUID,
  description TEXT,
  metadata JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_activity_user ON user_activity(user_id, created_at DESC);
CREATE INDEX idx_user_activity_type ON user_activity(activity_type, created_at DESC);
CREATE INDEX idx_user_activity_entity ON user_activity(entity_type, entity_id);

-- 5. Session Management Table
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES user_profiles(id) NOT NULL,
  session_token VARCHAR(255) UNIQUE NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  is_2fa_verified BOOLEAN DEFAULT false,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  last_activity TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX idx_user_sessions_user ON user_sessions(user_id, expires_at);

-- Enable Row Level Security
ALTER TABLE ip_whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_2fa ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins manage IP whitelist" ON ip_whitelist
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Users manage own 2FA" ON user_2fa
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Users view own login audit" ON login_audit
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins view all login audit" ON login_audit
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Users view own activity" ON user_activity
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins view all activity" ON user_activity
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Users manage own sessions" ON user_sessions
  FOR ALL USING (user_id = auth.uid());
