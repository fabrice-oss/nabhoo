import { store, saveFactures, getOrganisme, getMission } from '../data.js';
import { uuid, toast, escHtml, confirm, formatDate, formatCurrency, nextInvoiceNumber, isoToday, addDays, missionTotalHT } from '../utils.js';
import { showModal, closeModal, navigate } from '../app.js';
import { generateInvoicePDF } from '../pdf.js';
import { uploadPDF } from '../api/drive.js';

export function render(params = {}) {
  if (params.action === 'new' && params.missionId) {
    setTimeout(() => openFactureForm(null, params.missionId), 100);
  }

  return `
    <div class="view-header">
      <h2>Factures</h2>
      <button class="btn-primary" id="btn-new-facture">+ Nouvelle facture</button>
    </div>
    <div class="filter-bar glass-card">
      <button class="filter-btn active" data-filter="tous">Toutes</button>
      <button class="filter-btn" data-filter="en_attente">En attente</button>
      <button class="filter-btn" data-filter="en_retard">⚠️ En retard</button>
      <button class="filter-btn" data-filter="payee">Payées</button>
    </div>
    <div id="factures-list">${renderFacturesList('tous')}</div>`;
}

function renderFacturesList(filter) {
  const today = isoToday();
  const list = filter === 'tous'
    ? store.factures
    : filter === 'en_retard'
      ? store.factures.filter(f => f.statut === 'en_attente' && f.date_echeance < today)
      : store.factures.filter(f => f.statut === filter);
  const sorted = [...list].sort((a, b) => b.numero.localeCompare(a.numero));

  const emptyMsg = { en_retard: 'Aucune facture en retard ✓', en_attente: 'Aucune facture en attente.', payee: 'Aucune facture payée.' };
  if (sorted.length === 0) return `<p class="empty-state">${emptyMsg[filter] || 'Aucune facture.'}</p>`;

  const totalEnAttente = store.factures.filter(f => f.statut === 'en_attente').reduce((s, f) => s + f.montant_ht, 0);
  const totalEnRetard = store.factures.filter(f => f.statut === 'en_attente' && f.date_echeance < today).reduce((s, f) => s + f.montant_ht, 0);

  return `
    ${filter !== 'payee' ? `
    <div class="glass-card summary-bar">
      <span>Total en attente : <strong>${formatCurrency(totalEnAttente)}</strong></span>
      ${totalEnRetard > 0 ? `<span style="color:var(--badge-danger-color,#ff6b7a)">⚠️ Dont en retard : <strong>${formatCurrency(totalEnRetard)}</strong></span>` : ''}
    </div>` : ''}
    <div class="glass-card">
      <div class="table-wrapper">
      <table class="data-table">
        <thead><tr>
          <th>N° Facture</th><th>Date</th><th>Organisme</th><th>Mission</th><th>Montant HT</th><th>Échéance</th><th>Statut</th><th>Payée le</th><th>Actions</th>
        </tr></thead>
        <tbody>
          ${sorted.map(f => {
            const m = getMission(f.mission_id);
            const org = m ? getOrganisme(m.organisme_id) : null;
            const retard = f.statut === 'en_attente' && f.date_echeance < isoToday();
            return `
              <tr class="${retard ? 'row-retard' : ''}">
                <td><strong>${escHtml(f.numero)}</strong></td>
                <td>${formatDate(f.date_emission)}</td>
                <td>${escHtml(org?.nom || '—')}</td>
                <td>${escHtml(m?.intitule || '—')}</td>
                <td><strong>${formatCurrency(f.montant_ht)}</strong></td>
                <td class="${retard ? 'text-danger' : ''}">${formatDate(f.date_echeance)}</td>
                <td>
                  <span class="badge badge-${f.statut === 'payee' ? 'success' : retard ? 'danger' : 'warning'}">
                    ${f.statut === 'payee' ? 'Payée' : retard ? '⚠️ En retard' : 'En attente'}
                  </span>
                </td>
                <td>${f.statut === 'payee' && f.date_paiement ? formatDate(f.date_paiement) : '—'}</td>
                <td class="actions">
                  <button class="btn-icon btn-pdf" data-id="${f.id}" title="Générer et télécharger le PDF">📄</button>
                  <button class="btn-icon btn-edit-facture" data-id="${f.id}" title="Modifier la facture">✏️</button>
                  ${f.statut === 'en_attente'
                    ? `<button class="btn-icon btn-mark-paid" data-id="${f.id}" title="Marquer comme payée">✅</button>`
                    : ''}
                  <button class="btn-icon btn-delete-facture" data-id="${f.id}" title="Supprimer">🗑️</button>
                </td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
      </div>
      <div class="table-legend">
        <span>📄 Générer PDF</span>
        <span>✏️ Modifier</span>
        <span>✅ Marquer payée</span>
        <span>🗑️ Supprimer</span>
      </div>
    </div>`;
}

export function init(params = {}) {
  document.getElementById('btn-new-facture')?.addEventListener('click', () => openFactureForm());

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('factures-list').innerHTML = renderFacturesList(btn.dataset.filter);
      attachFactureEvents();
    });
  });

  attachFactureEvents();
}

function attachFactureEvents() {
  document.querySelectorAll('.btn-pdf').forEach(btn =>
    btn.addEventListener('click', () => downloadPDF(btn.dataset.id)));
  document.querySelectorAll('.btn-edit-facture').forEach(btn =>
    btn.addEventListener('click', () => openEditFactureForm(btn.dataset.id)));
  document.querySelectorAll('.btn-mark-paid').forEach(btn =>
    btn.addEventListener('click', () => markPaid(btn.dataset.id)));
  document.querySelectorAll('.btn-delete-facture').forEach(btn =>
    btn.addEventListener('click', () => deleteFacture(btn.dataset.id)));
}

function factureFormHTML(missionId = null) {
  const numero = nextInvoiceNumber(store.factures, store.settings.facturation?.prefixe || 'AF');
  const today = isoToday();
  const echeance = addDays(today, store.settings.facturation?.delai_paiement_jours || 45);
  const preselected = missionId ? store.missions.find(m => m.id === missionId) : null;
  const preTotal = preselected ? missionTotalHT(preselected) : 0;

  return `
    <form id="form-facture" class="form-grid">
      <div class="form-group form-group-half">
        <label>Numéro *</label>
        <input type="text" name="numero" value="${escHtml(numero)}" required>
      </div>
      <div class="form-group form-group-half">
        <label>Date d'émission *</label>
        <input type="date" name="date_emission" value="${today}" required>
      </div>
      <div class="form-group">
        <label>Mission associée *</label>
        <select name="mission_id" id="select-mission" required>
          <option value="">— Sélectionner une mission —</option>
          ${store.missions.map(m => {
            const org = getOrganisme(m.organisme_id);
            return `<option value="${m.id}" ${m.id === missionId ? 'selected' : ''}>${escHtml(m.intitule || 'Sans titre')} — ${escHtml(org?.nom || '')}</option>`;
          }).join('')}
        </select>
      </div>
      <div class="form-group form-group-half">
        <label>Montant HT (€) *</label>
        <input type="number" name="montant_ht" id="input-montant" value="${preTotal}" min="0" step="0.01" required>
      </div>
      <div class="form-group form-group-half">
        <label>Échéance</label>
        <input type="date" name="date_echeance" value="${echeance}" required>
      </div>
      <div class="form-group form-group-full">
        <label>Référence formation / ID PIPE <span style="font-weight:400;color:var(--text-muted)">(optionnel — ex: PIPE-2026-042 ou REF-CSE-0312)</span></label>
        <input type="text" name="reference_formation" placeholder="Laisser vide si non applicable">
      </div>
      <div class="form-actions">
        <button type="button" class="btn-secondary" id="btn-cancel">Annuler</button>
        <button type="submit" class="btn-primary">Créer la facture</button>
      </div>
    </form>`;
}

function editFactureFormHTML(facture) {
  return `
    <form id="form-edit-facture" class="form-grid">
      <div class="form-group form-group-half">
        <label>Numéro *</label>
        <input type="text" name="numero" value="${escHtml(facture.numero)}" required>
      </div>
      <div class="form-group form-group-half">
        <label>Date d'émission *</label>
        <input type="date" name="date_emission" value="${facture.date_emission}" required>
      </div>
      <div class="form-group form-group-half">
        <label>Montant HT (€) *</label>
        <input type="number" name="montant_ht" value="${facture.montant_ht}" min="0" step="0.01" required>
      </div>
      <div class="form-group form-group-half">
        <label>Date d'échéance *</label>
        <input type="date" name="date_echeance" value="${facture.date_echeance}" required>
      </div>
      <div class="form-group">
        <label>Statut</label>
        <select name="statut">
          <option value="en_attente" ${facture.statut === 'en_attente' ? 'selected' : ''}>En attente</option>
          <option value="payee" ${facture.statut === 'payee' ? 'selected' : ''}>Payée</option>
        </select>
      </div>
      <div class="form-group" id="date-paiement-group" ${facture.statut !== 'payee' ? 'style="display:none"' : ''}>
        <label>Date de paiement</label>
        <input type="date" name="date_paiement" value="${facture.date_paiement || isoToday()}">
      </div>
      <div class="form-group form-group-full">
        <label>Référence formation / ID PIPE <span style="font-weight:400;color:var(--text-muted)">(optionnel)</span></label>
        <input type="text" name="reference_formation" value="${escHtml(facture.reference_formation || '')}" placeholder="Ex: PIPE-2026-042 ou REF-CSE-0312">
      </div>
      <div class="form-actions">
        <button type="button" class="btn-secondary" id="btn-cancel">Annuler</button>
        <button type="submit" class="btn-primary">Enregistrer les modifications</button>
      </div>
    </form>`;
}

function openFactureForm(id = null, missionId = null) {
  showModal('Nouvelle facture', factureFormHTML(missionId));

  document.getElementById('btn-cancel')?.addEventListener('click', closeModal);

  document.getElementById('select-mission')?.addEventListener('change', e => {
    const m = getMission(e.target.value);
    if (m) document.getElementById('input-montant').value = missionTotalHT(m);
  });

  document.getElementById('form-facture')?.addEventListener('submit', async ev => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const facture = {
      id: uuid(),
      numero: fd.get('numero'),
      mission_id: fd.get('mission_id'),
      date_emission: fd.get('date_emission'),
      date_echeance: fd.get('date_echeance'),
      montant_ht: parseFloat(fd.get('montant_ht')) || 0,
      statut: 'en_attente',
      date_paiement: null,
      reference_formation: fd.get('reference_formation') || null,
      pdf_drive_id: null,
      created_at: new Date().toISOString(),
    };
    store.factures.push(facture);
    await saveFactures();
    toast('Facture créée ✓ — Utilisez le bouton 📄 pour générer le PDF');
    closeModal();
    navigate('factures');
  });
}

function openEditFactureForm(id) {
  const facture = store.factures.find(f => f.id === id);
  if (!facture) return;

  showModal(`Modifier — ${facture.numero}`, editFactureFormHTML(facture));

  document.getElementById('btn-cancel')?.addEventListener('click', closeModal);

  // Afficher/masquer date de paiement selon le statut
  document.querySelector('#form-edit-facture [name="statut"]')?.addEventListener('change', e => {
    document.getElementById('date-paiement-group').style.display = e.target.value === 'payee' ? '' : 'none';
  });

  document.getElementById('form-edit-facture')?.addEventListener('submit', async ev => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const idx = store.factures.findIndex(f => f.id === id);
    const newStatut = fd.get('statut');
    store.factures[idx] = {
      ...store.factures[idx],
      numero: fd.get('numero'),
      date_emission: fd.get('date_emission'),
      date_echeance: fd.get('date_echeance'),
      montant_ht: parseFloat(fd.get('montant_ht')) || 0,
      statut: newStatut,
      date_paiement: newStatut === 'payee' ? (fd.get('date_paiement') || isoToday()) : null,
      reference_formation: fd.get('reference_formation') || store.factures[idx].reference_formation || null,
    };
    await saveFactures();
    toast('Facture modifiée ✓');
    closeModal();
    navigate('factures');
  });
}

async function downloadPDF(id) {
  const facture = store.factures.find(f => f.id === id);
  if (!facture) return;
  const mission = getMission(facture.mission_id);
  if (!mission) { toast('Mission introuvable', 'error'); return; }

  toast('Génération du PDF en cours…');
  try {
    const blob = await generateInvoicePDF(facture, mission);

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${facture.numero}.pdf`;
    a.click();
    URL.revokeObjectURL(url);

    try {
      const result = await uploadPDF(`${facture.numero}.pdf`, blob);
      const idx = store.factures.findIndex(f => f.id === id);
      store.factures[idx].pdf_drive_id = result.id;
      await saveFactures();
      toast(`${facture.numero}.pdf enregistré sur Drive ✓`);
    } catch (e) {
      console.warn('Drive upload failed:', e);
      toast('PDF téléchargé localement (Drive non disponible)', 'warning');
    }
  } catch (e) {
    console.error(e);
    toast('Erreur lors de la génération du PDF', 'error');
  }
}

