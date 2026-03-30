import { useEffect, useMemo, useState } from 'react'

const initialCampaigns = []
const CAMPAIGNS_API = '/.netlify/functions/campaigns'

const dateFormat = new Intl.DateTimeFormat('ro-RO')
const MS_IN_DAY = 1000 * 60 * 60 * 24
const workflowStatuses = [
  { value: 'in-derulare', label: 'In derulare' },
  { value: 'raportata', label: 'Raportata' },
  { value: 'alocata', label: 'Alocata' },
]

const workflowStatusStyles = {
  'in-derulare': 'bg-indigo-100 text-indigo-800 border-indigo-200',
  raportata: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  alocata: 'bg-sky-100 text-sky-800 border-sky-200',
}

const statusStyles = {
  expired: 'bg-red-100 text-red-900 border-red-200',
  urgent: 'bg-orange-100 text-orange-900 border-orange-200',
  warning: 'bg-yellow-100 text-yellow-900 border-yellow-200',
  safe: 'bg-green-100 text-green-900 border-green-200',
}

function normalizeCampaign(campaign) {
  return {
    id: campaign.id ?? Date.now(),
    name: typeof campaign.name === 'string' ? campaign.name : '',
    owner: typeof campaign.owner === 'string' ? campaign.owner : '',
    producer: typeof campaign.producer === 'string' ? campaign.producer : '',
    startDate: typeof campaign.startDate === 'string' ? campaign.startDate : '',
    endDate: typeof campaign.endDate === 'string' ? campaign.endDate : '',
    workflowStatus:
      typeof campaign.workflowStatus === 'string' ? campaign.workflowStatus : 'alocata',
  }
}

async function fetchCampaigns() {
  try {
    const response = await fetch(CAMPAIGNS_API)
    if (!response.ok) {
      throw new Error('Nu am putut citi campaniile din Netlify Function.')
    }

    const payload = await response.json()
    if (!Array.isArray(payload.campaigns)) {
      return initialCampaigns
    }

    return payload.campaigns.map(normalizeCampaign)
  } catch {
    const fallbackResponse = await fetch('/data/campaigns.json')
    if (!fallbackResponse.ok) {
      return initialCampaigns
    }

    const fallbackData = await fallbackResponse.json()
    if (!Array.isArray(fallbackData)) {
      return initialCampaigns
    }

    return fallbackData.map(normalizeCampaign)
  }
}

async function saveCampaigns(campaigns) {
  const response = await fetch(CAMPAIGNS_API, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ campaigns }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(
      payload.error ?? 'Nu am putut salva campaniile in Netlify Blobs.',
    )
  }

  if (!Array.isArray(payload.campaigns)) {
    return initialCampaigns
  }

  return payload.campaigns.map(normalizeCampaign)
}

function getDaysLeft(endDate) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const end = new Date(endDate)
  end.setHours(0, 0, 0, 0)
  return Math.ceil((end - today) / MS_IN_DAY)
}

function getStatus(daysLeft) {
  if (daysLeft < 0) {
    return { label: 'Expirata', style: statusStyles.expired }
  }
  if (daysLeft <= 3) {
    return { label: 'Critica', style: statusStyles.urgent }
  }
  if (daysLeft <= 10) {
    return { label: 'Atentie', style: statusStyles.warning }
  }
  return { label: 'In regula', style: statusStyles.safe }
}

