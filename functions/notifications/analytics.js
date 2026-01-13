/**
 * Notification Analytics API Endpoint
 * Provides comprehensive analytics for notification delivery rates, user engagement metrics,
 * and optimal delivery time recommendations.
 * 
 * Requirements: 6.5 - Notification analytics dashboard
 */

import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js';

export async function onRequest(context) {
  const { request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // Authentication required - admin only for analytics
    const authContext = await getUserFromRequest(request);
    if (authContext.error) {
      return new Response(JSON.stringify({ error: authContext.error }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Verify admin permissions
    const isAdmin = authContext.user.role === 'admin' || authContext.user.role === 'super_admin';
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Admin access required for analytics' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'overview';
    
    switch (action) {
      case 'overview':
        return await getAnalyticsOverview(url, corsHeaders);
      case 'delivery-rates':
        return await getDeliveryRates(url, corsHeaders);
      case 'user-engagement':
        return await getUserEngagement(url, corsHeaders);
      case 'optimal-times':
        return await getOptimalTimes(url, corsHeaders);
      case 'channel-performance':
        return await getChannelPerformance(url, corsHeaders);
      case 'trends':
        return await getTrends(url, corsHeaders);
      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
    
  } catch (error) {
    console.error('Notification analytics error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Get comprehensive analytics overview
 */
async function getAnalyticsOverview(url, corsHeaders) {
  const daysBack = Math.min(parseInt(url.searchParams.get('days')) || 7, 90);
  const channel = url.searchParams.get('channel') || null;
  
  try {
    const { data: analytics, error } = await supabaseAdminClient
      .rpc('get_notification_analytics', {
        p_days_back: daysBack,
        p_channel: channel
      });
    
    if (error) {
      throw error;
    }
    
    const result = analytics[0] || {
      total_notifications: 0,
      successful_deliveries: 0,
      failed_deliveries: 0,
      overall_success_rate: 0,
      channel_breakdown: [],
      daily_trends: [],
      optimal_hours: [],
      top_performing_channels: []
    };
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        summary: {
          total_notifications: result.total_notifications,
          successful_deliveries: result.successful_deliveries,
          failed_deliveries: result.failed_deliveries,
          overall_success_rate: result.overall_success_rate,
          time_period_days: daysBack
        },
        channel_breakdown: result.channel_breakdown,
        daily_trends: result.daily_trends,
        optimal_hours: result.optimal_hours,
        top_performing_channels: result.top_performing_channels
      },
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Analytics overview error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Get detailed delivery rates by channel and time
 */
async function getDeliveryRates(url, corsHeaders) {
  const daysBack = Math.min(parseInt(url.searchParams.get('days')) || 7, 90);
  const channel = url.searchParams.get('channel');
  const groupBy = url.searchParams.get('group_by') || 'hour'; // hour, day
  
  try {
    let query = supabaseAdminClient
      .from('notification_delivery_analytics')
      .select('*')
      .gte('delivery_date', new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString());
    
    if (channel) {
      query = query.eq('channel', channel);
    }
    
    const { data: deliveryRates, error } = await query
      .order('delivery_date', { ascending: true });
    
    if (error) {
      throw error;
    }
    
    // Group data based on groupBy parameter
    const groupedData = groupBy === 'day' 
      ? groupByDay(deliveryRates)
      : groupByHour(deliveryRates);
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        delivery_rates: groupedData,
        group_by: groupBy,
        time_period_days: daysBack,
        channel_filter: channel
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Delivery rates error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Get user engagement metrics
 */
async function getUserEngagement(url, corsHeaders) {
  const daysBack = Math.min(parseInt(url.searchParams.get('days')) || 30, 90);
  const limit = Math.min(parseInt(url.searchParams.get('limit')) || 50, 500);
  
  try {
    const { data: engagement, error } = await supabaseAdminClient
      .rpc('get_user_engagement_metrics', {
        p_days_back: daysBack,
        p_limit: limit
      });
    
    if (error) {
      throw error;
    }
    
    // Calculate engagement statistics
    const stats = calculateEngagementStats(engagement);
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        user_engagement: engagement,
        statistics: stats,
        time_period_days: daysBack
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('User engagement error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Get optimal delivery time recommendations
 */
async function getOptimalTimes(url, corsHeaders) {
  const channel = url.searchParams.get('channel');
  
  try {
    const { data: recommendations, error } = await supabaseAdminClient
      .rpc('get_optimal_delivery_recommendations', {
        p_channel: channel
      });
    
    if (error) {
      throw error;
    }
    
    // Get detailed time analysis
    const { data: timeAnalysis, error: timeError } = await supabaseAdminClient
      .from('notification_optimal_times')
      .select('*')
      .order('success_rate', { ascending: false })
      .limit(50);
    
    if (timeError) {
      throw timeError;
    }
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        recommendations: recommendations,
        detailed_analysis: timeAnalysis,
        channel_filter: channel
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Optimal times error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Get channel performance comparison
 */
async function getChannelPerformance(url, corsHeaders) {
  const daysBack = Math.min(parseInt(url.searchParams.get('days')) || 7, 90);
  
  try {
    const { data: performance, error } = await supabaseAdminClient
      .from('notification_delivery_analytics')
      .select('channel, total_notifications, success_rate, delivery_rate, avg_delivery_time_seconds')
      .gte('delivery_date', new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString());
    
    if (error) {
      throw error;
    }
    
    // Aggregate by channel
    const channelStats = aggregateByChannel(performance);
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        channel_performance: channelStats,
        time_period_days: daysBack
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Channel performance error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Get notification trends over time
 */
async function getTrends(url, corsHeaders) {
  const daysBack = Math.min(parseInt(url.searchParams.get('days')) || 30, 90);
  const interval = url.searchParams.get('interval') || 'day'; // hour, day, week
  
  try {
    let dateFormat;
    switch (interval) {
      case 'hour':
        dateFormat = 'delivery_hour';
        break;
      case 'week':
        dateFormat = 'delivery_date';
        break;
      default:
        dateFormat = 'delivery_date';
    }
    
    const { data: trends, error } = await supabaseAdminClient
      .from('notification_delivery_analytics')
      .select(`${dateFormat}, channel, total_notifications, success_rate, delivery_rate`)
      .gte('delivery_date', new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString())
      .order(dateFormat, { ascending: true });
    
    if (error) {
      throw error;
    }
    
    // Process trends data
    const processedTrends = processTrendsData(trends, interval);
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        trends: processedTrends,
        interval: interval,
        time_period_days: daysBack
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Trends error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Helper function to group delivery rates by day
 */
function groupByDay(data) {
  const grouped = {};
  
  data.forEach(item => {
    const day = item.delivery_date;
    if (!grouped[day]) {
      grouped[day] = {
        date: day,
        channels: {},
        total_notifications: 0,
        total_successful: 0
      };
    }
    
    grouped[day].channels[item.channel] = {
      total_notifications: item.total_notifications,
      success_rate: item.success_rate,
      delivery_rate: item.delivery_rate
    };
    
    grouped[day].total_notifications += item.total_notifications;
    grouped[day].total_successful += Math.round(item.total_notifications * item.success_rate / 100);
  });
  
  return Object.values(grouped).map(day => ({
    ...day,
    overall_success_rate: day.total_notifications > 0 
      ? Math.round((day.total_successful / day.total_notifications) * 100 * 100) / 100
      : 0
  }));
}

/**
 * Helper function to group delivery rates by hour
 */
function groupByHour(data) {
  const grouped = {};
  
  data.forEach(item => {
    const hour = item.delivery_hour;
    if (!grouped[hour]) {
      grouped[hour] = {
        hour: hour,
        channels: {},
        total_notifications: 0,
        total_successful: 0
      };
    }
    
    grouped[hour].channels[item.channel] = {
      total_notifications: item.total_notifications,
      success_rate: item.success_rate,
      delivery_rate: item.delivery_rate
    };
    
    grouped[hour].total_notifications += item.total_notifications;
    grouped[hour].total_successful += Math.round(item.total_notifications * item.success_rate / 100);
  });
  
  return Object.values(grouped).map(hour => ({
    ...hour,
    overall_success_rate: hour.total_notifications > 0 
      ? Math.round((hour.total_successful / hour.total_notifications) * 100 * 100) / 100
      : 0
  }));
}

/**
 * Helper function to calculate engagement statistics
 */
function calculateEngagementStats(engagement) {
  if (!engagement || engagement.length === 0) {
    return {
      total_users: 0,
      avg_engagement_score: 0,
      high_engagement_users: 0,
      low_engagement_users: 0,
      most_popular_channel: null
    };
  }
  
  const totalUsers = engagement.length;
  const avgEngagement = engagement.reduce((sum, user) => sum + (user.engagement_score || 0), 0) / totalUsers;
  const highEngagement = engagement.filter(user => (user.engagement_score || 0) >= 80).length;
  const lowEngagement = engagement.filter(user => (user.engagement_score || 0) < 50).length;
  
  // Find most popular channel
  const channelCounts = {};
  engagement.forEach(user => {
    if (user.preferred_channel) {
      channelCounts[user.preferred_channel] = (channelCounts[user.preferred_channel] || 0) + 1;
    }
  });
  
  const mostPopularChannel = Object.keys(channelCounts).reduce((a, b) => 
    channelCounts[a] > channelCounts[b] ? a : b, null
  );
  
  return {
    total_users: totalUsers,
    avg_engagement_score: Math.round(avgEngagement * 100) / 100,
    high_engagement_users: highEngagement,
    low_engagement_users: lowEngagement,
    most_popular_channel: mostPopularChannel,
    channel_distribution: channelCounts
  };
}

/**
 * Helper function to aggregate performance by channel
 */
function aggregateByChannel(data) {
  const channels = {};
  
  data.forEach(item => {
    if (!channels[item.channel]) {
      channels[item.channel] = {
        channel: item.channel,
        total_notifications: 0,
        total_success_rate: 0,
        total_delivery_rate: 0,
        total_delivery_time: 0,
        count: 0
      };
    }
    
    channels[item.channel].total_notifications += item.total_notifications;
    channels[item.channel].total_success_rate += item.success_rate || 0;
    channels[item.channel].total_delivery_rate += item.delivery_rate || 0;
    channels[item.channel].total_delivery_time += item.avg_delivery_time_seconds || 0;
    channels[item.channel].count += 1;
  });
  
  return Object.values(channels).map(channel => ({
    channel: channel.channel,
    total_notifications: channel.total_notifications,
    avg_success_rate: channel.count > 0 ? Math.round((channel.total_success_rate / channel.count) * 100) / 100 : 0,
    avg_delivery_rate: channel.count > 0 ? Math.round((channel.total_delivery_rate / channel.count) * 100) / 100 : 0,
    avg_delivery_time_seconds: channel.count > 0 ? Math.round((channel.total_delivery_time / channel.count) * 100) / 100 : 0
  }));
}

/**
 * Helper function to process trends data
 */
function processTrendsData(data, interval) {
  const processed = {};
  
  data.forEach(item => {
    const key = interval === 'hour' ? item.delivery_hour : item.delivery_date;
    
    if (!processed[key]) {
      processed[key] = {
        period: key,
        channels: {},
        total_notifications: 0,
        overall_success_rate: 0
      };
    }
    
    processed[key].channels[item.channel] = {
      total_notifications: item.total_notifications,
      success_rate: item.success_rate,
      delivery_rate: item.delivery_rate
    };
    
    processed[key].total_notifications += item.total_notifications;
  });
  
  // Calculate overall success rates
  return Object.values(processed).map(period => {
    const totalSuccessful = Object.values(period.channels).reduce((sum, channel) => {
      return sum + Math.round(channel.total_notifications * channel.success_rate / 100);
    }, 0);
    
    return {
      ...period,
      overall_success_rate: period.total_notifications > 0 
        ? Math.round((totalSuccessful / period.total_notifications) * 100 * 100) / 100
        : 0
    };
  });
}