import { apiClient } from '@/services/api/client'
import type { OutreachCampaign, OutreachContact, PaginatedResponse } from '@/services/api/contracts'

type RawOutreachContact = {
  id: string
  full_name: string
  email: string
  company: string
  role: string
  relationship_status: string
  tags: string[]
}

type RawOutreachCampaign = {
  id: string
  name: string
  campaign_type: string
  status: string
  target_count: number
}

const fallbackContacts: OutreachContact[] = [
  {
    id: '7c8be2be-8cec-48af-a4fd-f4cf5c4f08b4',
    fullName: 'Thandiwe Mulenga',
    email: 'thandiwe@example.org',
    company: 'Regional NGO Network',
    role: 'Programme Director',
    relationshipStatus: 'warm',
    tags: ['ngo', 'referral', 'east-africa'],
  },
  {
    id: '5aa74ae1-e438-4bd2-a525-1d0569e8ef52',
    fullName: 'Rabecca Chanda',
    email: 'rabecca@example.net',
    company: 'Impact Finance Africa',
    role: 'Talent Partner',
    relationshipStatus: 'contacted',
    tags: ['recruiter', 'follow_up'],
  },
]

const fallbackCampaigns: OutreachCampaign[] = [
  {
    id: 'ce54fb10-e17d-41b8-bdb3-e0197e099741',
    name: 'Warm referrals Q2',
    campaignType: 'referral_request',
    status: 'draft',
    targetCount: 12,
  },
  {
    id: '2dcad499-51eb-4f4f-bb31-335d600538c1',
    name: 'Recruiter follow-ups',
    campaignType: 'application_follow_up',
    status: 'active',
    targetCount: 5,
  },
]

function mapContact(contact: RawOutreachContact): OutreachContact {
  return {
    id: contact.id,
    fullName: contact.full_name,
    email: contact.email,
    company: contact.company,
    role: contact.role,
    relationshipStatus: contact.relationship_status,
    tags: contact.tags,
  }
}

function mapCampaign(campaign: RawOutreachCampaign): OutreachCampaign {
  return {
    id: campaign.id,
    name: campaign.name,
    campaignType: campaign.campaign_type,
    status: campaign.status,
    targetCount: campaign.target_count,
  }
}

export async function listOutreachContacts(): Promise<PaginatedResponse<OutreachContact>> {
  try {
    const payload = await apiClient.get<PaginatedResponse<RawOutreachContact>>('/api/v1/outreach/contacts/')
    return {
      ...payload,
      results: payload.results.map(mapContact),
    }
  } catch {
    return {
      page: 1,
      pageSize: 20,
      totalCount: fallbackContacts.length,
      results: fallbackContacts,
    }
  }
}

export async function listOutreachCampaigns(): Promise<PaginatedResponse<OutreachCampaign>> {
  try {
    const payload = await apiClient.get<PaginatedResponse<RawOutreachCampaign>>('/api/v1/outreach/campaigns/')
    return {
      ...payload,
      results: payload.results.map(mapCampaign),
    }
  } catch {
    return {
      page: 1,
      pageSize: 20,
      totalCount: fallbackCampaigns.length,
      results: fallbackCampaigns,
    }
  }
}
