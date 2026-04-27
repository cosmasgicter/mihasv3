import { apiClient } from '@/services/api/client'
import { env } from '@/lib/env'
import type { EmailMessage, EmailThread, PaginatedResponse } from '@/services/api/contracts'

type RawEmailThread = {
  id: string
  subject: string
  thread_key: string
  status: string
}

type RawEmailMessage = {
  id: string
  thread_id: string
  direction: string
  sender: string
  recipient: string
  subject: string
  body_preview: string
  classification: string
}

const fallbackThreads: EmailThread[] = [
  {
    id: '420dbbdd-fa7a-4ebb-9a0b-cfd70551017a',
    subject: 'Senior Data Analyst follow-up',
    threadKey: 'zoho-thread-scaffold-1',
    status: 'open',
  },
  {
    id: 'e44804a6-798f-4f3b-88b0-80728d69389d',
    subject: 'Referral introduction to Regional NGO Network',
    threadKey: 'zoho-thread-scaffold-2',
    status: 'awaiting_reply',
  },
]

const fallbackMessages: EmailMessage[] = [
  {
    id: '8ee5d8c5-b4a5-49f6-a7d5-48df6097dbdb',
    threadId: '420dbbdd-fa7a-4ebb-9a0b-cfd70551017a',
    direction: 'outbound',
    sender: 'operator@example.com',
    recipient: 'recruiter@example.com',
    subject: 'Senior Data Analyst follow-up',
    bodyPreview: 'Scaffold message preview for a follow-up or introduction.',
    classification: 'positive_signal_pending_review',
  },
  {
    id: '1d1f0f56-f8f6-43af-8025-c4ac77346645',
    threadId: 'e44804a6-798f-4f3b-88b0-80728d69389d',
    direction: 'inbound',
    sender: 'director@example.org',
    recipient: 'operator@example.com',
    subject: 'Referral introduction to Regional NGO Network',
    bodyPreview: 'Thanks for the thoughtful note. Please share the resume variant tailored to programme operations.',
    classification: 'request_for_more_info',
  },
]

function mapThread(thread: RawEmailThread): EmailThread {
  return {
    id: thread.id,
    subject: thread.subject,
    threadKey: thread.thread_key,
    status: thread.status,
  }
}

function mapMessage(message: RawEmailMessage): EmailMessage {
  return {
    id: message.id,
    threadId: message.thread_id,
    direction: message.direction,
    sender: message.sender,
    recipient: message.recipient,
    subject: message.subject,
    bodyPreview: message.body_preview,
    classification: message.classification,
  }
}

export async function listEmailThreads(): Promise<PaginatedResponse<EmailThread>> {
  try {
    const payload = await apiClient.get<PaginatedResponse<RawEmailThread>>('/api/v1/email/threads/')
    return {
      ...payload,
      results: payload.results.map(mapThread),
    }
  } catch (error) {
    if (env.demoMode) return { page: 1, pageSize: 20, totalCount: fallbackThreads.length, results: fallbackThreads }
    throw error
  }
}

export async function listEmailMessages(): Promise<PaginatedResponse<EmailMessage>> {
  try {
    const payload = await apiClient.get<PaginatedResponse<RawEmailMessage>>('/api/v1/email/messages/')
    return {
      ...payload,
      results: payload.results.map(mapMessage),
    }
  } catch (error) {
    if (env.demoMode) return { page: 1, pageSize: 20, totalCount: fallbackMessages.length, results: fallbackMessages }
    throw error
  }
}