function App() {
  const [campaigns, setCampaigns] = useState(initialCampaigns)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [apiError, setApiError] = useState('')
  const [statusFilter, setStatusFilter] = useState('toate')
  const [form, setForm] = useState({
    name: '',
    owner: '',
    producer: '',
    startDate: '',
    endDate: '',
    workflowStatus: 'alocata',
  })

  useEffect(() => {
    async function loadInitialCampaigns() {
      try {
        const data = await fetchCampaigns()
        setCampaigns(data)
      } catch {
        setApiError('Nu am putut incarca campaniile initiale.')
      } finally {
        setIsLoading(false)
      }
    }

    loadInitialCampaigns()
  }, [])

  const nearestCampaignId = useMemo(() => {
    const activeCampaigns = campaigns
      .map((campaign) => ({
        ...campaign,
        daysLeft: getDaysLeft(campaign.endDate),
      }))
      .filter((campaign) => campaign.daysLeft >= 0)
      .sort((a, b) => a.daysLeft - b.daysLeft)

    return activeCampaigns[0]?.id ?? null
  }, [campaigns])

  const sortedCampaigns = useMemo(() => {
    return [...campaigns].sort(
      (a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime(),
    )
  }, [campaigns])

  const campaignsByStatus = useMemo(() => {
    return workflowStatuses.reduce((acc, status) => {
      acc[status.value] = sortedCampaigns.filter(
        (campaign) => campaign.workflowStatus === status.value,
      )
      return acc
    }, {})
  }, [sortedCampaigns])

  const visibleCampaigns = useMemo(() => {
    if (statusFilter === 'toate') {
      return sortedCampaigns
    }
    return campaignsByStatus[statusFilter] ?? []
  }, [campaignsByStatus, sortedCampaigns, statusFilter])

  function handleChange(event) {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  async function persistCampaigns(nextCampaigns) {
    setApiError('')
    setIsSaving(true)
    try {
      const savedCampaigns = await saveCampaigns(nextCampaigns)
      setCampaigns(savedCampaigns)
      return true
    } catch (error) {
      setApiError(error.message)
      return false
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!form.name || !form.owner || !form.producer || !form.startDate || !form.endDate) {
      return
    }

    if (new Date(form.endDate) < new Date(form.startDate)) {
      alert('Data de final trebuie sa fie dupa data de start.')
      return
    }

    const newCampaign = {
      id: Date.now(),
      name: form.name.trim(),
      owner: form.owner.trim(),
      producer: form.producer.trim(),
      startDate: form.startDate,
      endDate: form.endDate,
      workflowStatus: form.workflowStatus,
    }

    const didSave = await persistCampaigns([...campaigns, newCampaign])
    if (!didSave) {
      return
    }

    setForm({
      name: '',
      owner: '',
      producer: '',
      startDate: '',
      endDate: '',
      workflowStatus: 'alocata',
    })
  }

  async function handleWorkflowStatusChange(campaignId, workflowStatus) {
    const nextCampaigns = campaigns.map((campaign) =>
      campaign.id === campaignId ? { ...campaign, workflowStatus } : campaign,
    )
    await persistCampaigns(nextCampaigns)
  }

  function renderCampaignTable(campaignList) {
    if (campaignList.length === 0) {
      return (
        <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-500">
          Nu exista campanii in aceasta sectiune.
        </p>
      )
    }

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-600">
              <th className="px-3 py-2 font-semibold">Nume campanie</th>
              <th className="px-3 py-2 font-semibold">Responsabil</th>
              <th className="px-3 py-2 font-semibold">Producator</th>
              <th className="px-3 py-2 font-semibold">Data start</th>
              <th className="px-3 py-2 font-semibold">Data final</th>
              <th className="px-3 py-2 font-semibold">Termen</th>
              <th className="px-3 py-2 font-semibold">Status campanie</th>
              <th className="px-3 py-2 font-semibold">Schimba status</th>
            </tr>
          </thead>
          <tbody>
            {campaignList.map((campaign) => {
              const daysLeft = getDaysLeft(campaign.endDate)
              const deadlineStatus = getStatus(daysLeft)
              const workflowStatusLabel = workflowStatuses.find(
                (status) => status.value === campaign.workflowStatus,
              )?.label
              const isNearest = campaign.id === nearestCampaignId
              const termLabel =
                daysLeft < 0
                  ? `${Math.abs(daysLeft)} zile depasite`
                  : daysLeft === 0
                    ? 'Expira astazi'
                    : `${daysLeft} zile ramase`

              return (
                <tr
                  className={`border-b border-slate-100 ${isNearest ? 'bg-blue-50/70' : ''}`}
                  key={campaign.id}
                >
                  <td className="px-3 py-3">
                    <div className="font-medium text-slate-900">{campaign.name}</div>
                    {isNearest && (
                      <span className="mt-1 inline-block rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
                        Cel mai apropiat termen
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">{campaign.owner}</td>
                  <td className="px-3 py-3">{campaign.producer}</td>
                  <td className="px-3 py-3">{dateFormat.format(new Date(campaign.startDate))}</td>
                  <td className="px-3 py-3">{dateFormat.format(new Date(campaign.endDate))}</td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${deadlineStatus.style}`}
                    >
                      {deadlineStatus.label} - {termLabel}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${workflowStatusStyles[campaign.workflowStatus]}`}
                    >
                      {workflowStatusLabel}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <select
                      className="rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-blue-500"
                      disabled={isSaving}
                      onChange={(event) =>
                        handleWorkflowStatusChange(campaign.id, event.target.value)
                      }
                      value={campaign.workflowStatus}
                    >
                      {workflowStatuses.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold md:text-3xl">Home - Campanii interne</h1>
          <p className="mt-2 text-sm text-slate-600">
            Evidenta campaniilor active: responsabil, producator, perioada si urgenta dupa
            termenul de expirare.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Datele sunt citite/salvate prin Netlify Functions + Netlify Blobs.
          </p>
        </header>

        {apiError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {apiError}
          </div>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Adauga campanie</h2>
          <form className="grid gap-3 md:grid-cols-2 lg:grid-cols-3" onSubmit={handleSubmit}>
            <input
              className="rounded-md border border-slate-300 px-3 py-2 outline-none ring-0 focus:border-blue-500"
              name="name"
              onChange={handleChange}
              placeholder="Nume campanie"
              value={form.name}
            />
            <input
              className="rounded-md border border-slate-300 px-3 py-2 outline-none ring-0 focus:border-blue-500"
              name="owner"
              onChange={handleChange}
              placeholder="Responsabil"
              value={form.owner}
            />
            <input
              className="rounded-md border border-slate-300 px-3 py-2 outline-none ring-0 focus:border-blue-500 md:col-span-2 lg:col-span-1"
              name="producer"
              onChange={handleChange}
              placeholder="Producator"
              value={form.producer}
            />
            <input
              className="rounded-md border border-slate-300 px-3 py-2 outline-none ring-0 focus:border-blue-500"
              name="startDate"
              onChange={handleChange}
              type="date"
              value={form.startDate}
            />
            <input
              className="rounded-md border border-slate-300 px-3 py-2 outline-none ring-0 focus:border-blue-500"
              name="endDate"
              onChange={handleChange}
              type="date"
              value={form.endDate}
            />
            <select
              className="rounded-md border border-slate-300 px-3 py-2 outline-none ring-0 focus:border-blue-500"
              name="workflowStatus"
              onChange={handleChange}
              value={form.workflowStatus}
            >
              {workflowStatuses.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
            <button
              className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSaving}
              type="submit"
            >
              {isSaving ? 'Se salveaza...' : 'Salveaza campania'}
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Toate campaniile</h2>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                statusFilter === 'toate'
                  ? 'border-blue-200 bg-blue-100 text-blue-700'
                  : 'border-slate-300 bg-white text-slate-700'
              }`}
              onClick={() => setStatusFilter('toate')}
              type="button"
            >
              Toate ({sortedCampaigns.length})
            </button>
            {workflowStatuses.map((status) => (
              <button
                className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                  statusFilter === status.value
                    ? 'border-blue-200 bg-blue-100 text-blue-700'
                    : 'border-slate-300 bg-white text-slate-700'
                }`}
                disabled={isLoading}
                key={status.value}
                onClick={() => setStatusFilter(status.value)}
                type="button"
              >
                {status.label} ({campaignsByStatus[status.value]?.length ?? 0})
              </button>
            ))}
          </div>
          <div>
            {isLoading ? (
              <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                Se incarca campaniile...
              </p>
            ) : (
              renderCampaignTable(visibleCampaigns)
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

export default App
