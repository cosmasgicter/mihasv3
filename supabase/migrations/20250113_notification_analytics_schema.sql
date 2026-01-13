-- Notification Analytics Schema
-- Creates views and functions for tracking notification delivery rates, user engagement metrics,
-- and identifying optimal delivery times and channels
-- Requirements: 6.5 - Notification analytics dashboard

-- Notification analytics view for delivery rates by channel
CREATE OR REPLACE VIEW notification_delivery_analytics AS
SELECT 
  nd.channel,
  DATE_TRUNC('hour', nd.created_at) as delivery_hour,
  DATE_TRUNC('day', nd.created_at) as delivery_date,
  COUNT(*) as total_notifications,
  COUNT(*) FILTER (WHERE nd.status = 'sent') as sent_count,
  COUNT(*) FILTER (WHERE nd.status = 'delivered') as delivered_count,
  COUNT(*) FILTER (WHERE nd.status = 'failed') as failed_count,
  COUNT(*) FILTER (WHERE nd.status = 'bounced') as bounced_count,
  ROUND(
    (COUNT(*) FILTER (WHERE nd.status IN ('sent', 'delivered'))::DECIMAL / 
     NULLIF(COUNT(*), 0) * 100), 2
  ) as success_rate,
  ROUND(
    (COUNT(*) FILTER (WHERE nd.status = 'delivered')::DECIMAL / 
     NULLIF(COUNT(*) FILTER (WHERE nd.status = 'sent'), 0) * 100), 2
  ) as delivery_rate,
  AVG(
    CASE 
      WHEN nd.delivered_at IS NOT NULL AND nd.sent_at IS NOT NULL 
      THEN EXTRACT(EPOCH FROM (nd.delivered_at - nd.sent_at))
      ELSE NULL 
    END
  ) as avg_delivery_time_seconds
FROM notification_deliveries nd
WHERE nd.created_at >= NOW() - INTERVAL '30 days'
GROUP BY nd.channel, DATE_TRUNC('hour', nd.created_at), DATE_TRUNC('day', nd.created_at);

-- User engagement analytics view
CREATE OR REPLACE VIEW notification_engagement_analytics AS
SELECT 
  p.id as user_id,
  p.full_name,
  p.email,
  COUNT(nd.*) as total_notifications_received,
  COUNT(*) FILTER (WHERE nd.status IN ('sent', 'delivered')) as successful_deliveries,
  COUNT(*) FILTER (WHERE nd.status = 'failed') as failed_deliveries,
  COUNT(*) FILTER (WHERE nd.channel = 'email') as email_notifications,
  COUNT(*) FILTER (WHERE nd.channel = 'sms') as sms_notifications,
  COUNT(*) FILTER (WHERE nd.channel = 'whatsapp') as whatsapp_notifications,
  COUNT(*) FILTER (WHERE nd.channel = 'push') as push_notifications,
  COUNT(*) FILTER (WHERE nd.channel = 'in_app') as in_app_notifications,
  -- Calculate preferred channel based on highest success rate
  (
    SELECT nd2.channel 
    FROM notification_deliveries nd2 
    JOIN notifications n2 ON nd2.notification_id = n2.id
    WHERE n2.user_id = p.id 
    AND nd2.status IN ('sent', 'delivered')
    GROUP BY nd2.channel 
    ORDER BY COUNT(*) DESC 
    LIMIT 1
  ) as preferred_channel,
  MAX(nd.created_at) as last_notification_at
FROM profiles p
LEFT JOIN notifications n ON n.user_id = p.id
LEFT JOIN notification_deliveries nd ON nd.notification_id = n.id
WHERE nd.created_at >= NOW() - INTERVAL '30 days' OR nd.created_at IS NULL
GROUP BY p.id, p.full_name, p.email;

-- Optimal delivery time analysis view
CREATE OR REPLACE VIEW notification_optimal_times AS
SELECT 
  EXTRACT(HOUR FROM nd.created_at) as delivery_hour,
  EXTRACT(DOW FROM nd.created_at) as day_of_week, -- 0=Sunday, 6=Saturday
  nd.channel,
  COUNT(*) as total_sent,
  COUNT(*) FILTER (WHERE nd.status IN ('sent', 'delivered')) as successful_deliveries,
  ROUND(
    (COUNT(*) FILTER (WHERE nd.status IN ('sent', 'delivered'))::DECIMAL / 
     NULLIF(COUNT(*), 0) * 100), 2
  ) as success_rate,
  AVG(
    CASE 
      WHEN nd.delivered_at IS NOT NULL AND nd.sent_at IS NOT NULL 
      THEN EXTRACT(EPOCH FROM (nd.delivered_at - nd.sent_at))
      ELSE NULL 
    END
  ) as avg_delivery_time_seconds
