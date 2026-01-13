-- Sample Notification Data for Analytics Testing
-- Creates sample notifications and delivery records for testing the analytics dashboard

-- Function to generate sample notification data
CREATE OR REPLACE FUNCTION generate_sample_notification_data()
RETURNS void AS $
DECLARE
  sample_user_id UUID;
  notification_id UUID;
  i INTEGER;
  j INTEGER;
  channels TEXT[] := ARRAY['email', 'sms', 'whatsapp', 'push', 'in_app'];
  statuses TEXT[] := ARRAY['sent', 'delivered', 'failed', 'bounced'];
  notification_types TEXT[] := ARRAY['info', 'success', 'warning', 'application_update'];
  random_channel TEXT;
  random_status TEXT;
  random_type TEXT;
  random_date TIMESTAMPTZ;
BEGIN
  -- Get a sample user (or create one if none exists)
  SELECT id INTO sample_user_id FROM auth.users LIMIT 1;
  
  IF sample_user_id IS NULL THEN
    -- Create a sample user for testing
    INSERT INTO auth.users (id, email, created_at, updated_at)
    VALUES (gen_random_uuid(), 'test@mihas.edu.zm', NOW(), NOW())
    RETURNING id INTO sample_user_id;
  END IF;

  -- Generate sample notifications for the last 30 days
  FOR i IN 1..100 LOOP
    -- Random date within last 30 days
    random_date := NOW() - (random() * INTERVAL '30 days');
    random_type := notification_types[1 + floor(random() * array_length(notification_types, 1))];
    
    -- Insert notification
    INSERT INTO notifications (
      user_id, 
      title, 
      message, 
      type, 
      read, 
      created_at
    ) VALUES (
      sample_user_id,
      'Sample Notification ' || i,
      'This is a sample notification message for testing analytics dashboard functionality.',
      random_type,
      random() > 0.3, -- 70% chance of being read
      random_date
    ) RETURNING id INTO notification_id;

    -- Generate delivery records for each channel (simulate multi-channel delivery)
    FOR j IN 1..3 LOOP -- Random 1-3 channels per notification
      random_channel := channels[1 + floor(random() * array_length(channels, 1))];
      random_status := statuses[1 + floor(random() * array_length(statuses, 1))];
      
      -- Skip if this channel already exists for this notification
      IF NOT EXISTS (
        SELECT 1 FROM notification_deliveries 
        WHERE notification_id = notification_id AND channel = random_channel
      ) THEN
        INSERT INTO notification_deliveries (
          notification_id,
          channel,
          status,
          delivery_attempt,
          sent_at,
          delivered_at,
          failed_at,
          created_at
        ) VALUES (
          notification_id,
          random_channel,
          random_status,
          1 + floor(random() * 3), -- 1-3 attempts
          CASE WHEN random_status != 'pending' THEN random_date + INTERVAL '1 minute' ELSE NULL END,
          CASE WHEN random_status = 'delivered' THEN random_date + INTERVAL '2 minutes' ELSE NULL END,
          CASE WHEN random_status IN ('failed', 'bounced') THEN random_date + INTERVAL '1 minute' ELSE NULL END,
          random_date
        );
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Generated sample notification data for analytics testing';
END;
$ LANGUAGE plpgsql;

-- Only run this in development/testing environments
-- Comment out the following line in production
-- SELECT generate_sample_notification_data();

COMMENT ON FUNCTION generate_sample_notification_data() IS 'Generates sample notification and delivery data for testing analytics dashboard';