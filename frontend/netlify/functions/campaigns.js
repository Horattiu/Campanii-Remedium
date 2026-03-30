import { getStore } from '@netlify/blobs'

const store = getStore('campaigns-store')
const campaignsKey = 'campaigns-list'

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }
}

function normalizeCampaign(campaign) {
  return {
    id: campaign.id ?? Date.now(),
    name: typeof campaign.name === 'string' ? campaign.name : '',
    owner: typeof campaign.owner === 'string' ? campaign.owner : '',
    producer:
      typeof campaign.producer === 'string'
        ? campaign.producer
        : Array.isArray(campaign.products)
          ? campaign.products.join(', ')
          : '',
    startDate: typeof campaign.startDate === 'string' ? campaign.startDate : '',
    endDate: typeof campaign.endDate === 'string' ? campaign.endDate : '',
    workflowStatus:
      typeof campaign.workflowStatus === 'string' ? campaign.workflowStatus : 'alocata',
  }
}

async function readCampaignsFromStore() {
  const storedCampaigns = await store.get(campaignsKey, { type: 'json' })
  if (!Array.isArray(storedCampaigns)) {
    return []
  }

  return storedCampaigns.map(normalizeCampaign)
}

export async function handler(event) {
  try {
    if (event.httpMethod === 'GET') {
      const campaigns = await readCampaignsFromStore()
      return jsonResponse(200, { campaigns })
    }

    if (event.httpMethod === 'PUT') {
      const parsedBody = JSON.parse(event.body || '{}')
      const incoming = Array.isArray(parsedBody.campaigns) ? parsedBody.campaigns : null
      if (!incoming) {
        return jsonResponse(400, { error: 'Body invalid. Trimite { campaigns: [] }.' })
      }

      const normalizedCampaigns = incoming.map(normalizeCampaign)
      await store.setJSON(campaignsKey, normalizedCampaigns)
      return jsonResponse(200, { campaigns: normalizedCampaigns })
    }

    return jsonResponse(405, { error: 'Method not allowed.' })
  } catch (error) {
    return jsonResponse(500, { error: error.message || 'A aparut o eroare interna.' })
  }
}
