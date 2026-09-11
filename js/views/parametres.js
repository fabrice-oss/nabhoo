import { store, saveSettings } from '../data.js';
import { toast, escHtml, isoToday, confirm } from '../utils.js';
import { listCalendars } from '../api/calendar.js';
import { createPennylaneDraftTest, sendFactureToPennylane, verifyPennylaneDraft, verifyPennylaneImport } from '../api/pennylane.js?v=20260911-2';

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
            <div class="form-group"><label>N° TVA intracommunautaire <span style="font-weight:400;color:var(--text-muted)">(si attribué)</span></label><input type="text" name="tva_intracom" value="${escHtml(s.tva_intracom || '')}" placeholder="FRXX123456789"></div>
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
            <div class="form-group"><label>Escompte pour paiement anticipé</label><input type="text" name="facturation_escompte" value="${escHtml(f.escompte || "Pas d'escompte pour paiement anticipé")}"></div>
            <div class="form-group form-group-half"><label>Taux de TVA (%)</label><input type="number" name="facturation_tva_taux" value="${Number(f.tva_taux || 0)}" min="0" step="0.1"></div>
            <div class="form-group"><label>Mention TVA</label><input type="text" name="facturation_tva" value="${escHtml(f.mention_tva || 'TVA non applicable, art. 293 B du CGI')}"></div>
            <div class="form-group form-group-full"><label class="checkbox-label"><input type="checkbox" name="facturation_tva_debits" ${f.tva_sur_debits ? 'checked' : ''}> Option pour le paiement de la TVA d'après les débits</label></div>
          </div>
        </div>

        <div class="glass-card settings-section">
          <h3>⚡ Facturation électronique (Pennylane)</h3>
          <div class="form-grid">
            <div class="form-group form-group-full">
              <label>Token API Pennylane <span style="font-weight:400;color:var(--text-muted)">(Paramètres → Connectivité → Développeurs)</span></label>
              <input type="password" name="pennylane_token" value="${escHtml(s.pennylane_token || '')}" placeholder="IKuuh…" autocomplete="off">
            </div>
            <div class="form-group form-group-full">
              <label for="pennylane-test-org">Client pour le test Pennylane (utilisez de préférence votre Sandbox)</label>
              <select id="pennylane-test-org">
                <option value="">Choisir un organisme configuré</option>
                ${store.organismes.filter(o => o.pennylane_customer_id).map(o => `<option value="${escHtml(o.id)}">${escHtml(o.nom)}</option>`).join('')}
              </select>
              <p>Crée un brouillon TEST de 1 € avec PDF, sans finalisation ni envoi au client. Aucun ajout au chiffre d’affaires NABHOO. Utilise le token déjà enregistré.</p>
              <button type="button" class="btn-secondary" id="btn-test-pennylane">Tester avec un brouillon de 1 €</button>
              <button type="button" class="btn-secondary" id="btn-test-pennylane-import">Tester l'import PDF Factur-X - Sandbox uniquement</button>
              <p id="pennylane-test-result" role="status" aria-live="polite"></p>
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
  document.getElementById('btn-test-pennylane-import')?.addEventListener('click', async e => {
    const btn = e.currentTarget;
    const output = document.getElementById('pennylane-test-result');
    const orgId = document.getElementById('pennylane-test-org').value;
    if (!orgId) { output.textContent = 'Choisissez un organisme pour le test.'; return; }
    const proceed = await confirm("Ce test importe une facture TEST de 1 EUR dans l'espace Pennylane actuellement relié. Continuez uniquement dans votre Sandbox Pennylane.");
    if (!proceed) return;
    btn.disabled = true;
    output.textContent = 'Test en cours : génération du PDF personnalisé, téléversement et demande de conversion Factur-X…';
    try {
      const date = isoToday();
      let test = store.settings.pennylane_import_test;
      if (test && test.organisme_id !== orgId) throw new Error('Un test existe déjà pour un autre organisme.');
      if (!test) {
        const id = `test-import-${crypto.randomUUID()}`;
        test = {
          id, numero: `TEST-NABHOO-${id.slice(-8)}`, date_emission: date, date_echeance: date,
          montant_ht: 1, tva_taux: 0, organisme_id: orgId,
          client_type: 'organisme', client_id: orgId,
        };
        store.settings.pennylane_import_test = test;
      }
      const mission = {
        organisme_id: orgId, type: 'animation', intitule: 'TEST IMPORT PDF - NE PAS ENVOYER',
        sessions: [{ date, heures: 1 }], tarif_journalier: 1, frais_deplacement: 0,
      };
      const result = await sendFactureToPennylane(test, mission);
      await saveSettings();
      const verified = await verifyPennylaneImport(result.id || test.pennylane_id);
      output.textContent = `Test importé : facture ${test.pennylane_id}, PDF personnalisé conservé, Factur-X : ${verified.facturX ? 'présent' : 'conversion en cours'}, validation : ${verified.schematron}. Aucun envoi au client.`;
    } catch (error) {
      await saveSettings();
      output.textContent = `Test d'import non validé : ${error.message}`;
    } finally { btn.disabled = false; }
  });

  document.getElementById('btn-test-pennylane')?.addEventListener('click', async e => {
    const btn = e.currentTarget;
    const output = document.getElementById('pennylane-test-result');
    const orgId = document.getElementById('pennylane-test-org').value;
    if (!orgId) { output.textContent = 'Choisissez un organisme pour le test.'; return; }
    btn.disabled = true;
    output.textContent = 'Test en cours : création du brouillon, pièce jointe puis vérification…';
    try {
      const date = isoToday();
      let test = store.settings.pennylane_test;
      if (test && test.organisme_id !== orgId) throw new Error('Un test existe déjà pour un autre organisme. Sélectionnez cet organisme pour le reprendre.');
      if (!test) {
        const id = `test-${crypto.randomUUID()}`;
        test = { id, numero: `TEST-NABHOO-${id.slice(-8)}`, date_emission: date, date_echeance: date, montant_ht: 1, tva_taux: 0, organisme_id: orgId, client_type: 'organisme', client_id: orgId };
        store.settings.pennylane_test = test;
        await saveSettings();
      }
      Object.assign(test, { montant_ht: 1, client_type: 'organisme', client_id: orgId });
      const mission = { organisme_id: orgId, intitule: 'TEST TECHNIQUE — NE PAS FINALISER NI ENVOYER', sessions: [{ date: test.date_emission, heures: 1 }], tarif_journalier: 1, frais_deplacement: 0 };
      let result;
      try { result = await createPennylaneDraftTest(test, mission); }
      finally { await saveSettings(); }
      if (result.nabhoo_warning) throw new Error(result.nabhoo_warning);
      const verified = await verifyPennylaneDraft(test.pennylane_id);
      output.textContent = `Test réussi : brouillon ${test.pennylane_id}, montant ${verified.amount} €, PDF présent. Aucune facture envoyée au client. Le brouillon TEST reste dans Pennylane.`;
    } catch (error) {
      output.textContent = `Test non validé : ${error.message}`;
    } finally { btn.disabled = false; }
  });

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
      tva_intracom: fd.get('tva_intracom'),
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
        escompte: fd.get('facturation_escompte') || "Pas d'escompte pour paiement anticipé",
        tva_taux: parseFloat(fd.get('facturation_tva_taux')) || 0,
        tva_sur_debits: fd.get('facturation_tva_debits') === 'on',
        mention_tva: fd.get('facturation_tva'),
      },
    };
    await saveSettings();
    toast('Paramètres enregistrés ✓');
  });
}
