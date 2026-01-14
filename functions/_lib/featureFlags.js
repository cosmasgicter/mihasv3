/**
 * Feature Flag Management System
 * 
 * Provides feature flag capabilities for gradual rollouts and zero-downtime deployments
 * Requirements: 10.5
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Feature flag status enum
 */
export const FeatureFlagStatus = {
  DISABLED: 'disabled',
  ENABLED: 'enabled',
  ROLLOUT: 'rollout',
  DEPRECATED: 'deprecated'
};

/**
 * Feature flag targeting strategies
 */
export const TargetingStrategy = {
  ALL_USERS: 'all_users',
  PERCENTAGE: 'percentage',
  USER_LIST: 'user_list',
  USER_ATTRIBUTES: 'user_attributes',
  CUSTOM: 'custom'
};

/**
 * Feature Flag Manager
 */
export class FeatureFlagManager {
  constructor(supabaseUrl, supabaseKey) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.cache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Check if a feature is enabled for a user
   * @param {string} featureKey - Feature flag key
   * @param {Object} context - User context (userId, attributes, etc.)
   * @returns {Promise<boolean>} Whether feature is enabled
   */
  async isEnabled(featureKey, context = {}) {
    try {
      // Check cache first
      const cached = this.getCached(featureKey);
      if (cached !== null) {
        return this.evaluateFlag(cached, context);
      }

      // Fetch from database
      const { data: flag, error } = await this.supabase
        .from('feature_flags')
        .select('*')
        .eq('key', featureKey)
        .eq('is_active', true)
        .single();

      if (error || !flag) {
        // Feature not found or error - default to disabled
        return false;
      }

      // Cache the flag
      this.setCache(featureKey, flag);

      // Evaluate flag
      return this.evaluateFlag(flag, context);

    } catch (error) {
      console.error('Feature flag evaluation error:', error);
      return false; // Fail closed - disable feature on error
    }
  }

  /**
   * Evaluate a feature flag based on targeting rules
   * @param {Object} flag - Feature flag configuration
   * @param {Object} context - User context
   * @returns {boolean} Whether feature is enabled
   */
  evaluateFlag(flag, context) {
    // If flag is disabled, return false
    if (flag.status === FeatureFlagStatus.DISABLED) {
      return false;
    }

    // If flag is enabled for all, return true
    if (flag.status === FeatureFlagStatus.ENABLED && 
        flag.targeting_strategy === TargetingStrategy.ALL_USERS) {
      return true;
    }

    // Evaluate based on targeting strategy
    switch (flag.targeting_strategy) {
      case TargetingStrategy.PERCENTAGE:
        return this.evaluatePercentage(flag, context);

      case TargetingStrategy.USER_LIST:
        return this.evaluateUserList(flag, context);

      case TargetingStrategy.USER_ATTRIBUTES:
        return this.evaluateUserAttributes(flag, context);

      case TargetingStrategy.CUSTOM:
        return this.evaluateCustom(flag, context);

      default:
        return false;
    }
  }

  /**
   * Evaluate percentage-based rollout
   * @param {Object} flag - Feature flag
   * @param {Object} context - User context
   * @returns {boolean} Whether user is in rollout percentage
   */
  evaluatePercentage(flag, context) {
    if (!context.userId) return false;

    const percentage = flag.rollout_percentage || 0;
    if (percentage === 0) return false;
    if (percentage === 100) return true;

    // Consistent hashing based on user ID
    const hash = this.hashString(context.userId + flag.key);
    const userPercentage = hash % 100;

    return userPercentage < percentage;
  }

  /**
   * Evaluate user list targeting
   * @param {Object} flag - Feature flag
   * @param {Object} context - User context
   * @returns {boolean} Whether user is in target list
   */
  evaluateUserList(flag, context) {
    if (!context.userId) return false;

    const targetUsers = flag.target_users || [];
    return targetUsers.includes(context.userId);
  }

  /**
   * Evaluate user attributes targeting
   * @param {Object} flag - Feature flag
   * @param {Object} context - User context
   * @returns {boolean} Whether user matches attribute rules
   */
  evaluateUserAttributes(flag, context) {
    if (!context.attributes) return false;

    const rules = flag.attribute_rules || [];
    
    // All rules must match (AND logic)
    return rules.every(rule => {
      const userValue = context.attributes[rule.attribute];
      
      switch (rule.operator) {
        case 'equals':
          return userValue === rule.value;
        case 'not_equals':
          return userValue !== rule.value;
        case 'contains':
          return Array.isArray(userValue) && userValue.includes(rule.value);
        case 'greater_than':
          return userValue > rule.value;
        case 'less_than':
          return userValue < rule.value;
        case 'in':
          return Array.isArray(rule.value) && rule.value.includes(userValue);
        default:
          return false;
      }
    });
  }

  /**
   * Evaluate custom targeting logic
   * @param {Object} flag - Feature flag
   * @param {Object} context - User context
   * @returns {boolean} Result of custom evaluation
   */
  evaluateCustom(flag, context) {
    // Custom evaluation logic can be implemented here
    // For now, return false as a safe default
    return false;
  }

