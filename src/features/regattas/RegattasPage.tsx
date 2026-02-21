import { useState, useEffect, type FormEvent } from 'react'
import { regattaService, type Regatta, type RegattaDetail, type RegattaStatus } from '@/net/regattaService'
import { useAuth } from '@/state/authStore'

type Tab = 'active' | 'past'

export function RegattasPage() {
  const { user, isAdmin, isAuthenticated, getAccessToken } = useAuth()
  const [tab, setTab] = useState<Tab>('active')
  const [regattas, setRegattas] = useState<Regatta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<RegattaDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingRegatta, setEditingRegatta] = useState<Regatta | null>(null)

  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formNumRaces, setFormNumRaces] = useState(3)
  const [formThrowouts, setFormThrowouts] = useState(0)
  const [formStatus, setFormStatus] = useState<RegattaStatus>('active')
  const [submitting, setSubmitting] = useState(false)

  const loadRegattas = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = tab === 'active'
        ? await regattaService.listRegattas('active')
        : await regattaService.listRegattas()
      const filtered = tab === 'past'
        ? data.filter((r) => r.status === 'completed' || r.status === 'cancelled')
        : data
      setRegattas(filtered)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load regattas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRegattas()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const canEdit = (regatta: Regatta) =>
    isAdmin || (user?.id != null && regatta.createdBy === user.id)

  const toggleDetail = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
      setDetail(null)
      return
    }
    setExpandedId(id)
    setDetailLoading(true)
    try {
      const d = await regattaService.getRegatta(id)
      setDetail(d)
    } catch {
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const openCreate = () => {
    setEditingRegatta(null)
    setFormName('')
    setFormDescription('')
    setFormNumRaces(3)
    setFormThrowouts(0)
    setFormStatus('active')
    setShowCreateModal(true)
  }

  const openEdit = (regatta: Regatta) => {
    setEditingRegatta(regatta)
    setFormName(regatta.name)
    setFormDescription(regatta.description)
    setFormNumRaces(regatta.numRaces)
    setFormThrowouts(regatta.throwoutCount)
    setFormStatus(regatta.status)
    setShowCreateModal(true)
  }

  const closeModal = () => {
    setShowCreateModal(false)
    setEditingRegatta(null)
    setError(null)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!formName.trim()) return
    setSubmitting(true)
    try {
      const token = await getAccessToken()
      if (editingRegatta) {
        await regattaService.updateRegatta(
          editingRegatta.id,
          { name: formName.trim(), description: formDescription.trim(), numRaces: formNumRaces, throwoutCount: formThrowouts, status: formStatus },
          token,
        )
      } else {
        await regattaService.createRegatta(
          { name: formName.trim(), description: formDescription.trim() || undefined, numRaces: formNumRaces, throwoutCount: formThrowouts },
          token,
        )
      }
      closeModal()
      await loadRegattas()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (regatta: Regatta) => {
    if (!confirm(`Delete "${regatta.name}"? This cannot be undone.`)) return
    try {
      const token = await getAccessToken()
      await regattaService.deleteRegatta(regatta.id, token)
      await loadRegattas()
      if (expandedId === regatta.id) {
        setExpandedId(null)
        setDetail(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    } catch { return iso }
  }

  return (
    <div className="stats-page">
      <div className="stats-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>Regattas</h2>
          {isAuthenticated && (
            <button type="button" className="btn-primary" onClick={openCreate}>
              + New Regatta
            </button>
          )}
        </div>

        <div className="regatta-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'active'}
            className={`regatta-tab${tab === 'active' ? ' active' : ''}`}
            onClick={() => setTab('active')}
          >
            Active
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'past'}
            className={`regatta-tab${tab === 'past' ? ' active' : ''}`}
            onClick={() => setTab('past')}
          >
            Past
          </button>
        </div>

        {loading && <p className="stats-loading">Loading...</p>}
        {error && <p className="stats-error">{error}</p>}
        {!loading && !error && regattas.length === 0 && (
          <p className="stats-empty">
            {tab === 'active' ? 'No active regattas.' : 'No past regattas.'}
          </p>
        )}

        {!loading && regattas.length > 0 && (
          <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
            {regattas.map((regatta) => (
              <div key={regatta.id} className="regatta-card-wrapper">
                <div
                  className={`regatta-card-header${expandedId === regatta.id ? ' expanded' : ''}`}
                  onClick={() => void toggleDetail(regatta.id)}
                >
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{regatta.name}</h3>
                    {regatta.description && (
                      <p style={{ margin: '0.2rem 0 0', opacity: 0.7, fontSize: '0.85rem' }}>
                        {regatta.description}
                      </p>
                    )}
                    <p style={{ margin: '0.2rem 0 0', opacity: 0.5, fontSize: '0.8rem' }}>
                      Created {formatDate(regatta.createdAt)}
                      {regatta.status !== 'active' && (
                        <span className={`regatta-status-badge regatta-status-${regatta.status}`}>
                          {regatta.status}
                        </span>
                      )}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                    <span style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                      {regatta.numRaces} race{regatta.numRaces !== 1 ? 's' : ''}
                      {regatta.throwoutCount > 0 && ` / ${regatta.throwoutCount} throwout${regatta.throwoutCount !== 1 ? 's' : ''}`}
                    </span>
                    <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>
                      {expandedId === regatta.id ? '\u25B2' : '\u25BC'}
                    </span>
                  </div>
                </div>
                {expandedId === regatta.id && (
                  <div className="regatta-card-body">
                    {detailLoading ? (
                      <p style={{ opacity: 0.6, fontSize: '0.9rem' }}>Loading...</p>
                    ) : !detail ? (
                      <p style={{ opacity: 0.6, fontSize: '0.9rem' }}>Could not load details.</p>
                    ) : (
                      <>
                        <p style={{ fontSize: '0.85rem', opacity: 0.7, margin: '0 0 0.75rem' }}>
                          {detail.completedRaceCount} of {detail.numRaces} races completed
                        </p>
                        {detail.standings.length > 0 ? (
                          <table className="stats-table" style={{ fontSize: '0.82rem', width: '100%' }}>
                            <thead>
                              <tr>
                                <th>#</th>
                                <th>Sailor</th>
                                {detail.races.map((race, i) => (
                                  <th key={race.raceId} style={{ textAlign: 'center' }}>R{i + 1}</th>
                                ))}
                                <th style={{ textAlign: 'right' }}>Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.standings.map((entry, rank) => {
                                const isMe = user?.id === entry.userId
                                return (
                                  <tr key={entry.userId} className={isMe ? 'stats-row-me' : ''}>
                                    <td>{rank + 1}</td>
                                    <td>{entry.displayName}{isMe && <span className="stats-you-badge">you</span>}</td>
                                    {entry.racePoints.map((pts, i) => {
                                      const dropped = entry.droppedIndices.includes(i)
                                      return (
                                        <td key={i} style={{
                                          textAlign: 'center',
                                          opacity: dropped ? 0.4 : 1,
                                          textDecoration: dropped ? 'line-through' : 'none',
                                        }}>
                                          {pts !== null ? pts : '\u2014'}
                                        </td>
                                      )
                                    })}
                                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{entry.totalPoints}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        ) : (
                          <p style={{ opacity: 0.5, fontSize: '0.85rem' }}>No results yet.</p>
                        )}
                        {canEdit(regatta) && (
                          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', justifyContent: 'flex-end' }}>
                            <button type="button" className="btn-secondary" onClick={() => openEdit(regatta)}>
                              Edit
                            </button>
                            <button type="button" className="btn-danger" onClick={() => void handleDelete(regatta)}>
                              Delete
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      
      </div>

      {showCreateModal && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>{editingRegatta ? 'Edit Regatta' : 'Create Regatta'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="regatta-name">Name</label>
                <input
                  id="regatta-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Regatta Name"
                  maxLength={80}
                  autoFocus
                  disabled={submitting}
                />
              </div>
              <div className="form-group">
                <label htmlFor="regatta-desc">Description</label>
                <textarea
                  id="regatta-desc"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Description (optional)"
                  maxLength={300}
                  rows={2}
                  disabled={submitting}
                />
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label htmlFor="regatta-num-races">Number of Races</label>
                  <input
                    id="regatta-num-races"
                    type="number"
                    min={1}
                    max={50}
                    value={formNumRaces}
                    onChange={(e) => setFormNumRaces(Math.max(1, Number(e.target.value)))}
                    disabled={submitting}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label htmlFor="regatta-throwouts">Throwouts</label>
                  <input
                    id="regatta-throwouts"
                    type="number"
                    min={0}
                    max={formNumRaces - 1}
                    value={formThrowouts}
                    onChange={(e) => setFormThrowouts(Math.max(0, Number(e.target.value)))}
                    disabled={submitting}
                  />
                </div>
              </div>
              <p style={{ fontSize: '0.8rem', opacity: 0.55, margin: '0.25rem 0 0.75rem' }}>
                Throwouts = worst results discarded from the series total.
              </p>
              {editingRegatta && (
                <div className="form-group">
                  <label htmlFor="regatta-status">Status</label>
                  <select
                    id="regatta-status"
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as RegattaStatus)}
                    disabled={submitting}
                  >
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={closeModal} disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={!formName.trim() || submitting}>
                  {submitting ? 'Saving...' : editingRegatta ? 'Save Changes' : 'Create Regatta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
