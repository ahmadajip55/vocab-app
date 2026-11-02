import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useInstallPrompt } from '../hooks/useInstallPrompt.js';
import { useTheme } from '../hooks/useTheme.js';
import { AppLoader } from './AppLoader.jsx';
import { usePrograms } from '../hooks/usePrograms.js';

const NAV_ITEMS = [
  { to: '/', label: 'Home', end: true },
  { to: '/words', label: 'Words' },
  { to: '/import', label: 'Import' },
  { to: '/flashcards', label: 'Flashcards' },
  { to: '/quiz', label: 'Quiz' },
  { to: '/backup', label: 'Backup' },
];

export function AppShell() {
  const { persistFailed } = usePrograms();
  // Below the md breakpoint the menu sits behind a hamburger button; wider screens always show it.
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const { canInstall, install } = useInstallPrompt();
  const { theme, toggle: toggleTheme } = useTheme();
  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  useEffect(() => {
    setMenuOpen(false); // a new page closes the menu
  }, [pathname]);

  return (
    <>
      <a className="skip-link visually-hidden-focusable btn btn-dark" href="#main">
        Skip to content
      </a>
      <header className="navbar navbar-expand-md bg-body-tertiary border-bottom app-navbar">
        <div className="container-fluid app-container">
          <NavLink to="/" className="navbar-brand d-inline-flex align-items-center gap-2 font-display fw-bold" aria-label="Vocab Cards, go home">
            <img className="brand-logo" src="/favicon.svg" alt="" width="32" height="32" />
            Vocab Cards
          </NavLink>
          {/* Before the menu, so on phones it stays in the top row next to the hamburger; last on wider screens. */}
          <div className="d-flex align-items-center gap-2 ms-auto ms-md-3 order-md-2">
            <button
              type="button"
              className="btn btn-outline-secondary theme-toggle"
              onClick={toggleTheme}
              aria-label={`Switch to ${nextTheme} mode`}
              title={`Switch to ${nextTheme} mode`}
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
            <button
              type="button"
              className="navbar-toggler"
              aria-controls="main-menu"
              aria-expanded={menuOpen}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMenuOpen((open) => !open)}
              onKeyDown={(event) => event.key === 'Escape' && setMenuOpen(false)}
            >
              <span className="navbar-toggler-icon" />
            </button>
          </div>
          <nav id="main-menu" className={`collapse navbar-collapse justify-content-md-end${menuOpen ? ' show' : ''}`} aria-label="Main menu">
            <ul className="navbar-nav nav-pills gap-1 pt-2 pb-1 py-md-0">
              {NAV_ITEMS.map((item) => (
                <li key={item.to} className="nav-item">
                  <NavLink to={item.to} end={item.end} className="nav-link fw-semibold px-3" onClick={() => setMenuOpen(false)}>
                    {item.label}
                  </NavLink>
                </li>
              ))}
              {canInstall ? (
                <li className="nav-item ms-md-2">
                  <button type="button" className="btn btn-primary btn-sm my-1 px-3" onClick={install}>
                    Install app
                  </button>
                </li>
              ) : null}
            </ul>
          </nav>
        </div>
      </header>
      <main id="main" className="container-fluid app-container vstack gap-4 py-4 pb-5">
        {persistFailed ? (
          <p className="alert alert-warning mb-0" role="status">
            Browser storage is unavailable, so your programs and words will disappear when the tab closes. Export a backup on the Backup
            page to keep a copy.
          </p>
        ) : null}
        {/* Pages load on demand; the header stays while one does. */}
        <Suspense fallback={<AppLoader />}>
          <Outlet />
        </Suspense>
      </main>
    </>
  );
}

const ICON_PROPS = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

function MoonIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
