-- Create plugin registry table
CREATE TABLE IF NOT EXISTS plugin_registry (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plugin_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  description TEXT NOT NULL,
  author TEXT NOT NULL,
  license TEXT NOT NULL,
  keywords TEXT[] DEFAULT '{}',
  download_url TEXT NOT NULL,
  manifest JSONB NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  rating DECIMAL(2,1) DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  downloads INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create plugin installations table
CREATE TABLE IF NOT EXISTS plugin_installations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plugin_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  enabled BOOLEAN DEFAULT FALSE,
  auto_start BOOLEAN DEFAULT FALSE,
  priority INTEGER DEFAULT 0,
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(plugin_id, user_id)
);

-- Create plugin data table for plugin storage
CREATE TABLE IF NOT EXISTS plugin_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plugin_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(plugin_id, user_id, key)
);

-- Create plugin events table for audit logging
CREATE TABLE IF NOT EXISTS plugin_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plugin_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_plugin_registry_plugin_id ON plugin_registry(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_registry_author ON plugin_registry(author);
CREATE INDEX IF NOT EXISTS idx_plugin_registry_keywords ON plugin_registry USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_plugin_registry_verified ON plugin_registry(verified);
CREATE INDEX IF NOT EXISTS idx_plugin_registry_rating ON plugin_registry(rating DESC);
CREATE INDEX IF NOT EXISTS idx_plugin_registry_downloads ON plugin_registry(downloads DESC);

CREATE INDEX IF NOT EXISTS idx_plugin_installations_plugin_id ON plugin_installations(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_installations_user_id ON plugin_installations(user_id);
CREATE INDEX IF NOT EXISTS idx_plugin_installations_enabled ON plugin_installations(enabled);

CREATE INDEX IF NOT EXISTS idx_plugin_data_plugin_user ON plugin_data(plugin_id, user_id);
CREATE INDEX IF NOT EXISTS idx_plugin_data_key ON plugin_data(key);

CREATE INDEX IF NOT EXISTS idx_plugin_events_plugin_id ON plugin_events(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_events_user_id ON plugin_events(user_id);
CREATE INDEX IF NOT EXISTS idx_plugin_events_type ON plugin_events(event_type);
CREATE INDEX IF NOT EXISTS idx_plugin_events_created_at ON plugin_events(created_at DESC);

-- Enable RLS on all plugin tables
ALTER TABLE plugin_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for plugin_registry (public read, admin write)
CREATE POLICY "Public can read plugin registry" ON plugin_registry
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage plugin registry" ON plugin_registry
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'super_admin')
    )
  );

-- RLS Policies for plugin_installations (users can manage their own)
CREATE POLICY "Users can read their plugin installations" ON plugin_installations
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can manage their plugin installations" ON plugin_installations
  FOR ALL USING (user_id = auth.uid());

-- RLS Policies for plugin_data (users can manage their own)
CREATE POLICY "Users can read their plugin data" ON plugin_data
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can manage their plugin data" ON plugin_data
  FOR ALL USING (user_id = auth.uid());

-- RLS Policies for plugin_events (users can read their own, admins can read all)
CREATE POLICY "Users can read their plugin events" ON plugin_events
  FOR SELECT USING (
    user_id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "System can insert plugin events" ON plugin_events
  FOR INSERT WITH CHECK (true);

-- Create function to increment plugin downloads
CREATE OR REPLACE FUNCTION increment_plugin_downloads(plugin_id TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE plugin_registry 
  SET downloads = downloads + 1, updated_at = NOW()
  WHERE plugin_registry.plugin_id = increment_plugin_downloads.plugin_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to execute plugin queries (with security restrictions)
CREATE OR REPLACE FUNCTION execute_plugin_query(
  plugin_id TEXT,
  query TEXT,
  parameters JSONB DEFAULT '[]'
)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
  allowed_tables TEXT[] := ARRAY['applications', 'users', 'notifications', 'analytics_events', 'plugin_data', 'plugin_settings'];
  query_lower TEXT;
BEGIN
  -- Basic security check - only allow SELECT statements
  query_lower := LOWER(TRIM(query));
  
  IF NOT query_lower LIKE 'select%' THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed for plugins';
  END IF;
  
  -- Check if query references allowed tables
  -- This is a basic check - in production, use a proper SQL parser
  IF NOT EXISTS (
    SELECT 1 FROM unnest(allowed_tables) AS t(table_name)
    WHERE query_lower LIKE '%' || table_name || '%'
  ) THEN
    RAISE EXCEPTION 'Query references unauthorized tables';
  END IF;
  
  -- Execute the query (this is simplified - in production, use proper parameter binding)
  EXECUTE query INTO result;
  
  -- Log the query execution
  INSERT INTO plugin_events (plugin_id, user_id, event_type, event_data)
  VALUES (plugin_id, auth.uid(), 'query_executed', jsonb_build_object('query', query));
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_plugin_registry_updated_at
  BEFORE UPDATE ON plugin_registry
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_plugin_installations_updated_at
  BEFORE UPDATE ON plugin_installations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_plugin_data_updated_at
  BEFORE UPDATE ON plugin_data
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();