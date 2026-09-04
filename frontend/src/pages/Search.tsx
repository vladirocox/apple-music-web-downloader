import { useState, useCallback } from 'react'

interface SearchResult {
  id: string
  name: string
  artist: string
  album: string
  artwork?: string
  url: string
  type: string
}

interface Props {
  showToast: (msg: string, type?: 'success' | 'error') => void
}

export function SearchPage({ showToast }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)

  const search = useCallback(async () => {
    if (!query.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), types: 'songs,albums', limit: 25 }),
      })
      const data = await res.json()

      const items: SearchResult[] = []
      for (const song of data.songs || []) {
        items.push({
          id: song.id,
          name: song.name,
          artist: song.artist,
          album: song.album,
          artwork: song.artwork,
          url: song.url,
          type: 'song',
        })
      }
      for (const album of data.albums || []) {
        items.push({
          id: album.id,
          name: album.name,
          artist: album.artist,
          album: '',
          artwork: album.artwork,
          url: album.url,
          type: 'album',
        })
      }

      setResults(items)
    } catch (err) {
      showToast('Search failed', 'error')
    } finally {
      setLoading(false)
    }
  }, [query, showToast])

  const download = async (item: SearchResult) => {
    setDownloading(item.id)
    try {
      const url = item.url || `https://music.apple.com/${item.type}/${item.id}`
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (data.ok) {
        showToast(`Downloading: ${item.name}`)
      } else {
        showToast('Download failed', 'error')
      }
    } catch {
      showToast('Download failed', 'error')
    } finally {
      setDownloading(null)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') search()
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Search</h1>
        <p className="page-subtitle">Find songs and albums on Apple Music</p>
      </div>
      <div className="page-body">
        <div className="search-bar">
          <input
            className="search-input"
            type="text"
            placeholder="Search for songs, albums, artists..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className="btn btn-primary" onClick={search} disabled={loading}>
            {loading ? <span className="loading-spinner" /> : 'Search'}
          </button>
        </div>

        {results.length > 0 && (
          <div className="search-results">
            {results.map((item) => (
              <div key={item.id} className="result-card">
                <div className="result-cover">
                  {item.artwork ? (
                    <img src={item.artwork} alt={item.name} />
                  ) : (
                    <div className="album-cover-placeholder">🎵</div>
                  )}
                </div>
                <div className="result-info">
                  <div className="result-name">{item.name}</div>
                  <div className="result-detail">
                    {item.artist} {item.album && `· ${item.album}`} ·{' '}
                    <span style={{ textTransform: 'capitalize' }}>{item.type}</span>
                  </div>
                </div>
                <button
                  className="btn btn-primary btn-small"
                  onClick={() => download(item)}
                  disabled={downloading === item.id}
                >
                  {downloading === item.id ? (
                    <span className="loading-spinner" />
                  ) : (
                    '↓ Download'
                  )}
                </button>
              </div>
            ))}
          </div>
        )}

        {!loading && results.length === 0 && query && (
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <div className="empty-state-text">No results found</div>
            <div className="empty-state-hint">Try a different search term</div>
          </div>
        )}

        {!query && results.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">🎵</div>
            <div className="empty-state-text">Search Apple Music</div>
            <div className="empty-state-hint">
              Enter a song name, artist, or album to search
            </div>
          </div>
        )}
      </div>
    </>
  )
}
