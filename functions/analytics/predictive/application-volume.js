import { supabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseClient.js';

/**
 * Application Volume Prediction API Endpoint
 * Predicts future application volumes based on historical data
 * Validates Requirements 5.3
 */
export async function onRequestPost(context) {
  const { request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  try {
    // Authenticate user
    const authContext = await getUserFromRequest(request);
    if (authContext.error) {
      return new Response(JSON.stringify({ error: authContext.error }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { timeHorizon = 'month', includeSeasonality = true } = await request.json();

    // Get historical application data
    const historicalData = await getHistoricalApplicationData(timeHorizon);
    
    // Calculate prediction
    const prediction = calculateApplicationVolumePrediction(
      historicalData, 
      timeHorizon, 
      includeSeasonality
    );

    return new Response(JSON.stringify(prediction), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Application volume prediction error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to predict application volume',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Get historical application data for prediction
 */
async function getHistoricalApplicationData(timeHorizon) {
  const now = new Date();
  let lookbackPeriod;

  // Determine lookback period based on prediction horizon
  switch (timeHorizon) {
    case 'week':
      lookbackPeriod = 26; // 26 weeks (6 months)
      break;
    case 'month':
      lookbackPeriod = 24; // 24 months (2 years)
      break;
    case 'quarter':
      lookbackPeriod = 12; // 12 quarters (3 years)
      break;
    case 'year':
      lookbackPeriod = 5; // 5 years
      break;
    default:
      lookbackPeriod = 12;
  }

  const startDate = new Date();
  switch (timeHorizon) {
    case 'week':
      startDate.setDate(now.getDate() - (lookbackPeriod * 7));
      break;
    case 'month':
      startDate.setMonth(now.getMonth() - lookbackPeriod);
      break;
    case 'quarter':
      startDate.setMonth(now.getMonth() - (lookbackPeriod * 3));
      break;
    case 'year':
      startDate.setFullYear(now.getFullYear() - lookbackPeriod);
      break;
  }

  const { data: applications, error } = await supabaseAdminClient
    .from('applications')
    .select('id, created_at, program, status')
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch historical applications: ${error.message}`);
  }

  return applications || [];
}

/**
 * Calculate application volume prediction using time series analysis
 */
function calculateApplicationVolumePrediction(historicalData, timeHorizon, includeSeasonality) {
  // Group data by time periods
  const timeSeries = groupApplicationsByPeriod(historicalData, timeHorizon);
  
  if (timeSeries.length < 3) {
    // Not enough data for reliable prediction
    return {
      predictedVolume: 0,
      confidenceInterval: { lower: 0, upper: 0 },
      confidence: 0,
      timeframe: getTimeframeLabel(timeHorizon),
      breakdown: [],
      seasonalFactors: []
    };
  }

  // Calculate linear trend
  const trend = calculateLinearTrend(timeSeries);
  
  // Calculate seasonal factors if requested
  let seasonalFactors = [];
  let seasonalMultiplier = 1;
  
  if (includeSeasonality && timeSeries.length >= 12) {
    seasonalFactors = calculateSeasonalFactors(timeSeries, timeHorizon);
    const currentPeriod = getCurrentPeriod(timeHorizon);
    const seasonalFactor = seasonalFactors.find(f => f.month === currentPeriod);
    seasonalMultiplier = seasonalFactor ? seasonalFactor.multiplier : 1;
  }

  // Generate base prediction
  const nextPeriodIndex = timeSeries.length;
  const basePrediction = trend.slope * nextPeriodIndex + trend.intercept;
  const predictedVolume = Math.max(0, Math.round(basePrediction * seasonalMultiplier));

  // Calculate confidence interval
  const standardError = calculatePredictionError(timeSeries, trend);
  const confidenceInterval = {
    lower: Math.max(0, Math.round(predictedVolume - (1.96 * standardError))),
    upper: Math.round(predictedVolume + (1.96 * standardError))
  };

  // Calculate program breakdown
  const programBreakdown = calculateProgramBreakdown(historicalData, predictedVolume);

  // Calculate confidence based on data quality and trend stability
  const confidence = calculatePredictionConfidence(timeSeries, trend, standardError);

  return {
    predictedVolume,
    confidenceInterval,
    confidence,
    timeframe: getTimeframeLabel(timeHorizon),
    breakdown: programBreakdown,
    seasonalFactors
  };
}

/**
 * Group applications by time period
 */
function groupApplicationsByPeriod(applications, timeHorizon) {
  const groups = {};
  
  applications.forEach(app => {
    const date = new Date(app.created_at);
    let periodKey;
    
    switch (timeHorizon) {
      case 'week':
        // Group by week (Monday start)
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay() + 1);
        periodKey = weekStart.toISOString().substring(0, 10);
        break;
      case 'month':
        periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        break;
      case 'quarter':
        const quarter = Math.floor(date.getMonth() / 3) + 1;
        periodKey = `${date.getFullYear()}-Q${quarter}`;
        break;
      case 'year':
        periodKey = date.getFullYear().toString();
        break;
      default:
        periodKey = date.toISOString().substring(0, 7); // Default to month
    }
    
    if (!groups[periodKey]) {
      groups[periodKey] = 0;
    }
    groups[periodKey]++;
  });
  
  // Convert to sorted array
  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, count], index) => ({
      period,
      count,
      index
    }));
}

/**
 * Calculate linear trend from time series data
 */
function calculateLinearTrend(timeSeries) {
  const n = timeSeries.length;
  if (n < 2) return { slope: 0, intercept: 0 };
  
  const sumX = timeSeries.reduce((sum, item) => sum + item.index, 0);
  const sumY = timeSeries.reduce((sum, item) => sum + item.count, 0);
  const sumXY = timeSeries.reduce((sum, item) => sum + (item.index * item.count), 0);
  const sumXX = timeSeries.reduce((sum, item) => sum + (item.index * item.index), 0);
  
  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return { slope: 0, intercept: sumY / n };
  
  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  
  return { slope, intercept };
}

/**
 * Calculate seasonal factors
 */
function calculateSeasonalFactors(timeSeries, timeHorizon) {
  const seasonalData = {};
  
  timeSeries.forEach(item => {
    let seasonKey;
    
    if (timeHorizon === 'month') {
      // Extract month from period (YYYY-MM format)
      const month = parseInt(item.period.split('-')[1]);
      seasonKey = month;
    } else if (timeHorizon === 'quarter') {
      // Extract quarter from period (YYYY-QN format)
      const quarter = parseInt(item.period.split('-Q')[1]);
      seasonKey = quarter;
    } else {
      // For week and year, use simplified seasonal grouping
      seasonKey = 1;
    }
    
    if (!seasonalData[seasonKey]) {
      seasonalData[seasonKey] = [];
    }
    seasonalData[seasonKey].push(item.count);
  });
  
  // Calculate overall average
  const overallAverage = timeSeries.reduce((sum, item) => sum + item.count, 0) / timeSeries.length;
  
  // Calculate seasonal multipliers
  return Object.entries(seasonalData).map(([season, counts]) => {
    const seasonalAverage = counts.reduce((sum, count) => sum + count, 0) / counts.length;
    return {
      month: parseInt(season),
      multiplier: overallAverage > 0 ? seasonalAverage / overallAverage : 1
    };
  });
}

/**
 * Calculate prediction error (standard error)
 */
function calculatePredictionError(timeSeries, trend) {
  if (timeSeries.length < 3) return 0;
  
  const predictions = timeSeries.map(item => trend.slope * item.index + trend.intercept);
  const squaredErrors = timeSeries.map((item, i) => 
    Math.pow(item.count - predictions[i], 2)
  );
  
  const mse = squaredErrors.reduce((sum, error) => sum + error, 0) / (timeSeries.length - 2);
  return Math.sqrt(mse);
}

/**
 * Calculate program-specific breakdown
 */
function calculateProgramBreakdown(applications, totalPredicted) {
  const programCounts = {};
  
  applications.forEach(app => {
    programCounts[app.program] = (programCounts[app.program] || 0) + 1;
  });
  
  const totalHistorical = applications.length;
  
  return Object.entries(programCounts).map(([program, count]) => {
    const proportion = count / totalHistorical;
    const predictedApplications = Math.round(proportion * totalPredicted);
    
    // Calculate confidence based on historical data volume
    const confidence = Math.min(95, Math.max(50, 70 + (count / 10)));
    
    return {
      program,
      predictedApplications,
      confidence: Math.round(confidence)
    };
  });
}

/**
 * Calculate prediction confidence
 */
function calculatePredictionConfidence(timeSeries, trend, standardError) {
  let confidence = 85; // Base confidence
  
  // Adjust based on data points
  if (timeSeries.length < 6) confidence -= 20;
  else if (timeSeries.length < 12) confidence -= 10;
  
  // Adjust based on trend stability (R-squared)
  const rSquared = calculateRSquared(timeSeries, trend);
  confidence = Math.round(confidence * rSquared);
  
  // Adjust based on prediction error
  const avgValue = timeSeries.reduce((sum, item) => sum + item.count, 0) / timeSeries.length;
  const errorRatio = standardError / avgValue;
  if (errorRatio > 0.5) confidence -= 15;
  else if (errorRatio > 0.3) confidence -= 10;
  
  return Math.max(50, Math.min(95, confidence));
}

/**
 * Calculate R-squared for trend fit
 */
function calculateRSquared(timeSeries, trend) {
  const actualValues = timeSeries.map(item => item.count);
  const predictedValues = timeSeries.map(item => trend.slope * item.index + trend.intercept);
  const meanActual = actualValues.reduce((sum, val) => sum + val, 0) / actualValues.length;
  
  const totalSumSquares = actualValues.reduce((sum, val) => sum + Math.pow(val - meanActual, 2), 0);
  const residualSumSquares = actualValues.reduce((sum, val, i) => 
    sum + Math.pow(val - predictedValues[i], 2), 0
  );
  
  return totalSumSquares > 0 ? 1 - (residualSumSquares / totalSumSquares) : 0;
}

/**
 * Get current period for seasonal adjustment
 */
function getCurrentPeriod(timeHorizon) {
  const now = new Date();
  
  switch (timeHorizon) {
    case 'month':
      return now.getMonth() + 1;
    case 'quarter':
      return Math.floor(now.getMonth() / 3) + 1;
    default:
      return 1;
  }
}

/**
 * Get timeframe label for display
 */
function getTimeframeLabel(timeHorizon) {
  switch (timeHorizon) {
    case 'week':
      return 'next_week';
    case 'month':
      return 'next_month';
    case 'quarter':
      return 'next_quarter';
    case 'year':
      return 'next_year';
    default:
      return 'next_period';
  }
}