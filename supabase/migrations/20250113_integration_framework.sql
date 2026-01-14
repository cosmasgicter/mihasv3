-- Integration Framework Database Schema
-- Creates tables for managing integrations, webhooks, and API access

-- Integration webhooks table
CREATE TABLE IF NOT EXISTS integration_webhooks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    events TEXT[] NOT NULL DEFAULT '{}',
    secret TEXT,
    active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Webhook deliveries log
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    webhook_id UUID REFERENCES integration_webhooks(id) ON DELETE CASCADE,
    event VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL,
    response_status INTEGER,
    response_headers JSONB DEFAULT '{}',
    error_message TEXT,
    delivered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    success BOOLEAN DEFAULT false
);

-- Integration configurations
CREATE TABLE IF NOT EXISTS integration_configs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    type VARCHAR(100) NOT NULL, -- 'webhook', 'api', 'plugin'
    version VARCHAR(50) DEFAULT '1.0',
    configuration JSONB NOT NULL DEFAULT '{}',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- API access tokens for third-party integrations
CREATE TABLE IF NOT EXISTS integration_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    token_hash TEXT NOT NULL,
    permissions TEXT[] DEFAULT '{}',
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Integration audit log
CREATE TABLE IF NOT EXISTS integration_audit_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    integration_name VARCHAR(255),
    action VARCHAR(255) NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    ip_address INET,
    user_agent TEXT,
    request_method VARCHAR(10),
    request_url TEXT,
    request_body JSONB,
    response_status INTEGER,
    response_body JSONB,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- External system connections
CREATE TABLE IF NOT EXISTS external_systems (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    type VARCHAR(100) NOT NULL, -- 'hpcz', 'gnc', 'ecz', 'payment_gateway', etc.
    base_url TEXT,
    authentication_type VARCHAR(50) DEFAULT 'bearer', -- 'bearer', 'api_key', 'oauth2'
    credentials JSONB DEFAULT '{}', -- Encrypted credentials
    configuration JSONB DEFAULT '{}',
    active BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Integration events log
CREATE TABLE IF NOT EXISTS integration_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type VARCHAR(255) NOT NULL,
    source_system VARCHAR(255),
    target_system VARCHAR(255),
    payload JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event ON webhook_deliveries(event);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_delivered_at ON webhook_deliveries(delivered_at);

CREATE INDEX IF NOT EXISTS idx_integration_audit_log_user_id ON integration_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_integration_audit_log_created_at ON integration_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_integration_audit_log_action ON integration_audit_log(action);

CREATE INDEX IF NOT EXISTS idx_integration_events_status ON integration_events(status);
CREATE INDEX IF NOT EXISTS idx_integration_events_event_type ON integration_events(event_type);
CREATE INDEX IF NOT EXISTS idx_integration_events_scheduled_at ON integration_events(scheduled_at);

CREATE INDEX IF NOT EXISTS idx_integration_tokens_active ON integration_tokens(active);
CREATE INDEX IF NOT EXISTS idx_integration_tokens_expires_at ON integration_tokens(expires_at);

-- Row Level Security (RLS) policies
ALTER TABLE integration_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for admin access only
CREATE POLICY "Admin access to integration_webhooks" ON integration_webhooks
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "Admin access to webhook_deliveries" ON webhook_deliveries
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "Admin access to integration_configs" ON integration_configs
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "Admin access to integration_tokens" ON integration_tokens
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "Admin access to integration_audit_log" ON integration_audit_log
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "Admin access to external_systems" ON external_systems
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "Admin access to integration_events" ON integration_events
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'super_admin')
        )
    );

-- Functions for integration management
CREATE OR REPLACE FUNCTION trigger_integration_event(
    event_type TEXT,
    source_system TEXT DEFAULT NULL,
    target_system TEXT DEFAULT NULL,
    payload JSONB DEFAULT '{}'::JSONB
) RETURNS UUID AS $$
DECLARE
    event_id UUID;
BEGIN
    INSERT INTO integration_events (event_type, source_system, target_system, payload)
    VALUES (event_type, source_system, target_system, payload)
    RETURNING id INTO event_id;
    
    RETURN event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up old webhook deliveries
CREATE OR REPLACE FUNCTION cleanup_webhook_deliveries(days_to_keep INTEGER DEFAULT 30) 
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM webhook_deliveries 
    WHERE delivered_at < NOW() - INTERVAL '1 day' * days_to_keep;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up old audit logs
CREATE OR REPLACE FUNCTION cleanup_integration_audit_log(days_to_keep INTEGER DEFAULT 90) 
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM integration_audit_log 
    WHERE created_at < NOW() - INTERVAL '1 day' * days_to_keep;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_integration_webhooks_updated_at
    BEFORE UPDATE ON integration_webhooks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_integration_configs_updated_at
    BEFORE UPDATE ON integration_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_external_systems_updated_at
    BEFORE UPDATE ON external_systems
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Comments for documentation
COMMENT ON TABLE integration_webhooks IS 'Stores webhook configurations for external system notifications';
COMMENT ON TABLE webhook_deliveries IS 'Logs all webhook delivery attempts and their results';
COMMENT ON TABLE integration_configs IS 'Stores configuration for various integration types';
COMMENT ON TABLE integration_tokens IS 'Manages API access tokens for third-party integrations';
COMMENT ON TABLE integration_audit_log IS 'Comprehensive audit trail for all integration activities';
COMMENT ON TABLE external_systems IS 'Configuration for external system connections';
COMMENT ON TABLE integration_events IS 'Queue for processing integration events asynchronously';