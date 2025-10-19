import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'

let sqsClient
let hasWarnedAboutQueue = false

function getSqsClient() {
  const queueUrl = process.env.SCALING_METRICS_QUEUE_URL
  if (!queueUrl) {
    if (!hasWarnedAboutQueue && process.env.NODE_ENV !== 'production') {
      console.warn('[scalingMetrics] SCALING_METRICS_QUEUE_URL is not configured; metrics will not be published')
      hasWarnedAboutQueue = true
    }
    return null
  }

  if (!sqsClient) {
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION
    if (!region) {
      if (!hasWarnedAboutQueue) {
        console.warn('[scalingMetrics] AWS region is not configured; metrics will not be published')
        hasWarnedAboutQueue = true
      }
      return null
    }

    sqsClient = new SQSClient({ region })
  }

  return sqsClient
}

function createBaseMetric(functionName) {
  return {
    functionName,
    environment: process.env.NETLIFY_CONTEXT || process.env.NODE_ENV || 'development',
    siteId: process.env.NETLIFY_SITE_ID || null,
    timestamp: new Date().toISOString()
  }
}

async function publishScalingMetric(functionName, metric) {
  const queueUrl = process.env.SCALING_METRICS_QUEUE_URL
  const client = getSqsClient()

  if (!queueUrl || !client) {
    return
  }

  const payload = {
    ...createBaseMetric(functionName),
    ...metric
  }

  try {
    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(payload)
    })
    await client.send(command)
  } catch (error) {
    console.error('[scalingMetrics] Failed to publish metric', {
      functionName,
      error: error?.message
    })
  }
}

export function createDurationTimer() {
  const start = Date.now()
  return () => Date.now() - start
}

export async function reportFunctionExecution(functionName, { durationMs, status = 'success', queueDepth = null, attributes = {}, errorMessage = null } = {}) {
  await publishScalingMetric(functionName, {
    type: 'execution',
    durationMs,
    status,
    queueDepth,
    errorMessage,
    attributes
  })
}

export async function reportQueueMetrics(functionName, { depth, oldestEntryAgeMs = null, attributes = {} } = {}) {
  await publishScalingMetric(functionName, {
    type: 'queue',
    depth,
    oldestEntryAgeMs,
    attributes
  })
}