  /**
   * Create or update a feature flag
   * @param {Object} flagConfig - Feature flag configuration
   * @returns {Promise<Object>} Created/updated flag
   */
  async setFlag(flagConfig) {
    const {
      key,
      name,
      description,
      status = FeatureFlagStatus.DISABLED,
      targeting_strategy = TargetingStrategy.ALL_USERS,
      rollout_percentage = 0,
      target_users = [],
      attribute_rules = [],
      metadata = {}
    } = flagConfig;

    // Validate required fields
    if (!key || !name) {
      throw new Error('Feature flag key and name are required');
    }

    // Check if flag exists
    const { data: existing } = await this.supabase
      .from('feature_flags')
      .select('id')
      .eq('key', key)
      .single();

    let result;
    if (existing) {
      // Update existing flag
      const { data, error } = await this.supabase
        .from('feature_flags')
        .update({
          name,
          description,
          status,
          targeting_strategy,
          rollout_percentage,
          target_users,
          attribute_rules,
          metadata,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Create new flag
      const { data, error } = await this.supabase
        .from('feature_flags')
        .insert({
          key,
          name,
          description,
          status,
          targeting_strategy,
          rollout_percentage,
          target_users,
          attribute_rules,
          metadata,
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    // Clear cache for this flag
    this.cache.delete(key);

    return result;
  }

  /**
   * Enable a feature flag
   * @param {string} featureKey - Feature flag key
   * @param {number} percentage - Rollout percentage (0-100)
   * @returns {Promise<Object>} Updated flag
   */
  async enableFlag(featureKey, percentage = 100) {
    const status = percentage === 100 
      ? FeatureFlagStatus.ENABLED 
      : FeatureFlagStatus.ROLLOUT;

    const { data, error } = await this.supabase
      .from('feature_flags')
      .update({
        status,
        rollout_percentage: percentage,
        updated_at: new Date().toISOString()
      })
      .eq('key', featureKey)
      .select()
      .single();

    if (error) throw error;

    // Clear cache
    this.cache.delete(featureKey);

    // Log flag change
    await this.logFlagChange(featureKey, 'enabled', { percentage });

    return data;
  }

  /**
   * Disable a feature flag
   * @param {string} featureKey - Feature flag key
   * @returns {Promise<Object>} Updated flag
   */
  async disableFlag(featureKey) {
    const { data, error } = await this.supabase
      .from('feature_flags')
      .update({
        status: FeatureFlagStatus.DISABLED,
        updated_at: new Date().toISOString()
      })
      .eq('key', featureKey)
      .select()
      .single();

    if (error) throw error;

    // Clear cache
    this.cache.delete(featureKey);

    // Log flag change
    await this.logFlagChange(featureKey, 'disabled', {});

    return data;
  }

  /**
   * Gradually increase rollout percentage
   * @param {string} featureKey - Feature flag key
   * @param {number} targetPercentage - Target percentage
   * @param {number} incrementBy - Increment step
   * @returns {Promise<Object>} Updated flag
   */
  async gradualRollout(featureKey, targetPercentage, incrementBy = 10) {
    const { data: flag } = await this.supabase
      .from('feature_flags')
      .select('rollout_percentage')
      .eq('key', featureKey)
      .single();

    if (!flag) {
      throw new Error(`Feature flag ${featureKey} not found`);
    }

    const currentPercentage = flag.rollout_percentage || 0;
    const newPercentage = Math.min(currentPercentage + incrementBy, targetPercentage);

    return await this.enableFlag(featureKey, newPercentage);
  }

  /**
   * Get all feature flags
   * @returns {Promise<Array>} All feature flags
   */
  async getAllFlags() {
    const { data, error } = await this.supabase
      .from('feature_flags')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data;
  }

  /**
   * Get feature flag evaluation history
   * @param {string} featureKey - Feature flag key
   * @returns {Promise<Array>} Evaluation history
   */
  async getEvaluationHistory(featureKey) {
    const { data, error } = await this.supabase
      .from('feature_flag_evaluations')
      .select('*')
      .eq('feature_key', featureKey)
      .order('evaluated_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    return data;
  }

  /**
   * Log feature flag change
   * @param {string} featureKey - Feature flag key
   * @param {string} action - Action performed
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<void>}
   */
  async logFlagChange(featureKey, action, metadata = {}) {
    await this.supabase
      .from('feature_flag_audit_log')
      .insert({
        feature_key: featureKey,
        action,
        metadata,
        created_at: new Date().toISOString()
      });
  }

  /**
   * Track feature flag evaluation
   * @param {string} featureKey - Feature flag key
   * @param {string} userId - User ID
   * @param {boolean} result - Evaluation result
   * @returns {Promise<void>}
   */
  async trackEvaluation(featureKey, userId, result) {
    await this.supabase
      .from('feature_flag_evaluations')
      .insert({
        feature_key: featureKey,
        user_id: userId,
        result,
        evaluated_at: new Date().toISOString()
      });
  }

  /**
   * Get feature flag statistics
   * @param {string} featureKey - Feature flag key
   * @returns {Promise<Object>} Statistics
   */
  async getStatistics(featureKey) {
    const { data, error } = await this.supabase
      .rpc('get_feature_flag_statistics', {
        flag_key: featureKey
      });

    if (error) throw error;

    return data[0] || {
      total_evaluations: 0,
      enabled_count: 0,
      disabled_count: 0,
      enabled_percentage: 0
    };
  }

  /**
   * Cache management
   */
  getCached(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > this.cacheExpiry) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clearCache() {
    this.cache.clear();
  }

  /**
   * Hash string for consistent percentage evaluation
   * @param {string} str - String to hash
   * @returns {number} Hash value
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

/**
 * Create feature flag manager instance
 * @param {string} supabaseUrl - Supabase URL
 * @param {string} supabaseKey - Supabase key
 * @returns {FeatureFlagManager} Manager instance
 */
export function createFeatureFlagManager(supabaseUrl, supabaseKey) {
  return new FeatureFlagManager(supabaseUrl, supabaseKey);
}
