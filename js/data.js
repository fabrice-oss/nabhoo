import { loadJSON, saveJSON, initDriveFolder } from './api/drive.js';
import { CONFIG } from './config.js';
import { toast } from './utils.js';

export const store = {
  settings: {
    ...CONFIG.ORGANISME,
    facturation: { ...CONFIG.FACTURATION },
    calendar_id: CONFIG.CALENDAR_ID,
    urssaf_frequence: 'mensuelle',
    urssaf_taux: 25.6,
    urssaf_taux_bic_services: 21.20,
    urssaf_taux_bic_ventes: 12.30,
    urssaf_taux_bnc: 25.60,
    urssaf_taux_formation_pro: 0.20,
  },
  organismes: [],
  entreprises: [],
  missions: [],
  factures: [],
  declarations_urssaf: [],
  _loaded: false,
};

export async function initData() {
  await initDriveFolder(CONFIG.DRIVE_FOLDER_NAME);

  const [settings, organismes, entreprises, missions, factures, declarations_urssaf] = await Promise.all([
    loadJSON('settings'),
    loadJSON('organismes'),
    loadJSON('entreprises'),
    loadJSON('missions'),
    loadJSON('factures'),
    loadJSON('declarations_urssaf'),
  ]);

  if (settings) {
    store.settings = {
      ...store.settings,
      ...settings,
      facturation: { ...store.settings.facturation, ...(settings.facturation || {}) },
    };
  }
  if (organismes) store.organismes = organismes;
  if (entreprises) store.entreprises = entreprises;
  if (missions) store.missions = missions;
  if (factures) store.factures = factures;
  if (declarations_urssaf) store.declarations_urssaf = declarations_urssaf;

  store._loaded = true;
}

function showSave(msg = 'Enregistrement…') {
  const el = document.getElementById('save-indicator');
  if (!el) return;
  el.querySelector('span').textContent = msg;
  el.classList.remove('hidden');
}
function hideSave() {
  document.getElementById('save-indicator')?.classList.add('hidden');
}

export async function saveSettings() {
  showSave(); try { await saveJSON('settings', store.settings); } finally { hideSave(); }
}
export async function saveOrganismes() {
  showSave(); try { await saveJSON('organismes', store.organismes); } finally { hideSave(); }
}
export async function saveEntreprises() {
  showSave(); try { await saveJSON('entreprises', store.entreprises); } finally { hideSave(); }
}
export async function saveMissions() {
  showSave(); try { await saveJSON('missions', store.missions); } finally { hideSave(); }
}
export async function saveFactures() {
  showSave(); try { await saveJSON('factures', store.factures); } finally { hideSave(); }
}
export async function saveDeclarationsUrssaf() {
  showSave(); try { await saveJSON('declarations_urssaf', store.declarations_urssaf); } finally { hideSave(); }
}

export async function autosave(key) {
  try {
    await saveJSON(key, store[key]);
  } catch (e) {
    toast('Erreur de sauvegarde Drive', 'error');
    console.error(e);
  }
}

export function getOrganisme(id) { return store.organismes.find(o => o.id === id); }
export function getEntreprise(id) { return store.entreprises.find(e => e.id === id); }
export function getMission(id) { return store.missions.find(m => m.id === id); }
export function getFacture(id) { return store.factures.find(f => f.id === id); }
export function getMissionFacture(missionId) { return store.factures.find(f => f.mission_id === missionId); }

export function getMissionEntreprises(mission) {
  if (mission.entreprises_ids?.length) {
    return mission.entreprises_ids.map(id => store.entreprises.find(e => e.id === id)).filter(Boolean);
  }
  // Backward compatibility with old single entreprise_id
  if (mission.entreprise_id) {
    const e = store.entreprises.find(e => e.id === mission.entreprise_id);
    return e ? [e] : [];
  }
  return [];
}

export function bpfStats(year) {
  const y = parseInt(year);
  // BPF : uniquement les missions de type "animation"
  // Une mission appartient à l'année de sa première session
  const missions = store.missions.filter(m => {
    if (m.type !== 'animation') return false;
    const sessions = m.sessions || [];
    if (sessions.length === 0) return false;
    return new Date(sessions[0].date).getFullYear() === y;
  });

  const missionIds = new Set(missions.map(m => m.id));
  const factures = store.factures.filter(f => missionIds.has(f.mission_id));

  const totalCA = factures.reduce((sum, f) => sum + (f.montant_ht || 0), 0);
  const heuresFormateur = missions.reduce((sum, m) => {
    return sum + (m.sessions || []).reduce((h, s) => h + (s.heures || 0), 0);
  }, 0);
  const totalStagiaires = missions.reduce((sum, m) => sum + (m.participants || 0), 0);
  const heuresStagiaires = missions.reduce((sum, m) => {
    const h = (m.sessions || []).reduce((hh, s) => hh + (s.heures || 0), 0);
    return sum + h * (m.participants || 0);
  }, 0);
  const distanciel = missions.some(m => m.distanciel);

  return { totalCA, heuresFormateur, totalStagiaires, heuresStagiaires, distanciel, missions, factures };
}

// CA encaissé (factures payées) sur une période ISO
export function caByPeriod(startIso, endIso) {
  return store.factures
    .filter(f => f.statut === 'payee' && f.date_paiement >= startIso && f.date_paiement <= endIso)
    .reduce((sum, f) => sum + (f.montant_ht || 0), 0);
}
