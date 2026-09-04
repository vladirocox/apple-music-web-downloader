import { useState, useEffect, useCallback } from 'react'
import { SearchPage } from './pages/Search'
import { LibraryPage } from './pages/Library'
import { SettingsPage } from './pages/Settings'

type Page = 'search' | 'library' | 'settings'

export default function App() {
  const [page, setPage] = useState<Page>('search')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('am_page') as Page | null
    if (saved && ['search', 'library', 'settings'].includes(saved)) {
      setPage(saved)
    }
  }, [])

  const navigate = (p: Page) => {
    setPage(p)
    localStorage.setItem('am_page', p)
  }

  const links: { id: Page; label: string; icon: string }[] = [
    { id: 'search', label: 'Search', icon: '🔍' },
    { id: 'library', label: 'Library', icon: '🎵' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ]

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">Apple Music</div>
        <nav className="sidebar-nav">
          {links.map((l) => (
            <div
              key={l.id}
              className={`sidebar-link ${page === l.id ? 'active' : ''}`}
              onClick={() => navigate(l.id)}
            >
              <span>{l.icon}</span>
              {l.label}
            </div>
          ))}
        </nav>
      </aside>

      <main className="main-content">
        {page === 'search' && <SearchPage showToast={showToast} />}
        {page === 'library' && <LibraryPage showToast={showToast} />}
        {page === 'settings' && <SettingsPage showToast={showToast} />}
      </main>

      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.msg}
        </div>
      )}
    </div>
  )
}