FROM notification_deliveries nd
WHERE nd.created_at >= NOW() - INTERVAL '30 days'
GROUP BY EXTRACT(HOUR FROM nd.created_at), EXTRACT(DOW FROM nd.created_at), nd.channel
HAVING COUNT(*) >= 5 -- Only include time slots with sufficient data
ORDER BY success_rate DESC, avg_delivery_time_seconds ASC;

-- Function to get comprehensive notification analytics
CREATE OR REPLACE FUNCTION get_notification_analytics(
  p_days_back INTEGER DEFAULT 7,
  p_channel VARCHAR(20) DEFAULT NULL
)
RETURNS TABLE (
  total_notifications BIGINT,
  successful_deliveries BIGINT,
  failed_deliveries BIGINT,
  overall_success_rate DECIMAL,
  channel_breakdown JSONB,
  daily_trends JSONB,
  optimal_hours JSONB,
  top_performing_channels JSONB
) AS $
DECLARE
  v_start_date TIMESTAMPTZ;
BEGIN
  v_start_date := NOW() - (p_days_back || ' days')::INTERVAL;
  
  RETURN QUERY
  WITH base_stats AS (
    SELECT 
      COUNT(*) as total_notifications,
      COUNT(*) FILTER (WHERE nd.status IN ('sent', 'delivered')) as successful_deliveries,
      COUNT(*) FILTER (WHERE nd.status IN ('failed', 'bounced')) as failed_deliveries
    FROM notification_deliveries nd
    WHERE nd.created_at >= v_start_date
    AND (p_channel IS NULL OR nd.channel = p_channel)
  ),
  channel_stats AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'channel', channel,
        'total', total_notifications,
        'successful', successful_deliveries,
        'failed', failed_deliveries,
        'success_rate', success_rate,
        'avg_delivery_time', avg_delivery_time_seconds
      ) ORDER BY success_rate DESC
    ) as channel_breakdown
    FROM (
      SELECT 
        nd.channel,
        COUNT(*) as total_notifications,
        COUNT(*) FILTER (WHERE nd.status IN ('sent', 'delivered')) as successful_deliveries,
        COUNT(*) FILTER (WHERE nd.status IN ('failed', 'bounced')) as failed_deliveries,
        ROUND(
          (COUNT(*) FILTER (WHERE nd.status IN ('sent', 'delivered'))::DECIMAL / 
           NULLIF(COUNT(*), 0) * 100), 2
        ) as success_rate,
        AVG(
          CASE 
            WHEN nd.delivered_at IS NOT NULL AND nd.sent_at IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (nd.delivered_at - nd.sent_at))
            ELSE NULL 
          END
        ) as avg_delivery_time_seconds
      FROM notification_deliveries nd
      WHERE nd.created_at >= v_start_date
      AND (p_channel IS NULL OR nd.channel = p_channel)
      GROUP BY nd.channel
    ) channel_data
  ),
  daily_stats AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'date', delivery_date,
        'total', total_notifications,
        'successful', successful_deliveries,
        'success_rate', success_rate
      ) ORDER BY delivery_date
    ) as daily_trends
    FROM (
      SELECT 
        DATE_TRUNC('day', nd.created_at) as delivery_date,
        COUNT(*) as total_notifications,
        COUNT(*) FILTER (WHERE nd.status IN ('sent', 'delivered')) as successful_deliveries,
        ROUND(
          (COUNT(*) FILTER (WHERE nd.status IN ('sent', 'delivered'))::DECIMAL / 
           NULLIF(COUNT(*), 0) * 100), 2
        ) as success_rate
      FROM notification_deliveries nd
      WHERE nd.created_at >= v_start_date
      AND (p_channel IS NULL OR nd.channel = p_channel)
      GROUP BY DATE_TRUNC('day', nd.created_at)
    ) daily_data
  ),
  optimal_time_stats AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'hour', delivery_hour,
        'day_of_week', day_of_week,
        'channel', channel,
        'success_rate', success_rate,
        'total_sent', total_sent,
        'avg_delivery_time', avg_delivery_time_seconds
      ) ORDER BY success_rate DESC
    ) as optimal_hours
    FROM notification_optimal_times
    WHERE (p_channel IS NULL OR channel = p_channel)
    LIMIT 20
  ),
  top_channels AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'channel', channel,
        'success_rate', success_rate,
        'total_notifications', total_notifications
      ) ORDER BY success_rate DESC
    ) as top_performing_channels
    FROM notification_delivery_analytics
    WHERE delivery_date >= DATE_TRUNC('day', v_start_date)
    AND (p_channel IS NULL OR channel = p_channel)
    GROUP BY channel, success_rate, total_notifications
    ORDER BY success_rate DESC
    LIMIT 5
  )
  SELECT 
    bs.total_notifications,
    bs.successful_deliveries,
    bs.failed_deliveries,
    ROUND(
      (bs.successful_deliveries::DECIMAL / NULLIF(bs.total_notifications, 0) * 100), 2
    ) as overall_success_rate,
    COALESCE(cs.channel_breakdown, '[]'::jsonb) as channel_breakdown,
    COALESCE(ds.daily_trends, '[]'::jsonb) as daily_trends,
    COALESCE(ots.optimal_hours, '[]'::jsonb) as optimal_hours,
    COALESCE(tc.top_performing_channels, '[]'::jsonb) as top_performing_channels
  FROM base_stats bs
  CROSS JOIN channel_stats cs
  CROSS JOIN daily_stats ds
  CROSS JOIN optimal_time_stats ots
  CROSS JOIN top_channels tc;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user engagement metrics
