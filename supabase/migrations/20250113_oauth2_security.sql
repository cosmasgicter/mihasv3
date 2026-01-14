-- OAuth2 and Security Extensions for Integration Framework

-- OAuth2 state management
CREATE TABLE IF NOT EXISTS oauth2_states (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    state VARCHAR(255) UNIQUE NOT NULL,
    system_id UUID REFERENCES external_systems(id) ON DELETE CASCADE,
    code_verifier TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    scopes TEXT[] DEFAULT '{}',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- API rate limiting tracking
CREATE TABLE IF NOT EXISTS api_rate_limits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    identifier VARCHAR(255) NOT NULL, -- IP, user ID, or API key hash
    endpoint VARCHAR(255) NOT NULL,
    request_count INTEGER DEFAULT 1,
    window_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    window_size INTEGER DEFAULT 3600, -- seconds
    max_requests INTEGER DEFAULT 100,
    blocked_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Security incidents log
CREATE TABLE IF NOT EXISTS security_incidents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    incident_type VARCHAR(100) NOT NULL, -- 'rate_limit_exceeded', 'invalid_signature', 'auth_failure'
    severity VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
    source_ip INET,
    user_id UUID REFERENCES auth.users(id),
    integration_name VARCHAR(255),
    description TEXT,
    metadata JSONB DEFAULT '{}',
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Integration health monitoring
CREATE TABLE IF NOT EXISTS integration_health (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    system_id UUID REFERENCES external_systems(id) ON DELETE CASCADE,
    endpoint VARCHAR(255),
    status VARCHAR(20) DEFAULT 'unknown', -- 'healthy', 'degraded', 'down', 'unknown'
    response_time_ms INTEGER,
    error_rate DECIMAL(5,2) DEFAULT 0.00,
    last_check_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_success_at TIMESTAMP WITH TIME ZONE,
    last_failure_at TIMESTAMP WITH TIME ZONE,
    failure_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_oauth2_states_state ON oauth2_states(state);
CREATE INDEX IF NOT EXISTS idx_oauth2_states_expires_at ON oauth2_states(expires_at);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_identifier ON api_rate_limits(identifier);
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_endpoint ON api_rate_limits(endpoint);
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_window_start ON api_rate_limits(window_start);

CREATE INDEX IF NOT EXISTS idx_security_incidents_type ON security_incidents(incident_type);
CREATE INDEX IF NOT EXISTS idx_security_incidents_severity ON security_incidents(severity);
CREATE INDEX IF NOT EXISTS idx_security_incidents_created_at ON security_incidents(created_at);
CREATE INDEX IF NOT EXISTS idx_security_incidents_resolved ON security_incidents(resolved);

CREATE INDEX IF NOT EXISTS idx_integration_health_system_id ON integration_health(system_id);
CREATE INDEX IF NOT EXISTS idx_integration_health_status ON integration_health(status);
CREATE INDEX IF NOT EXISTS idx_integration_health_last_check ON integration_health(last_check_at);

-- Row Level Security
ALTER TABLE oauth2_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_health ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Admin access only)
CREATE POLICY "Admin access to oauth2_states" ON oauth2_states
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "Admin access to api_rate_limits" ON api_rate_limits
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "Admin access to security_incidents" ON security_incidents
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "Admin access to integration_health" ON integration_health
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'super_admin')
        )
    );

-- Functions for security and monitoring

-- Function to log security incidents
CREATE OR REPLACE FUNCTION log_security_incident(
    incident_type TEXT,
    severity TEXT DEFAULT 'medium',
    source_ip INET DEFAULT NULL,
    user_id UUID DEFAULT NULL,
    integration_name TEXT DEFAULT NULL,
    description TEXT DEFAULT NULL,
    metadata JSONB DEFAULT '{}'::JSONB
) RETURNS UUID AS $$
DECLARE
    incident_id UUID;
BEGIN
    INSERT INTO security_incidents (
        incident_type, severity, source_ip, user_id, 
        integration_name, description, metadata
    )
    VALUES (
        incident_type, severity, source_ip, user_id,
        integration_name, description, metadata
    )
    RETURNING id INTO incident_id;
    
    RETURN incident_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check rate limits
CREATE OR REPLACE FUNCTION check_rate_limit(
    identifier TEXT,
    endpoint TEXT,
    max_requests INTEGER DEFAULT 100,
    window_size INTEGER DEFAULT 3600
) RETURNS JSONB AS $$
DECLARE
    current_window TIMESTAMP WITH TIME ZONE;
    rate_limit_record RECORD;
    result JSONB;
