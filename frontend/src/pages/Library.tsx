import { useState, useEffect, useRef, useCallback } from 'react'

interface Track {
  name: string
  filename: string
  path: string
  size: number
  modified: number
}

interface Album {
  name: string
  artist: string
  path: string
  track_count: number
  tracks: Track[]
  cover: string | null
}

interface Download {
  url: string
  status: string
  output: string
  pid?: number
}

interface Props {
  showToast: (msg: string, type?: 'success' | 'error') => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function LibraryPage({ showToast }: Props) {
  const [albums, setAlbums] = useState<Album[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedAlbum, setExpandedAlbum] = useState<string | null>(null)
  const [activeTrack, setActiveTrack] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [activeDownloads, setActiveDownloads] = useState<Record<string, Download>>({})
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

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

  const fetchDownloads = async () => {
    try {
      const res = await fetch('/api/downloads')
      const data = await res.json()
      setActiveDownloads(data.downloads || {})
    } catch { /* ignore */ }
  }

  useEffect(() => {
    fetchLibrary()
    fetchDownloads()
    const interval = setInterval(fetchDownloads, 2000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime = () => setCurrentTime(audio.currentTime)
    const onDur = () => setDuration(audio.duration || 0)
    const onEnd = () => setPlaying(false)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onDur)
    audio.addEventListener('ended', onEnd)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onDur)
      audio.removeEventListener('ended', onEnd)
    }
  }, [activeTrack])

  const playTrack = useCallback((track: Track) => {
    if (activeTrack === track.path && audioRef.current) {
      if (playing) {
        audioRef.current.pause()
        setPlaying(false)
      } else {
        audioRef.current.play()
        setPlaying(true)
      }
      return
    }
    if (audioRef.current) {
      audioRef.current.pause()
    }
    const audio = new Audio(`/api/stream?path=${encodeURIComponent(track.path)}`)
    audio.volume = volume
    audioRef.current = audio
    setActiveTrack(track.path)
    audio.play().then(() => setPlaying(true)).catch(() => {})
  }, [activeTrack, playing, volume])

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !audioRef.current || !duration) return
    const rect = progressRef.current.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    audioRef.current.currentTime = pct * duration
  }

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value)
    setVolume(v)
    if (audioRef.current) audioRef.current.volume = v
  }

  const downloadFile = (track: Track) => {
    const a = document.createElement('a')
    a.href = `/api/download-file?path=${encodeURIComponent(track.path)}`
    a.download = track.filename
    a.click()
  }

  const deleteFile = async (track: Track) => {
    if (!confirm(`Delete "${track.filename}"?`)) return
    setDeleting(track.path)
    try {
      const res = await fetch('/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: track.path }),
      })
      if (res.ok) {
        showToast('Deleted')
        fetchLibrary()
      } else {
        showToast('Delete failed', 'error')
      }
    } catch {
      showToast('Delete failed', 'error')
    } finally {
      setDeleting(null)
    }
  }

  const activeDlEntries = Object.entries(activeDownloads).filter(
    ([, dl]) => dl.status !== 'completed' && dl.status !== 'failed'
  )

  const totalTracks = albums.reduce((sum, a) => sum + a.track_count, 0)
  const totalSize = albums.reduce(
    (sum, a) => sum + a.tracks.reduce((s, t) => s + t.size, 0),
    0
  )

  const currentTrackInfo = (() => {
    if (!activeTrack) return null
    for (const album of albums) {
      for (const track of album.tracks) {
        if (track.path === activeTrack) {
          return { track, album }
        }
      }
    }
    return null
  })()

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Library</h1>
        <p className="page-subtitle">
          {albums.length} albums · {totalTracks} tracks · {formatSize(totalSize)}
        </p>
      </div>
      <div className="page-body">
        {/* Now Playing Bar */}
        {activeTrack && currentTrackInfo && (
          <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                className="icon-btn"
                onClick={() => {
                  if (audioRef.current) {
                    if (playing) { audioRef.current.pause(); setPlaying(false) }
                    else { audioRef.current.play(); setPlaying(true) }
                  }
                }}
                style={{ fontSize: 20, width: 36, height: 36 }}
              >
                {playing ? '⏸' : '▶'}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {currentTrackInfo.track.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--am-text-secondary)' }}>
                  {currentTrackInfo.album.artist} · {currentTrackInfo.album.name}
                </div>
                <div
                  ref={progressRef}
                  onClick={seek}
                  style={{
                    height: 4, background: 'var(--am-border)', borderRadius: 2,
                    cursor: 'pointer', marginTop: 6, position: 'relative',
                  }}
                >
                  <div style={{
                    height: '100%', borderRadius: 2, background: 'var(--am-red)',
                    width: duration ? `${(currentTime / duration) * 100}%` : '0%',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--am-text-tertiary)', marginTop: 2 }}>
                  <span>{formatTime(currentTime)}</span>
                  <span>{duration ? formatTime(duration) : '0:00'}</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--am-text-tertiary)' }}>🔊</span>
                <input
                  type="range" min="0" max="1" step="0.05"
                  value={volume} onChange={handleVolume}
                  style={{ width: 60, accentColor: 'var(--am-red)' }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Active Downloads */}
        {activeDlEntries.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">Active Downloads</div>
            {activeDlEntries.map(([id, dl]) => (
              <div key={id} style={{ padding: '8px 0', borderBottom: '1px solid var(--am-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {dl.url.split('/').pop() || dl.url}
                  </span>
                  <span className={`status-badge ${dl.status}`} style={{ marginLeft: 8 }}>{dl.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <div className="empty-state">
            <div className="loading-spinner" style={{ width: 32, height: 32, margin: '0 auto' }} />
          </div>
        ) : albums.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🎵</div>
            <div className="empty-state-text">No music yet</div>
            <div className="empty-state-hint">
              Search and download tracks to build your library
            </div>
          </div>
        ) : (
          <div className="album-grid">
            {albums.map((album) => (
              <div key={`${album.artist}/${album.name}`}>
                <div
                  className="album-card"
                  onClick={() =>
                    setExpandedAlbum(expandedAlbum === `${album.artist}/${album.name}` ? null : `${album.artist}/${album.name}`)
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
                      {album.artist} · {album.track_count} track{album.track_count !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>

                {expandedAlbum === `${album.artist}/${album.name}` && (
                  <div className="card" style={{ marginTop: 8 }}>
                    <div className="track-list">
                      {album.tracks.map((track, i) => (
                        <div
                          key={track.filename}
                          className={`track-item ${activeTrack === track.path ? 'active' : ''}`}
                        >
                          <div className="track-number" onClick={() => playTrack(track)} style={{ cursor: 'pointer' }}>
                            {activeTrack === track.path && playing ? '⏸' : i + 1}
                          </div>
                          <div className="track-title" onClick={() => playTrack(track)} style={{ cursor: 'pointer', flex: 1 }}>
                            {track.name}
                          </div>
                          <div className="track-size">{formatSize(track.size)}</div>
                          <div className="track-actions">
                            <button
                              className="icon-btn"
                              title="Play"
                              onClick={(e) => { e.stopPropagation(); playTrack(track) }}
                            >
                              {activeTrack === track.path && playing ? '⏸' : '▶'}
                            </button>
                            <button
                              className="icon-btn"
                              title="Download file"
                              onClick={(e) => { e.stopPropagation(); downloadFile(track) }}
                            >
                              ⬇
                            </button>
                            <button
                              className="icon-btn"
                              title="Delete from disk"
                              onClick={(e) => { e.stopPropagation(); deleteFile(track) }}
                              disabled={deleting === track.path}
                              style={{ color: deleting === track.path ? 'var(--am-text-tertiary)' : '#ff3b30' }}
                            >
                              {deleting === track.path ? '...' : '🗑'}
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
