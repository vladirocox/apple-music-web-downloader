import { useState, useEffect } from 'react'

interface Track {
  name: string
  filename: string
  path: string
  size: number
  modified: number
}

interface Album {
  name: string
  path: string
  track_count: number
  tracks: Track[]
  cover: string | null
}

interface Props {
  showToast: (msg: string, type?: 'success' | 'error') => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

export function LibraryPage({ showToast }: Props) {
  const [albums, setAlbums] = useState<Album[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedAlbum, setExpandedAlbum] = useState<string | null>(null)

  const fetchLibrary = async () => {
    try {
      const res = await fetch('/api/library')
      const data = await res.json()
      setAlbums(data.albums || [])
    } catch {
      showToast('Failed to load library', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLibrary()
  }, [])

  const playTrack = (track: Track) => {
    const audio = new Audio(`/api/library/track?path=${encodeURIComponent(track.path)}`)
    audio.play()
  }

  const totalTracks = albums.reduce((sum, a) => sum + a.track_count, 0)
  const totalSize = albums.reduce(
    (sum, a) => sum + a.tracks.reduce((s, t) => s + t.size, 0),
    0
  )

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Library</h1>
        <p className="page-subtitle">
          {albums.length} albums · {totalTracks} tracks · {formatSize(totalSize)}
        </p>
      </div>
      <div className="page-body">
        {loading ? (
          <div className="empty-state">
            <div className="loading-spinner" style={{ width: 32, height: 32, margin: '0 auto' }} />
          </div>
        ) : albums.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📚</div>
            <div className="empty-state-text">No music yet</div>
            <div className="empty-state-hint">
              Search and download tracks to build your library
            </div>
          </div>
        ) : (
          <div className="album-grid">
            {albums.map((album) => (
              <div key={album.name}>
                <div
                  className="album-card"
                  onClick={() =>
                    setExpandedAlbum(expandedAlbum === album.name ? null : album.name)
                  }
                >
                  <div className="album-cover">
                    {album.cover ? (
                      <img
                        src={`/api/library/cover?path=${encodeURIComponent(album.cover)}`}
                        alt={album.name}
                      />
                    ) : (
                      <div className="album-cover-placeholder">💿</div>
                    )}
                  </div>
                  <div className="album-info">
                    <div className="album-name">{album.name}</div>
                    <div className="album-meta">
                      {album.track_count} track{album.track_count !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>

                {expandedAlbum === album.name && (
                  <div className="card" style={{ marginTop: 8 }}>
                    <div className="track-list">
                      {album.tracks.map((track, i) => (
                        <div key={track.filename} className="track-item">
                          <div className="track-number">{i + 1}</div>
                          <div className="track-title">{track.name}</div>
                          <div className="track-size">{formatSize(track.size)}</div>
                          <div className="track-actions">
                            <button
                              className="icon-btn"
                              title="Play"
                              onClick={(e) => {
                                e.stopPropagation()
                                playTrack(track)
                              }}
                            >
                              ▶
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
