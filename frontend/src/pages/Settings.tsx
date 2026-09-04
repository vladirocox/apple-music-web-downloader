import { useState, useEffect, useRef } from 'react'

interface Config {
  alac_save_folder: string
  media_user_token: string
  template_decrypt: boolean
  key_server: string
  decrypt_m3u8_port: string
  get_m3u8_port: string
  get_account_port: string
  get_m3u8_from_device: boolean
  alac_max: number
  cover_format: string
  cover_size: number
  storefront: string
  embed_lrc: boolean
  save_lrc: boolean
  embed_cover: boolean
  save_cover: boolean
  album_folder_format: string
  song_file_format: string
  proxy: string
  auto_delete: boolean
}

interface Status {
  wrapper_running: boolean
  wrapper_ready: boolean
  wrapper_needs_2fa: boolean
  cli_exists: boolean
  download_dir: string
  config_exists: boolean
}

interface Props {
  showToast: (msg: string, type?: 'success' | 'error') => void
}

export function SettingsPage({ showToast }: Props) {
  const [config, setConfig] = useState<Config | null>(null)
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [wrapperUser, setWrapperUser] = useState('')
  const [wrapperPass, setWrapperPass] = useState('')
  const [saving, setSaving] = useState(false)
  const [showTokenHelp, setShowTokenHelp] = useState(false)
  const [starting, setStarting] = useState(false)
  const [twoFACode, setTwoFACode] = useState('')
  const [show2FA, setShow2FA] = useState(false)
  const [wrapperLogs, setWrapperLogs] = useState('')
  const [showLogs, setShowLogs] = useState(false)
  const [showFormatHelp, setShowFormatHelp] = useState(false)
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status')
      const st = await res.json()
      setStatus(st)
      if (st.wrapper_running) {
        setStarting(false)
      }
    } catch { /* ignore */ }
  }

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/auth/wrapper/logs')
      const data = await res.json()
      setWrapperLogs(data.logs || '')
    } catch { /* ignore */ }
  }

  useEffect(() => {
    Promise.all([
      fetch('/api/config').then(r => r.json()),
      fetch('/api/status').then(r => r.json()),
    ]).then(([cfg, st]) => {
      setConfig(cfg)
      setStatus(st)
    }).catch(() => {}).finally(() => setLoading(false))

    statusPollRef.current = setInterval(fetchStatus, 3000)
    return () => { if (statusPollRef.current) clearInterval(statusPollRef.current) }
  }, [])

  const saveConfig = async () => {
    if (!config) return
    setSaving(true)
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (res.ok) showToast('Settings saved')
      else showToast('Failed to save settings', 'error')
    } catch {
      showToast('Failed to save settings', 'error')
    } finally {
      setSaving(false)
    }
  }

  const startWrapper = async () => {
    if (!wrapperUser || !wrapperPass) {
      showToast('Enter Apple ID credentials', 'error')
      return
    }
    setStarting(true)
    try {
      const res = await fetch('/api/auth/wrapper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: wrapperUser, password: wrapperPass }),
      })
      const data = await res.json()
      showToast(data.message || 'Wrapper starting...')
      fetchStatus()
    } catch {
      showToast('Failed to start Wrapper', 'error')
      setStarting(false)
    }
  }

  const stopWrapper = async () => {
    try {
      await fetch('/api/auth/wrapper/stop', { method: 'POST' })
      showToast('Wrapper stopped')
      fetchStatus()
    } catch {
      showToast('Failed to stop Wrapper', 'error')
    }
  }

  const submit2FA = async () => {
    if (!twoFACode.trim()) return
    try {
      const res = await fetch('/api/auth/wrapper/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: twoFACode.trim() }),
      })
      const data = await res.json()
      if (data.ok) {
        showToast('2FA code submitted')
        setTwoFACode('')
        setShow2FA(false)
        fetchStatus()
      } else {
        showToast('Failed to submit 2FA', 'error')
      }
    } catch {
      showToast('Failed to submit 2FA', 'error')
    }
  }

  const saveToken = async () => {
    if (!config) return
    try {
      const res = await fetch('/api/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_user_token: config.media_user_token }),
      })
      if (res.ok) showToast('Token saved')
      else showToast('Failed to save token', 'error')
    } catch {
      showToast('Failed to save token', 'error')
    }
  }

  if (loading) {
    return (
      <>
        <div className="page-header">
          <h1 className="page-title">Settings</h1>
        </div>
        <div className="page-body">
          <div className="empty-state">
            <div className="loading-spinner" style={{ width: 32, height: 32, margin: '0 auto' }} />
          </div>
        </div>
      </>
    )
  }

  if (!config || !status) {
    return (
      <>
        <div className="page-header">
          <h1 className="page-title">Settings</h1>
        </div>
        <div className="page-body">
          <div className="empty-state">
            <div className="empty-state-text">Failed to load settings</div>
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => window.location.reload()}>Retry</button>
          </div>
        </div>
      </>
    )
  }

  const wrapperOk = status.wrapper_ready
  const needs2fa = status.wrapper_needs_2fa
  const wrapperAlive = status.wrapper_running && !status.wrapper_ready

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Configure your downloader</p>
      </div>
      <div className="page-body">
        {/* Status */}
        <div className="card">
          <div className="card-title">System Status</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              Wrapper:{' '}
              {wrapperOk ? (
                <span className="status-badge running">Running</span>
              ) : needs2fa ? (
                <span className="status-badge" style={{ background: 'rgba(255,204,0,0.15)', color: '#ffcc00' }}>2FA Required</span>
              ) : wrapperAlive ? (
                <span className="status-badge" style={{ background: 'rgba(255,149,0,0.15)', color: '#ff9500' }}>Starting...</span>
              ) : (
                <span className="status-badge stopped">Stopped</span>
              )}
            </div>
            <div>
              CLI: {status.cli_exists ? '✅ Built' : '❌ Not found'}
            </div>
            <button className="btn btn-secondary btn-small" onClick={() => { fetchStatus(); fetchLogs() }}>
              Refresh
            </button>
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: 'var(--am-text-secondary)' }}>
            Downloads: {status.download_dir}
          </div>
        </div>

        {/* Wrapper Control */}
        <div className="card">
          <div className="card-title">Wrapper (Decryption Engine)</div>
          <p style={{ fontSize: 13, color: 'var(--am-text-secondary)', marginBottom: 12 }}>
            The Wrapper must be running for downloads. It runs natively on this machine.
          </p>

          {needs2fa && (
            <div style={{
              background: 'rgba(255,204,0,0.1)', border: '1px solid rgba(255,204,0,0.3)',
              borderRadius: 8, padding: 16, marginBottom: 16,
            }}>
              <div style={{ fontWeight: 600, marginBottom: 8, color: '#ffcc00' }}>
                ⚠️ 2FA Code Required
              </div>
              <p style={{ fontSize: 13, color: 'var(--am-text-secondary)', marginBottom: 12 }}>
                Check your Apple device for a verification code and enter it below.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="form-input"
                  placeholder="Enter 6-digit code"
                  value={twoFACode}
                  onChange={e => setTwoFACode(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submit2FA()}
                  autoFocus
                  maxLength={6}
                  style={{ fontSize: 18, letterSpacing: 4, textAlign: 'center', maxWidth: 200 }}
                />
                <button className="btn btn-primary" onClick={submit2FA} disabled={!twoFACode.trim()}>
                  Submit
                </button>
              </div>
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Apple ID Email</label>
              <input
                className="form-input"
                type="email"
                placeholder="you@example.com"
                value={wrapperUser}
                onChange={e => setWrapperUser(e.target.value)}
                disabled={wrapperOk || wrapperAlive}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                className="form-input"
                type="password"
                placeholder="••••••••"
                value={wrapperPass}
                onChange={e => setWrapperPass(e.target.value)}
                disabled={wrapperOk || wrapperAlive}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              onClick={startWrapper}
              disabled={wrapperOk || starting || wrapperAlive}
            >
              {starting ? 'Starting...' : wrapperOk ? 'Running' : 'Start Wrapper'}
            </button>
            <button
              className="btn btn-danger"
              onClick={stopWrapper}
              disabled={!wrapperOk && !wrapperAlive && !needs2fa}
            >
              Stop
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => { setShowLogs(!showLogs); fetchLogs() }}
            >
              {showLogs ? 'Hide Logs' : 'Logs'}
            </button>
          </div>

          {showLogs && (
            <pre style={{
              marginTop: 12, background: 'var(--am-bg)', borderRadius: 8,
              padding: 12, fontSize: 11, maxHeight: 200, overflow: 'auto',
              color: 'var(--am-text-secondary)', whiteSpace: 'pre-wrap',
              border: '1px solid var(--am-border)',
            }}>
              {wrapperLogs || 'No logs yet...'}
            </pre>
          )}
        </div>

        {/* Media User Token */}
        <div className="card">
          <div className="card-title">
            Media User Token
            <button
              className="btn btn-secondary btn-small"
              style={{ marginLeft: 8 }}
              onClick={() => setShowTokenHelp(!showTokenHelp)}
            >
              {showTokenHelp ? 'Hide' : 'What is this?'}
            </button>
          </div>
          <p style={{ fontSize: 13, color: 'var(--am-text-secondary)', marginBottom: 12 }}>
            Usually not needed — the Wrapper extracts this automatically when you log in with your Apple ID.
            Only paste a token here if the Wrapper can't get one on its own, or you need a token from a different account/region.
          </p>
          {showTokenHelp && (
            <div style={{
              background: 'var(--am-bg-tertiary)', borderRadius: 8,
              padding: 12, marginBottom: 12, fontSize: 13, lineHeight: 1.6,
            }}>
              <p><strong>How to obtain your Media User Token (if needed):</strong></p>
              <ol style={{ paddingLeft: 20, marginTop: 8 }}>
                <li>Open <a href="https://music.apple.com" target="_blank" style={{ color: 'var(--am-red)' }}>music.apple.com</a></li>
                <li>Open Developer Tools (F12) → Network tab</li>
                <li>Play any song</li>
                <li>Look for requests to <code>amp-api.music.apple.com</code></li>
                <li>Find the <code>Authorization</code> header — the value after "Bearer " is your token</li>
                <li>Or check the Wrapper logs — it displays the Music-Token when started</li>
              </ol>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Media User Token (optional)</label>
            <input
              className="form-input"
              type="password"
              placeholder="Leave empty if Wrapper is working"
              value={config.media_user_token}
              onChange={e => setConfig({ ...config, media_user_token: e.target.value })}
            />
          </div>
          <button className="btn btn-secondary btn-small" onClick={saveToken}>Save Token</button>
        </div>

        {/* Download Settings */}
        <div className="card">
          <div className="card-title">
            Download Settings
            <button
              className="btn btn-secondary btn-small"
              style={{ marginLeft: 8 }}
              onClick={() => setShowFormatHelp(!showFormatHelp)}
            >
              {showFormatHelp ? 'Hide' : 'Format Guide'}
            </button>
          </div>

          {showFormatHelp && (
            <div style={{
              background: 'var(--am-bg-tertiary)', borderRadius: 8,
              padding: 14, marginBottom: 16, fontSize: 13, lineHeight: 1.7,
            }}>
              <p style={{ fontWeight: 600, marginBottom: 8 }}>Audio Format Guide</p>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--am-border)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--am-text-secondary)' }}>Format</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--am-text-secondary)' }}>Quality</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--am-text-secondary)' }}>Requirements</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--am-border)' }}>
                    <td style={{ padding: '6px 8px' }}>Lossless (ALAC)</td>
                    <td style={{ padding: '6px 8px', color: 'var(--am-text-secondary)' }}>Up to 192kHz/24-bit</td>
                    <td style={{ padding: '6px 8px', color: 'var(--am-text-secondary)' }}>Apple Music subscription</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--am-border)' }}>
                    <td style={{ padding: '6px 8px' }}>AAC</td>
                    <td style={{ padding: '6px 8px', color: 'var(--am-text-secondary)' }}>Up to 320kbps</td>
                    <td style={{ padding: '6px 8px', color: 'var(--am-text-secondary)' }}>Apple Music subscription</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 8px' }}>Dolby Atmos</td>
                    <td style={{ padding: '6px 8px', color: 'var(--am-text-secondary)' }}>Multi-channel spatial</td>
                    <td style={{ padding: '6px 8px', color: 'var(--am-text-secondary)' }}>Apple Music + Atmos-capable track</td>
                  </tr>
                </tbody>
              </table>
              <p style={{ marginTop: 10, fontSize: 12, color: 'var(--am-text-tertiary)' }}>
                💡 Default is Lossless (ALAC) — best quality. Choose format in the Search page before downloading.
              </p>
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Download Folder</label>
              <input
                className="form-input"
                value={config.alac_save_folder}
                onChange={e => setConfig({ ...config, alac_save_folder: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Storefront (Country)</label>
              <select
                className="form-input"
                value={config.storefront}
                onChange={e => setConfig({ ...config, storefront: e.target.value })}
              >
                <option value="us">US</option>
                <option value="gb">UK</option>
                <option value="de">Germany</option>
                <option value="fr">France</option>
                <option value="jp">Japan</option>
                <option value="au">Australia</option>
                <option value="br">Brazil</option>
                <option value="mx">Mexico</option>
                <option value="kr">South Korea</option>
                <option value="it">Italy</option>
                <option value="es">Spain</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Max ALAC Sample Rate (Hz)</label>
            <select
              className="form-input"
              value={config.alac_max}
              onChange={e => setConfig({ ...config, alac_max: Number(e.target.value) })}
            >
              <option value={44100}>44,100 Hz (CD Quality)</option>
              <option value={48000}>48,000 Hz</option>
              <option value={88200}>88,200 Hz</option>
              <option value={96000}>96,000 Hz</option>
              <option value={176400}>176,400 Hz</option>
              <option value={192000}>192,000 Hz (Hi-Res)</option>
            </select>
            <div style={{ fontSize: 11, color: 'var(--am-text-tertiary)', marginTop: 4 }}>
              Higher = better quality but larger files. 192,000 Hz is the maximum.
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Album Folder Format</label>
            <input
              className="form-input"
              value={config.album_folder_format}
              onChange={e => setConfig({ ...config, album_folder_format: e.target.value })}
            />
            <div style={{ fontSize: 11, color: 'var(--am-text-tertiary)', marginTop: 4 }}>
              Variables: {'{AlbumName}'} {'{ArtistName}'} {'{AlbumId}'}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Song File Format</label>
            <input
              className="form-input"
              value={config.song_file_format}
              onChange={e => setConfig({ ...config, song_file_format: e.target.value })}
            />
            <div style={{ fontSize: 11, color: 'var(--am-text-tertiary)', marginTop: 4 }}>
              Variables: {'{SongNumer}'} {'{SongName}'} {'{ArtistName}'} {'{Quality}'}
            </div>
          </div>
        </div>

        {/* Tagging */}
        <div className="card">
          <div className="card-title">Tags & Metadata</div>
          <div className="toggle">
            <span className="toggle-label">Embed lyrics in files</span>
            <div className={`toggle-switch ${config.embed_lrc ? 'active' : ''}`}
              onClick={() => setConfig({ ...config, embed_lrc: !config.embed_lrc })} />
          </div>
          <div className="toggle">
            <span className="toggle-label">Save .lrc files</span>
            <div className={`toggle-switch ${config.save_lrc ? 'active' : ''}`}
              onClick={() => setConfig({ ...config, save_lrc: !config.save_lrc })} />
          </div>
          <div className="toggle">
            <span className="toggle-label">Embed cover art</span>
            <div className={`toggle-switch ${config.embed_cover ? 'active' : ''}`}
              onClick={() => setConfig({ ...config, embed_cover: !config.embed_cover })} />
          </div>
          <div className="toggle">
            <span className="toggle-label">Save cover art files</span>
            <div className={`toggle-switch ${config.save_cover ? 'active' : ''}`}
              onClick={() => setConfig({ ...config, save_cover: !config.save_cover })} />
          </div>
        </div>

        {/* Advanced */}
        <div className="card">
          <div className="card-title">Advanced</div>
          <div className="toggle">
            <span className="toggle-label">Template decryption (faster)</span>
            <div className={`toggle-switch ${config.template_decrypt ? 'active' : ''}`}
              onClick={() => setConfig({ ...config, template_decrypt: !config.template_decrypt })} />
          </div>
          <div className="toggle">
            <span className="toggle-label">Get M3U8 from device</span>
            <div className={`toggle-switch ${config.get_m3u8_from_device ? 'active' : ''}`}
              onClick={() => setConfig({ ...config, get_m3u8_from_device: !config.get_m3u8_from_device })} />
          </div>
          <div className="form-group">
            <label className="form-label">Proxy (optional)</label>
            <input
              className="form-input"
              placeholder="socks5://127.0.0.1:1080"
              value={config.proxy}
              onChange={e => setConfig({ ...config, proxy: e.target.value })}
            />
            <div style={{ fontSize: 11, color: 'var(--am-text-tertiary)', marginTop: 4 }}>
              SOCKS5 or HTTP proxy. Leave empty for direct connection.
            </div>
          </div>
        </div>

        <button className="btn btn-primary" onClick={saveConfig} disabled={saving} style={{ marginTop: 8 }}>
          {saving ? 'Saving...' : 'Save All Settings'}
        </button>
      </div>
    </>
  )
}
