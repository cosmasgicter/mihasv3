/**
 * Notification Preference Manager
 * Handles user consent settings, opt-in/opt-out functionality, and audit trails
 * Implements Requirements 6.2: Respect user consent settings for each notification channel
 */

import { supabaseAdminClient } from './supabaseClient.js';

/**
 * Default notification preferences for new users
 */
const DEFAULT_PREFERENCES = {
  email_enabled: true,
  sms_enabled: false,
  whatsapp_enabled: false,
  push_enabled: true,
  in_app_enabled: true,
  quiet_hours_start: '22:00',
  quiet_hours_end: '08:00',
  timezone: 'Africa/Lusaka'
};

/**
 * Valid notification channels
 */
const VALID_CHANNELS = ['email', 'sms', 'whatsapp', 'push', 'in_app'];

/**
 * Valid preference actions
 */
const VALID_ACTIONS = ['opt_in', 'opt_out', 'update_settings'];

/**
 * Create audit trail entry for preference changes
 */
async function createAuditTrail(userId, action, channel, metadata = {}) {
  try {
    const { error } = await supabaseAdminClient
      .from('notification_preference_audit')
      .insert({
        user_id: userId,
        action,
        channel,
        metadata,
        ip_address: metadata.ip_address,
        user_agent: metadata.user_agent,
        source: metadata.source || 'system'
      });

    if (error) {
      console.error('Failed to create audit trail:', error);
    }
  } catch (error) {
    console.error('Error creating audit trail:', error);
  }
}

/**
 * Get user notification preferences with inheritance and defaults
 */
export async function getUserPreferences(userId) {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }

    // Get user preferences
    const { data: preferences, error } = await supabaseAdminClient
      .from('user_notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch preferences: ${error.message}`);
    }

    // If no preferences exist, return defaults
    if (!preferences) {
      return {
        ...DEFAULT_PREFERENCES,
        user_id: userId,
        is_default: true
      };
    }

    // Return existing preferences with inheritance applied
    return {
      ...DEFAULT_PREFERENCES,
      ...preferences,
      is_default: false
    };
  } catch (error) {
    console.error('Error getting user preferences:', error);
    throw error;
  }
}

/**
 * Initialize default preferences for a new user
 */
