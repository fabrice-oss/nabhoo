import { initAuth, setupGoogleAuth, signIn, signOut, isAuthenticated } from './auth.js';
import { initData } from './data.js';

const views = {
  dashboard:  () => import('./views/dashboard.js'),
  missions:   () => import('./views/missions.js'),
  organismes: () => import('./views/organismes.js'),
  entreprises: () => import('./views/entreprises.js'),
  factures:   () => import('./views/factures.js?v=20260911-recovery2'),
  bpf:        () => import('./views/bpf.js'),
  urssaf:     () => import('./views/urssaf.js'),
  parametres: () => import('./views/parametres.js?v=20260911-facturx3'),
};

const sectionTitles = {
  dashboard:  'Tableau de bord',
  missions:   'Missions',
  organismes: 'Organismes de formation',
  entreprises: 'Entreprises formées',
  factures:   'Factures',
  bpf:        'Bilan Pédagogique et Financier',
  urssaf:     'Déclarations URSSAF',
  parametres: 'Paramètres',
};

let currentSection = 'dashboard';
let navParams = {};

export async function navigate(section, params = {}) {
  if (!views[section]) return;
  currentSection = section;
  navParams = params;

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.section === section);
  });

  document.getElementById('section-title').textContent = sectionTitles[section] || section;

  const content = document.getElementById('content-area');
  content.innerHTML = '<div class="loading-spinner"></div>';

  try {
    const mod = await views[section]();
    content.innerHTML = mod.render(params);
    mod.init?.(params);
  } catch (e) {
    content.innerHTML = `<div class="error-state">Erreur de chargement : ${e.message}</div>`;
    console.error(e);
  }
}

// ── Save loader ───────────────────────────────────────────────────────────────
export function showSaveLoader(msg = 'Enregistrement…') {
  const el = document.getElementById('save-indicator');
  if (el) { el.querySelector('span').textContent = msg; el.classList.remove('hidden'); }
}
export function hideSaveLoader() {
  document.getElementById('save-indicator')?.classList.add('hidden');
}

export function showModal(title, body, extraClass = '') {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  const modal = document.getElementById('modal');
  modal.className = `modal glass-card ${extraClass}`;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

export function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

async function onAuthChange(authenticated) {
  if (authenticated) {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('loading-overlay').classList.remove('hidden');
    try {
      await initData();
      document.getElementById('loading-overlay').classList.add('hidden');
      navigate('dashboard');
    } catch (e) {
      document.getElementById('loading-overlay').classList.add('hidden');
      console.error('Init error:', e);
    }
  } else {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
  }
}

const THEME_CYCLE = ['auto', 'dark', 'light'];

const THEME_ICONS = {
  auto:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><path d="M12 2v20M2 12h20" stroke-dasharray="3 3"/><path d="M12 2a10 10 0 010 20V2z" fill="currentColor" stroke="none" opacity=".25"/></svg>`,
  dark:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>`,
  light: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
};

const THEME_LABELS = {
  auto:  'Thème automatique (système)',
  dark:  'Passer en mode clair',
  light: 'Passer en mode automatique',
};

let systemThemeWatcher = null;

function applyTheme(pref) {
  // pref = 'auto' | 'dark' | 'light'
  if (pref === 'auto') {
    const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.body.dataset.theme = sysDark ? 'dark' : 'light';
  } else {
    document.body.dataset.theme = pref;
  }
}

function initTheme() {
  const saved = localStorage.getItem('theme-pref') || 'auto';
  applyTheme(saved);
  updateThemeIcon(saved);

  // Écoute les changements système si le mode auto est actif
  systemThemeWatcher = window.matchMedia('(prefers-color-scheme: dark)');
  systemThemeWatcher.addEventListener('change', () => {
    if ((localStorage.getItem('theme-pref') || 'auto') === 'auto') {
      applyTheme('auto');
    }
  });
}

function updateThemeIcon(pref) {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.title = THEME_LABELS[pref] || 'Changer de thème';
  btn.innerHTML = THEME_ICONS[pref] || THEME_ICONS.auto;
  btn.dataset.themePref = pref;
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggle  = document.getElementById('sidebar-toggle');
  sidebar?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('active');
  toggle?.setAttribute('aria-expanded', 'false');
  toggle?.setAttribute('aria-label', 'Ouvrir le menu');
}

function initNavigation() {
  // Hamburger
  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const toggle  = document.getElementById('sidebar-toggle');
    const isOpen  = sidebar.classList.toggle('open');
    overlay.classList.toggle('active', isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', isOpen ? 'Fermer le menu' : 'Ouvrir le menu');
  });
  document.getElementById('sidebar-overlay')?.addEventListener('click', closeSidebar);

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      closeSidebar();
      navigate(item.dataset.section);
    });
  });

  document.getElementById('modal-overlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });
  document.getElementById('modal-close')?.addEventListener('click', closeModal);

  document.getElementById('signout-btn')?.addEventListener('click', () => {
    signOut();
  });

  document.getElementById('google-signin-btn')?.addEventListener('click', () => {
    signIn();
  });

  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const current = localStorage.getItem('theme-pref') || 'auto';
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length];
    localStorage.setItem('theme-pref', next);
    applyTheme(next);
    updateThemeIcon(next);
    // Feedback visuel
    const labels = { auto: '🖥️ Automatique', dark: '🌙 Sombre', light: '☀️ Clair' };
    const btn = document.getElementById('theme-toggle');
    const tip = document.createElement('div');
    tip.className = 'theme-toast';
    tip.textContent = labels[next];
    btn.parentElement.appendChild(tip);
    setTimeout(() => tip.remove(), 1800);
  });
}

async function main() {
  initTheme();
  initNavigation();
  initAuth(onAuthChange);
  await setupGoogleAuth();
}

main();