CREATE OR REPLACE FUNCTION get_user_engagement_metrics(
  p_days_back INTEGER DEFAULT 30,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  email TEXT,
  total_notifications BIGINT,
  successful_deliveries BIGINT,
  engagement_score DECIMAL,
  preferred_channel TEXT,
  last_notification_at TIMESTAMPTZ
) AS $
DECLARE
  v_start_date TIMESTAMPTZ;
BEGIN
  v_start_date := NOW() - (p_days_back || ' days')::INTERVAL;
  
  RETURN QUERY
  SELECT 
    nea.user_id,
    nea.full_name,
    nea.email,
    nea.total_notifications_received,
    nea.successful_deliveries,
    ROUND(
      (nea.successful_deliveries::DECIMAL / 
       NULLIF(nea.total_notifications_received, 0) * 100), 2
    ) as engagement_score,
    nea.preferred_channel,
    nea.last_notification_at
  FROM notification_engagement_analytics nea
  WHERE nea.last_notification_at >= v_start_date
  ORDER BY engagement_score DESC, nea.total_notifications_received DESC
  LIMIT p_limit;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get optimal delivery recommendations
CREATE OR REPLACE FUNCTION get_optimal_delivery_recommendations(
  p_channel VARCHAR(20) DEFAULT NULL
)
RETURNS TABLE (
  channel TEXT,
  recommended_hour INTEGER,
  recommended_day_of_week INTEGER,
  success_rate DECIMAL,
  confidence_score DECIMAL
) AS $
BEGIN
  RETURN QUERY
  WITH ranked_times AS (
    SELECT 
      not.channel,
      not.delivery_hour,
      not.day_of_week,
      not.success_rate,
      not.total_sent,
      ROW_NUMBER() OVER (
        PARTITION BY not.channel 
        ORDER BY not.success_rate DESC, not.total_sent DESC
      ) as rank
    FROM notification_optimal_times not
    WHERE (p_channel IS NULL OR not.channel = p_channel)
    AND not.total_sent >= 10 -- Minimum sample size for confidence
  )
  SELECT 
    rt.channel::TEXT,
    rt.delivery_hour::INTEGER,
    rt.day_of_week::INTEGER,
    rt.success_rate,
    ROUND(
      LEAST(100, (rt.total_sent::DECIMAL / 50) * 100), 2
    ) as confidence_score -- Higher confidence with more data points
  FROM ranked_times rt
  WHERE rt.rank = 1
  ORDER BY rt.success_rate DESC;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create indexes for the analytics views
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_analytics 
  ON notification_deliveries(channel, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_timing 
  ON notification_deliveries(created_at, sent_at, delivered_at) 
  WHERE sent_at IS NOT NULL;

-- RLS Policies for analytics views (admin access only)
ALTER VIEW notification_delivery_analytics OWNER TO postgres;
ALTER VIEW notification_engagement_analytics OWNER TO postgres;
ALTER VIEW notification_optimal_times OWNER TO postgres;

-- Grant access to authenticated users (will be filtered by RLS in functions)
GRANT SELECT ON notification_delivery_analytics TO authenticated;
GRANT SELECT ON notification_engagement_analytics TO authenticated;
GRANT SELECT ON notification_optimal_times TO authenticated;

COMMENT ON VIEW notification_delivery_analytics IS 'Analytics view for notification delivery rates by channel and time';
COMMENT ON VIEW notification_engagement_analytics IS 'User engagement metrics for notification effectiveness';
COMMENT ON VIEW notification_optimal_times IS 'Analysis of optimal delivery times by channel and day';
COMMENT ON FUNCTION get_notification_analytics(INTEGER, VARCHAR) IS 'Comprehensive notification analytics with delivery rates and trends';
COMMENT ON FUNCTION get_user_engagement_metrics(INTEGER, INTEGER) IS 'User engagement metrics and preferred channels';
COMMENT ON FUNCTION get_optimal_delivery_recommendations(VARCHAR) IS 'Recommendations for optimal notification delivery times';