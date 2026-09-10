import { store, saveSettings } from '../data.js';
import { toast, escHtml } from '../utils.js';
import { listCalendars } from '../api/calendar.js';

export function render() {
  const s = store.settings;
  const f = s.facturation || {};
  return `
    <div class="view-header"><h2>Paramètres</h2></div>

    <form id="form-settings">
      <div class="settings-sections">

        <div class="glass-card settings-section">
          <h3>🖼️ Logo de votre organisme</h3>
          <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:16px">
            Ce logo apparaîtra sur toutes vos factures PDF. Format recommandé : PNG ou JPG, fond transparent ou blanc, carré ou rectangulaire.
          </p>
          <div class="logo-upload-area">
            <div class="logo-preview-wrap">
              ${s.logo_base64
                ? `<img src="${s.logo_base64}" id="logo-preview" class="logo-preview-img" alt="Logo">`
                : `<div id="logo-preview" class="logo-preview-empty"><span>Aucun logo</span></div>`
              }
            </div>
            <div class="logo-upload-controls">
              <label for="logo-file-input" class="btn-secondary" style="cursor:pointer;display:inline-block">
                📁 Choisir un fichier
              </label>
              <input type="file" id="logo-file-input" accept="image/png,image/jpeg,image/webp,image/svg+xml" style="display:none">
              ${s.logo_base64
                ? `<button type="button" class="btn-secondary btn-sm" id="btn-remove-logo" style="margin-left:10px">🗑 Supprimer le logo</button>`
                : ''
              }
              <p style="font-size:0.75rem;color:var(--text-muted);margin-top:8px">Taille max : 2 Mo — PNG, JPG ou WEBP</p>
            </div>
          </div>
        </div>

        <div class="glass-card settings-section">
          <h3>🏢 Identité de l'organisme</h3>
          <div class="form-grid">
            <div class="form-group"><label>Nom commercial</label><input type="text" name="nom_commercial" value="${escHtml(s.nom_commercial || '')}"></div>
            <div class="form-group"><label>Dirigeant</label><input type="text" name="dirigeant" value="${escHtml(s.dirigeant || '')}"></div>
            <div class="form-group"><label>Adresse</label><input type="text" name="adresse" value="${escHtml(s.adresse || '')}"></div>
            <div class="form-group form-group-half"><label>Code postal</label><input type="text" name="cp" value="${escHtml(s.cp || '')}"></div>
            <div class="form-group form-group-half"><label>Ville</label><input type="text" name="ville" value="${escHtml(s.ville || '')}"></div>
            <div class="form-group"><label>Téléphone</label><input type="tel" name="tel" value="${escHtml(s.tel || '')}"></div>
            <div class="form-group"><label>Email</label><input type="email" name="email" value="${escHtml(s.email || '')}"></div>
            <div class="form-group"><label>SIRET</label><input type="text" name="siret" value="${escHtml(s.siret || '')}"></div>
            <div class="form-group form-group-half"><label>Code NAF</label><input type="text" name="naf" value="${escHtml(s.naf || '')}"></div>
            <div class="form-group form-group-half"><label>Forme juridique</label><input type="text" name="forme_juridique" value="${escHtml(s.forme_juridique || '')}"></div>
            <div class="form-group"><label>N° Déclaration d'activité (NDA)</label><input type="text" name="nda" value="${escHtml(s.nda || '')}"></div>
          </div>
        </div>

        <div class="glass-card settings-section">
          <h3>🏦 Coordonnées bancaires</h3>
          <div class="form-grid">
            <div class="form-group"><label>Banque</label><input type="text" name="banque" value="${escHtml(s.banque || '')}"></div>
            <div class="form-group"><label>IBAN</label><input type="text" name="iban" value="${escHtml(s.iban || '')}" placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX"></div>
            <div class="form-group form-group-half"><label>BIC</label><input type="text" name="bic" value="${escHtml(s.bic || '')}"></div>
          </div>
        </div>

        <div class="glass-card settings-section">
          <h3>📄 Facturation</h3>
          <div class="form-grid">
            <div class="form-group form-group-half"><label>Préfixe numéro de facture</label><input type="text" name="facturation_prefixe" value="${escHtml(f.prefixe || 'AF')}"></div>
            <div class="form-group form-group-half"><label>Délai de paiement (jours)</label><input type="number" name="facturation_delai" value="${f.delai_paiement_jours || 45}" min="1"></div>
            <div class="form-group"><label>Taux pénalités de retard</label><input type="text" name="facturation_penalites" value="${escHtml(f.penalites_taux || 'taux directeur de la BCE majoré de 10 points')}"></div>
            <div class="form-group form-group-half"><label>Indemnité forfaitaire (€)</label><input type="number" name="facturation_indemnite" value="${f.indemnite_recouvrement || 40}" min="0"></div>
            <div class="form-group"><label>Mention TVA</label><input type="text" name="facturation_tva" value="${escHtml(f.mention_tva || 'TVA non applicable, art. 293 B du CGI')}"></div>
          </div>
        </div>

        <div class="glass-card settings-section">
          <h3>⚡ Facturation électronique (Pennylane)</h3>
          <div class="form-grid">
            <div class="form-group form-group-full">
              <label>Token API Pennylane <span style="font-weight:400;color:var(--text-muted)">(Paramètres → Connectivité → Développeurs)</span></label>
              <input type="password" name="pennylane_token" value="${escHtml(s.pennylane_token || '')}" placeholder="IKuuh…" autocomplete="off">
            </div>
          </div>
        </div>

        <div class="glass-card settings-section">
          <h3>📅 Google Calendar</h3>
          <div class="form-grid">
            <div class="form-group">
              <label>Calendrier formations</label>
              <div style="display:flex;gap:10px;align-items:center">
                <select name="calendar_id" id="select-calendar" style="flex:1">
                  <option value="${escHtml(s.calendar_id || '')}">
                    ${s.calendar_id ? s.calendar_id : '— Cliquez sur Charger —'}
                  </option>
                </select>
                <button type="button" class="btn-secondary" id="btn-load-calendars">Charger</button>
              </div>
            </div>
          </div>
        </div>

      </div>

      <div class="form-actions" style="margin-top:24px">
        <button type="submit" class="btn-primary btn-large">💾 Enregistrer les paramètres</button>
      </div>
    </form>`;
}