BEGIN
    current_window := date_trunc('hour', NOW());
    
    -- Get or create rate limit record
    SELECT * INTO rate_limit_record
    FROM api_rate_limits
    WHERE api_rate_limits.identifier = check_rate_limit.identifier
    AND api_rate_limits.endpoint = check_rate_limit.endpoint
    AND window_start >= current_window;
    
    IF rate_limit_record IS NULL THEN
        -- Create new record
        INSERT INTO api_rate_limits (
            identifier, endpoint, request_count, window_start, 
            window_size, max_requests
        )
        VALUES (
            identifier, endpoint, 1, current_window,
            window_size, max_requests
        );
        
        result := jsonb_build_object(
            'allowed', true,
            'requests_remaining', max_requests - 1,
            'reset_time', current_window + (window_size || ' seconds')::INTERVAL
        );
    ELSE
        IF rate_limit_record.request_count >= max_requests THEN
            -- Rate limit exceeded
            result := jsonb_build_object(
                'allowed', false,
                'requests_remaining', 0,
                'reset_time', rate_limit_record.window_start + (window_size || ' seconds')::INTERVAL,
                'retry_after', EXTRACT(EPOCH FROM (
                    rate_limit_record.window_start + (window_size || ' seconds')::INTERVAL - NOW()
                ))
            );
        ELSE
            -- Increment counter
            UPDATE api_rate_limits
            SET request_count = request_count + 1,
                updated_at = NOW()
            WHERE id = rate_limit_record.id;
            
            result := jsonb_build_object(
                'allowed', true,
                'requests_remaining', max_requests - rate_limit_record.request_count - 1,
                'reset_time', rate_limit_record.window_start + (window_size || ' seconds')::INTERVAL
            );
        END IF;
    END IF;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update integration health
CREATE OR REPLACE FUNCTION update_integration_health(
    system_id UUID,
    endpoint TEXT,
    status TEXT,
    response_time_ms INTEGER DEFAULT NULL,
    error_message TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    health_record RECORD;
    new_error_rate DECIMAL(5,2);
BEGIN
    -- Get existing health record
    SELECT * INTO health_record
    FROM integration_health
    WHERE integration_health.system_id = update_integration_health.system_id
    AND integration_health.endpoint = update_integration_health.endpoint;
    
    IF health_record IS NULL THEN
        -- Create new health record
        INSERT INTO integration_health (
            system_id, endpoint, status, response_time_ms,
            last_check_at, last_success_at, last_failure_at, failure_count
        )
        VALUES (
            system_id, endpoint, status, response_time_ms,
            NOW(),
            CASE WHEN status = 'healthy' THEN NOW() ELSE NULL END,
            CASE WHEN status != 'healthy' THEN NOW() ELSE NULL END,
            CASE WHEN status != 'healthy' THEN 1 ELSE 0 END
        );
    ELSE
        -- Update existing record
        UPDATE integration_health
        SET 
            status = update_integration_health.status,
            response_time_ms = update_integration_health.response_time_ms,
            last_check_at = NOW(),
            last_success_at = CASE 
                WHEN update_integration_health.status = 'healthy' THEN NOW() 
                ELSE last_success_at 
            END,
            last_failure_at = CASE 
                WHEN update_integration_health.status != 'healthy' THEN NOW() 
                ELSE last_failure_at 
            END,
            failure_count = CASE 
                WHEN update_integration_health.status != 'healthy' THEN failure_count + 1
                ELSE 0
            END,
            updated_at = NOW()
        WHERE id = health_record.id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up expired OAuth2 states
CREATE OR REPLACE FUNCTION cleanup_expired_oauth2_states() 
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM oauth2_states 
    WHERE expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up old rate limit records
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits(hours_to_keep INTEGER DEFAULT 24) 
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM api_rate_limits 
    WHERE window_start < NOW() - INTERVAL '1 hour' * hours_to_keep;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers for updated_at timestamps
CREATE TRIGGER update_api_rate_limits_updated_at
    BEFORE UPDATE ON api_rate_limits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_integration_health_updated_at
    BEFORE UPDATE ON integration_health
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Comments
COMMENT ON TABLE oauth2_states IS 'Temporary storage for OAuth2 authorization flow state';
COMMENT ON TABLE api_rate_limits IS 'Tracks API request rates for rate limiting enforcement';
COMMENT ON TABLE security_incidents IS 'Logs security-related incidents and violations';
COMMENT ON TABLE integration_health IS 'Monitors health and performance of external integrations';