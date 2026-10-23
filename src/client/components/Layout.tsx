import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { SearchBar } from './SearchBar';
import { Button } from './ui';

const nav = [
  { section: 'Dashboard', items: [{ to: '/', label: 'Panoramica', icon: '◧', end: true }] },
  {
    section: 'Clienti',
    items: [
      { to: '/condomini', label: 'Condomìni', icon: '▤' },
      { to: '/persone', label: 'Persone', icon: '◍' },
    ],
  },
  {
    section: 'Attività',
    items: [
      { to: '/segnalazioni', label: 'Segnalazioni', icon: '◈' },
      { to: '/assemblee', label: 'Assemblee', icon: '▦' },
    ],
  },
  {
    section: 'Dati',
    items: [
      { to: '/rendiconti', label: 'Rendiconti', icon: '€' },
      { to: '/consumi', label: 'Consumi', icon: '◔' },
      { to: '/import', label: 'Importazione', icon: '⇪' },
    ],
  },
  { section: 'Studio', items: [{ to: '/impostazioni', label: 'Impostazioni', icon: '⚙' }] },
];

export function Layout() {
  const { user, logout, session } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const initials = user ? `${user.nome.charAt(0)}${user.cognome.charAt(0)}`.toUpperCase() : '?';

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'is-open' : ''}`} aria-label="Navigazione principale">
        <div className="sidebar__brand">
          <div className="sidebar__logo">FB</div>
          <div>
            <div className="sidebar__brand-name">Studio EffeBi</div>
            <div className="sidebar__brand-sub">CRM condominiale</div>
          </div>
        </div>
        <nav className="sidebar__nav">
          {nav.map((group) => (
            <div key={group.section}>
              <div className="sidebar__section">{group.section}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={'end' in item ? Boolean(item.end) : false}
                  className={({ isActive }) => `sidebar__link ${isActive ? 'is-active' : ''}`}
                >
                  <span className="sidebar__icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar__footer">
          Ambiente uso interno.
          <br />
          Nessun accesso per i condòmini.
        </div>
      </aside>

      <div className="main">
        {session?.authenticated && session.demoMode ? (
          <div className="demo-banner">
            <strong>Ambiente demo.</strong> I dati mostrati sono sintetici e marcati [DEMO]. Non usare per il lavoro reale.
          </div>
        ) : null}
        <header className="topbar">
          <button
            className="icon-button topbar__menu"
            aria-label={menuOpen ? 'Chiudi menu' : 'Apri menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            ☰
          </button>
          <SearchBar />
          <div className="topbar__spacer" />
          <div className="topbar__user">
            <div className="avatar" aria-hidden="true">
              {initials}
            </div>
            <div>
              <div className="topbar__user-name" style={{ fontWeight: 600, lineHeight: 1.2 }}>
                {user ? `${user.nome} ${user.cognome}` : ''}
              </div>
              <div className="muted small">{user?.email}</div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void logout()}>
              Esci
            </Button>
          </div>
        </header>
        <main className="content" id="contenuto">
          <Outlet />
        </main>
        <footer style={{ padding: '0 1.5rem 1.5rem', fontSize: '0.75rem', color: 'var(--c-text-muted)' }}>
          CRM interno EffeBi · <Link to="/impostazioni">Sicurezza e impostazioni</Link>
        </footer>
      </div>
      {menuOpen ? (
        <button
          aria-label="Chiudi menu"
          onClick={() => setMenuOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,20,32,0.35)', border: 'none', zIndex: 35 }}
        />
      ) : null}
    </div>
  );
}