export function init() {

  // ── Upload logo ────────────────────────────────────────────────────────────
  document.getElementById('logo-file-input')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast('Logo trop volumineux (max 2 Mo)', 'error'); return; }

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target.result;
      // Prévisualisation immédiate
      const wrap = document.querySelector('.logo-preview-wrap');
      wrap.innerHTML = `<img src="${base64}" id="logo-preview" class="logo-preview-img" alt="Logo">`;
      // Sauvegarde
      store.settings.logo_base64 = base64;
      await saveSettings();
      toast('Logo enregistré ✓');
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('btn-remove-logo')?.addEventListener('click', async () => {
    store.settings.logo_base64 = null;
    await saveSettings();
    toast('Logo supprimé');
    // Rafraîchir la section
    const wrap = document.querySelector('.logo-preview-wrap');
    wrap.innerHTML = `<div id="logo-preview" class="logo-preview-empty"><span>Aucun logo</span></div>`;
    document.getElementById('btn-remove-logo').remove();
  });

  document.getElementById('btn-load-calendars')?.addEventListener('click', async () => {
    try {
      const calendars = await listCalendars();
      const select = document.getElementById('select-calendar');
      select.innerHTML = calendars.map(c =>
        `<option value="${escHtml(c.id)}" ${c.id === store.settings.calendar_id ? 'selected' : ''}>${escHtml(c.summary)}</option>`
      ).join('');
      toast('Calendriers chargés ✓');
    } catch (e) {
      toast('Erreur lors du chargement des calendriers', 'error');
    }
  });

  document.getElementById('form-settings')?.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    store.settings = {
      ...store.settings,
      nom_commercial: fd.get('nom_commercial'),
      dirigeant: fd.get('dirigeant'),
      adresse: fd.get('adresse'),
      cp: fd.get('cp'),
      ville: fd.get('ville'),
      tel: fd.get('tel'),
      email: fd.get('email'),
      siret: fd.get('siret'),
      naf: fd.get('naf'),
      forme_juridique: fd.get('forme_juridique'),
      nda: fd.get('nda'),
      banque: fd.get('banque'),
      iban: fd.get('iban'),
      bic: fd.get('bic'),
      pennylane_token: fd.get('pennylane_token') || store.settings.pennylane_token || '',
      calendar_id: fd.get('calendar_id') || store.settings.calendar_id,
      facturation: {
        prefixe: fd.get('facturation_prefixe') || 'AF',
        delai_paiement_jours: parseInt(fd.get('facturation_delai')) || 45,
        penalites_taux: fd.get('facturation_penalites'),
        indemnite_recouvrement: parseInt(fd.get('facturation_indemnite')) || 40,
        mention_tva: fd.get('facturation_tva'),
      },
    };
    await saveSettings();
    toast('Paramètres enregistrés ✓');
  });
}
