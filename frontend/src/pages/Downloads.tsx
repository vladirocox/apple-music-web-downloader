import { useState, useEffect } from 'react'

interface Download {
  url: string
  status: string
  output: string
  pid?: number
}

interface Props {
  showToast: (msg: string, type?: 'success' | 'error') => void
}

export function DownloadsPage({ showToast }: Props) {
  const [downloads, setDownloads] = useState<Record<string, Download>>({})
  const [loading, setLoading] = useState(true)

  const fetchDownloads = async () => {
    try {
      const res = await fetch('/api/downloads')
      const data = await res.json()
      setDownloads(data.downloads || {})
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDownloads()
    const interval = setInterval(fetchDownloads, 2000)
    return () => clearInterval(interval)
  }, [])

  const entries = Object.entries(downloads)

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Downloads</h1>
        <p className="page-subtitle">
          {entries.length} download{entries.length !== 1 ? 's' : ''}
        </p>
      </div>
      <div className="page-body">
        {loading ? (
          <div className="empty-state">
            <div className="loading-spinner" style={{ width: 32, height: 32, margin: '0 auto' }} />
          </div>
        ) : entries.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📥</div>
            <div className="empty-state-text">No downloads yet</div>
            <div className="empty-state-hint">
              Search for music and click download to get started
            </div>
          </div>
        ) : (
          <div className="track-list">
            {entries.map(([id, dl]) => (
              <div key={id} className="track-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="track-title" style={{ flex: 1 }}>
                    {dl.url}
                  </div>
                  <span className={`status-badge ${dl.status}`}>
                    {dl.status}
                  </span>
                </div>
                {dl.status === 'downloading' && (
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: '60%' }} />
                  </div>
                )}
                {dl.output && (
                  <pre style={{
                    fontSize: 11,
                    color: 'var(--am-text-tertiary)',
                    marginTop: 8,
                    maxHeight: 80,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {dl.output.split('\n').slice(-5).join('\n')}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
