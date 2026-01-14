-- Feature Flags Schema
-- Provides feature flag management for zero-downtime deployments
-- Requirements: 10.5

-- Feature flags table
CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'disabled' CHECK (status IN ('disabled', 'enabled', 'rollout', 'deprecated')),
  targeting_strategy TEXT NOT NULL DEFAULT 'all_users' CHECK (targeting_strategy IN ('all_users', 'percentage', 'user_list', 'user_attributes', 'custom')),
  rollout_percentage INTEGER DEFAULT 0 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
  target_users TEXT[] DEFAULT ARRAY[]::TEXT[],
  attribute_rules JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- Feature flag evaluations table (for analytics)
CREATE TABLE IF NOT EXISTS feature_flag_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key TEXT NOT NULL,
  user_id UUID,
  result BOOLEAN NOT NULL,
  context JSONB DEFAULT '{}'::jsonb,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Feature flag audit log
CREATE TABLE IF NOT EXISTS feature_flag_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key TEXT NOT NULL,
  action TEXT NOT NULL,
  previous_state JSONB,
  new_state JSONB,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Deployment tracking table
CREATE TABLE IF NOT EXISTS deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id TEXT NOT NULL UNIQUE,
  version TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('development', 'staging', 'production')),
  strategy TEXT NOT NULL CHECK (strategy IN ('blue_green', 'canary', 'rolling', 'instant')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'rolled_back')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  rollback_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id)
);

-- Deployment steps table
CREATE TABLE IF NOT EXISTS deployment_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id UUID REFERENCES deployments(id) ON DELETE CASCADE,
  step_name TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON feature_flags(key);
CREATE INDEX IF NOT EXISTS idx_feature_flags_status ON feature_flags(status);
CREATE INDEX IF NOT EXISTS idx_feature_flags_is_active ON feature_flags(is_active);
CREATE INDEX IF NOT EXISTS idx_feature_flag_evaluations_feature_key ON feature_flag_evaluations(feature_key);
CREATE INDEX IF NOT EXISTS idx_feature_flag_evaluations_user_id ON feature_flag_evaluations(user_id);
CREATE INDEX IF NOT EXISTS idx_feature_flag_evaluations_evaluated_at ON feature_flag_evaluations(evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_feature_flag_audit_log_feature_key ON feature_flag_audit_log(feature_key);
CREATE INDEX IF NOT EXISTS idx_feature_flag_audit_log_created_at ON feature_flag_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deployments_deployment_id ON deployments(deployment_id);
CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);
CREATE INDEX IF NOT EXISTS idx_deployments_environment ON deployments(environment);
CREATE INDEX IF NOT EXISTS idx_deployment_steps_deployment_id ON deployment_steps(deployment_id);

-- Enable Row Level Security
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flag_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flag_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployment_steps ENABLE ROW LEVEL SECURITY;

-- RLS Policies for feature_flags
CREATE POLICY "Anyone can view active feature flags"
  ON feature_flags FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admin users can manage feature flags"
  ON feature_flags FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('admin', 'super_admin')
    )
  );

-- RLS Policies for feature_flag_evaluations
CREATE POLICY "Users can view their own evaluations"
  ON feature_flag_evaluations FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "System can insert evaluations"
  ON feature_flag_evaluations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admin users can view all evaluations"
  ON feature_flag_evaluations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('admin', 'super_admin')
    )
  );

-- RLS Policies for feature_flag_audit_log
CREATE POLICY "Admin users can view audit log"
  ON feature_flag_audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "System can insert audit log"
  ON feature_flag_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for deployments
CREATE POLICY "Admin users can view deployments"
  ON deployments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admin users can manage deployments"
  ON deployments FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('admin', 'super_admin')
    )
  );

-- RLS Policies for deployment_steps
CREATE POLICY "Admin users can view deployment steps"
  ON deployment_steps FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admin users can manage deployment steps"
  ON deployment_steps FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('admin', 'super_admin')
    )
  );

-- Function to get feature flag statistics
CREATE OR REPLACE FUNCTION get_feature_flag_statistics(flag_key TEXT)
RETURNS TABLE (
  total_evaluations BIGINT,
  enabled_count BIGINT,
  disabled_count BIGINT,
  enabled_percentage NUMERIC,
  unique_users BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_evaluations,
    COUNT(*) FILTER (WHERE result = true)::BIGINT as enabled_count,
    COUNT(*) FILTER (WHERE result = false)::BIGINT as disabled_count,
    CASE 
      WHEN COUNT(*) > 0 THEN 
        ROUND((COUNT(*) FILTER (WHERE result = true)::NUMERIC / COUNT(*)::NUMERIC) * 100, 2)
      ELSE 0
    END as enabled_percentage,
    COUNT(DISTINCT user_id)::BIGINT as unique_users
  FROM feature_flag_evaluations
  WHERE feature_key = flag_key
  AND evaluated_at > NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get deployment statistics
CREATE OR REPLACE FUNCTION get_deployment_statistics(days INTEGER DEFAULT 30)
RETURNS TABLE (
  total_deployments BIGINT,
  successful_deployments BIGINT,
  failed_deployments BIGINT,
  rolled_back_deployments BIGINT,
  average_duration_minutes NUMERIC,
  success_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_deployments,
    COUNT(*) FILTER (WHERE status = 'completed')::BIGINT as successful_deployments,
    COUNT(*) FILTER (WHERE status = 'failed')::BIGINT as failed_deployments,
    COUNT(*) FILTER (WHERE status = 'rolled_back')::BIGINT as rolled_back_deployments,
    AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) / 60)::NUMERIC as average_duration_minutes,
    CASE 
      WHEN COUNT(*) > 0 THEN 
        ROUND((COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC / COUNT(*)::NUMERIC) * 100, 2)
      ELSE 0
    END as success_rate
  FROM deployments
  WHERE started_at > NOW() - (days || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_feature_flag_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER feature_flags_updated_at
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION update_feature_flag_timestamp();

-- Trigger to log feature flag changes
CREATE OR REPLACE FUNCTION log_feature_flag_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO feature_flag_audit_log (
      feature_key,
      action,
      previous_state,
      new_state,
      created_by
    ) VALUES (
      NEW.key,
      'updated',
      row_to_json(OLD),
      row_to_json(NEW),
      auth.uid()
    );
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO feature_flag_audit_log (
      feature_key,
      action,
      new_state,
      created_by
    ) VALUES (
      NEW.key,
      'created',
      row_to_json(NEW),
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER feature_flags_audit
  AFTER INSERT OR UPDATE ON feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION log_feature_flag_changes();

-- Comments for documentation
COMMENT ON TABLE feature_flags IS 'Feature flags for gradual rollouts and A/B testing';
COMMENT ON TABLE feature_flag_evaluations IS 'Tracks feature flag evaluations for analytics';
COMMENT ON TABLE feature_flag_audit_log IS 'Audit trail of all feature flag changes';
COMMENT ON TABLE deployments IS 'Tracks deployment executions and strategies';
COMMENT ON TABLE deployment_steps IS 'Detailed steps for each deployment';
COMMENT ON FUNCTION get_feature_flag_statistics IS 'Provides statistics on feature flag usage';
COMMENT ON FUNCTION get_deployment_statistics IS 'Provides statistics on deployment success rates';