export async function initializeUserPreferences(userId, metadata = {}) {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }

    // Check if preferences already exist
    const existing = await getUserPreferences(userId);
    if (!existing.is_default) {
      return existing;
    }

    // Create new preferences with defaults
    const { data, error } = await supabaseAdminClient
      .from('user_notification_preferences')
      .insert({
        user_id: userId,
        ...DEFAULT_PREFERENCES
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to initialize preferences: ${error.message}`);
    }

    // Create audit trail
    await createAuditTrail(userId, 'initialize', 'all', {
      ...metadata,
      preferences: DEFAULT_PREFERENCES
    });

    return data;
  } catch (error) {
    console.error('Error initializing user preferences:', error);
    throw error;
  }
}

/**
 * Update user consent for a specific channel
 */
export async function updateChannelConsent(userId, channel, action, metadata = {}) {
  try {
    if (!userId || !channel || !action) {
      throw new Error('User ID, channel, and action are required');
    }

    if (!VALID_CHANNELS.includes(channel)) {
      throw new Error(`Invalid channel: ${channel}. Valid channels: ${VALID_CHANNELS.join(', ')}`);
    }

    if (!VALID_ACTIONS.includes(action)) {
      throw new Error(`Invalid action: ${action}. Valid actions: ${VALID_ACTIONS.join(', ')}`);
    }

    // Get current preferences
    const currentPrefs = await getUserPreferences(userId);
    
    // Prepare update data
    const updateData = {};
    const consentTimestamp = new Date().toISOString();
    
    if (action === 'opt_in') {
      updateData[`${channel}_enabled`] = true;
      updateData[`${channel}_consent_at`] = consentTimestamp;
    } else if (action === 'opt_out') {
      updateData[`${channel}_enabled`] = false;
      // Keep consent timestamp for audit purposes
    }

    // If this is the first time setting preferences, create the record
    if (currentPrefs.is_default) {
      const { data, error } = await supabaseAdminClient
        .from('user_notification_preferences')
        .insert({
          user_id: userId,
          ...DEFAULT_PREFERENCES,
          ...updateData
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create preferences: ${error.message}`);
      }

      // Create audit trail
      await createAuditTrail(userId, action, channel, {
        ...metadata,
        previous_value: DEFAULT_PREFERENCES[`${channel}_enabled`],
        new_value: updateData[`${channel}_enabled`],
        reason: metadata.reason || 'User preference update'
      });

      return data;
    } else {
      // Update existing preferences
      const { data, error } = await supabaseAdminClient
        .from('user_notification_preferences')
        .update(updateData)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update preferences: ${error.message}`);
      }

      // Create audit trail
      await createAuditTrail(userId, action, channel, {
        ...metadata,
        previous_value: currentPrefs[`${channel}_enabled`],
        new_value: updateData[`${channel}_enabled`],
        reason: metadata.reason || 'User preference update'
      });

      return data;
    }
  } catch (error) {
    console.error('Error updating channel consent:', error);
    throw error;
  }
}

/**
 * Bulk update multiple channel preferences
 */
export async function updateMultipleChannelPreferences(userId, channelUpdates, metadata = {}) {
  try {
    if (!userId || !channelUpdates || typeof channelUpdates !== 'object') {
      throw new Error('User ID and channel updates object are required');
    }

    // Validate all channels
    const channels = Object.keys(channelUpdates);
    for (const channel of channels) {
      if (!VALID_CHANNELS.includes(channel)) {
        throw new Error(`Invalid channel: ${channel}. Valid channels: ${VALID_CHANNELS.join(', ')}`);
      }
    }

    // Get current preferences
    const currentPrefs = await getUserPreferences(userId);
    
    // Prepare update data
    const updateData = {};
    const consentTimestamp = new Date().toISOString();
    
    for (const [channel, enabled] of Object.entries(channelUpdates)) {
      updateData[`${channel}_enabled`] = Boolean(enabled);
      if (enabled) {
        updateData[`${channel}_consent_at`] = consentTimestamp;
      }
    }

    let result;
    
    // If this is the first time setting preferences, create the record
    if (currentPrefs.is_default) {
      const { data, error } = await supabaseAdminClient
        .from('user_notification_preferences')
        .insert({
          user_id: userId,
          ...DEFAULT_PREFERENCES,
          ...updateData
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create preferences: ${error.message}`);
      }
      
      result = data;
    } else {
      // Update existing preferences
      const { data, error } = await supabaseAdminClient
        .from('user_notification_preferences')
        .update(updateData)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update preferences: ${error.message}`);
      }
      
      result = data;
    }

    // Create audit trail for each channel update
    for (const [channel, enabled] of Object.entries(channelUpdates)) {
      const action = enabled ? 'opt_in' : 'opt_out';
      await createAuditTrail(userId, action, channel, {
        ...metadata,
        previous_value: currentPrefs[`${channel}_enabled`],
        new_value: Boolean(enabled),
        reason: metadata.reason || 'Bulk preference update'
      });
    }

    return result;
  } catch (error) {
    console.error('Error updating multiple channel preferences:', error);
    throw error;
  }
}

/**
 * Update quiet hours and timezone settings
 */
export async function updateQuietHours(userId, quietHoursStart, quietHoursEnd, timezone, metadata = {}) {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }

    // Validate time format (HH:MM)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (quietHoursStart && !timeRegex.test(quietHoursStart)) {
      throw new Error('Invalid quiet hours start time format. Use HH:MM');
    }
    if (quietHoursEnd && !timeRegex.test(quietHoursEnd)) {
      throw new Error('Invalid quiet hours end time format. Use HH:MM');
    }

    // Get current preferences
    const currentPrefs = await getUserPreferences(userId);
    
    // Prepare update data
    const updateData = {};
    if (quietHoursStart !== undefined) updateData.quiet_hours_start = quietHoursStart;
    if (quietHoursEnd !== undefined) updateData.quiet_hours_end = quietHoursEnd;
    if (timezone !== undefined) updateData.timezone = timezone;

    let result;
    
    // If this is the first time setting preferences, create the record
    if (currentPrefs.is_default) {
      const { data, error } = await supabaseAdminClient
        .from('user_notification_preferences')
        .insert({
          user_id: userId,
          ...DEFAULT_PREFERENCES,
          ...updateData
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create preferences: ${error.message}`);
      }
      
      result = data;
    } else {
      // Update existing preferences
      const { data, error } = await supabaseAdminClient
        .from('user_notification_preferences')
        .update(updateData)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update preferences: ${error.message}`);
      }
      
      result = data;
    }

    // Create audit trail
    await createAuditTrail(userId, 'update_settings', 'quiet_hours', {
      ...metadata,
      previous_values: {
        quiet_hours_start: currentPrefs.quiet_hours_start,
        quiet_hours_end: currentPrefs.quiet_hours_end,
        timezone: currentPrefs.timezone
      },
      new_values: updateData,
      reason: metadata.reason || 'Quiet hours update'
    });

    return result;
  } catch (error) {
    console.error('Error updating quiet hours:', error);
    throw error;
  }
}

/**
 * Check if a channel is enabled for a user
 */
export async function isChannelEnabled(userId, channel) {
  try {
    if (!userId || !channel) {
      return false;
    }

    if (!VALID_CHANNELS.includes(channel)) {
      return false;
    }

    const preferences = await getUserPreferences(userId);
    return Boolean(preferences[`${channel}_enabled`]);
  } catch (error) {
    console.error('Error checking channel status:', error);
    return false;
  }
}

/**
 * Check if current time is within user's quiet hours
 */
export async function isWithinQuietHours(userId) {
  try {
    if (!userId) {
      return false;
    }

    const preferences = await getUserPreferences(userId);
    const now = new Date();
    
    // Convert user timezone to current time
    const userTime = new Intl.DateTimeFormat('en-US', {
      timeZone: preferences.timezone || 'Africa/Lusaka',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    }).format(now);

    const currentTime = userTime;
    const quietStart = preferences.quiet_hours_start || '22:00';
    const quietEnd = preferences.quiet_hours_end || '08:00';

    // Handle quiet hours that span midnight
    if (quietStart > quietEnd) {
      return currentTime >= quietStart || currentTime <= quietEnd;
    } else {
      return currentTime >= quietStart && currentTime <= quietEnd;
    }
  } catch (error) {
    console.error('Error checking quiet hours:', error);
    return false;
  }
}

/**
 * Get preference audit trail for a user
 */
export async function getPreferenceAuditTrail(userId, limit = 50) {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const { data, error } = await supabaseAdminClient
      .from('notification_preference_audit')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch audit trail: ${error.message}`);
    }

    return data || [];
  } catch (error) {
    console.error('Error getting preference audit trail:', error);
    throw error;
  }
}

/**
 * Export user preferences for data portability
 */
export async function exportUserPreferences(userId) {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const [preferences, auditTrail] = await Promise.all([
      getUserPreferences(userId),
      getPreferenceAuditTrail(userId, 100)
    ]);

    return {
      user_id: userId,
      current_preferences: preferences,
      audit_trail: auditTrail,
      exported_at: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error exporting user preferences:', error);
    throw error;
  }
}

/**
 * Delete user preferences (for GDPR compliance)
 */
export async function deleteUserPreferences(userId, metadata = {}) {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }

    // Get current preferences for audit
    const currentPrefs = await getUserPreferences(userId);

    // Delete preferences
    const { error: prefsError } = await supabaseAdminClient
      .from('user_notification_preferences')
      .delete()
      .eq('user_id', userId);

    if (prefsError) {
      throw new Error(`Failed to delete preferences: ${prefsError.message}`);
    }

    // Create final audit trail entry
    await createAuditTrail(userId, 'delete_all', 'all', {
      ...metadata,
      deleted_preferences: currentPrefs,
      reason: metadata.reason || 'User data deletion request'
    });

    return { success: true, deleted_at: new Date().toISOString() };
  } catch (error) {
    console.error('Error deleting user preferences:', error);
    throw error;
  }
}