function markPaid(id) {
  const facture = store.factures.find(f => f.id === id);
  if (!facture) return;
  showModal('Marquer comme payée', `
    <div class="form-grid">
      <div class="form-group form-group-full">
        <p style="color:var(--text-secondary);margin-bottom:16px">Facture <strong>${escHtml(facture.numero)}</strong></p>
        <label>Date de paiement reçu</label>
        <input type="date" id="paid-date-input" value="${isoToday()}">
      </div>
      <div class="form-actions">
        <button type="button" class="btn-secondary" id="btn-cancel-paid">Annuler</button>
        <button type="button" class="btn-primary" id="btn-confirm-paid">Confirmer le paiement</button>
      </div>
    </div>
  `, 'modal-sm');
  document.getElementById('btn-cancel-paid')?.addEventListener('click', closeModal);
  document.getElementById('btn-confirm-paid')?.addEventListener('click', async () => {
    const datePaid = document.getElementById('paid-date-input').value || isoToday();
    const idx = store.factures.findIndex(f => f.id === id);
    store.factures[idx].statut = 'payee';
    store.factures[idx].date_paiement = datePaid;
    await saveFactures();
    toast('Facture marquée comme payée ✓');
    closeModal();
    navigate('factures');
  });
}

async function deleteFacture(id) {
  const ok = await confirm('Supprimer cette facture définitivement ?');
  if (!ok) return;
  store.factures = store.factures.filter(f => f.id !== id);
  await saveFactures();
  toast('Facture supprimée');
  navigate('factures');
}
