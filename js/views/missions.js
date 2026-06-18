import { store, saveMissions, getOrganisme, getMissionEntreprises, getMissionFacture } from '../data.js';
import { uuid, toast, escHtml, confirm, formatDate, formatCurrency, missionTotalHT, missionHeuresFormateur, isoToday } from '../utils.js';
import { showModal, closeModal, navigate } from '../app.js';
import { createEvent } from '../api/calendar.js';
import { uploadContrat, uploadFiche, fetchDriveBlob, deleteDriveFile } from '../api/drive.js';

const CONTRAT_MAX_SIZE = 10 * 1024 * 1024; // 10 Mo
const CONTRAT_ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const MISSION_TYPES = [
  { value: 'animation',         label: 'Animation de formation' },
  { value: 'conception',        label: 'Conception pédagogique' },
  { value: 'creation_site_web', label: 'Création de site web' },
  { value: 'application_web',   label: 'Application web' },
  { value: 'gestion_site_web',  label: 'Gestion de site web' },
];

const SPECIALITES = [
  { code: '200', label: 'Formations générales' },
  { code: '300', label: 'Sciences, lettres, arts' },
  { code: '400', label: 'Sciences humaines' },
  { code: '413', label: 'Droit, sciences politiques' },
  { code: '414', label: 'Sciences économiques' },
  { code: '415', label: 'Gestion, administration des entreprises' },
  { code: '421', label: 'Journalisme' },
  { code: '422', label: 'Communication, information' },
  { code: '423', label: 'Vie familiale, vie sociale' },
  { code: '431', label: 'Éducation physique, sport' },
  { code: '311', label: 'Santé' },
  { code: '312', label: 'Action sociale, psychologie' },
  { code: '320', label: 'Spécialités pluritechnologiques' },
  { code: '326', label: 'Informatique, traitement de l\'information' },
  { code: '334', label: 'Sécurité des biens et des personnes, police' },
];

export function render() {
  return `
    <div class="view-header">
      <h2>Missions</h2>
      <button class="btn-primary" id="btn-new-mission">+ Nouvelle mission</button>
    </div>
    <div class="filter-bar glass-card">
      <button class="filter-btn active" data-filter="tous">Toutes</button>
      <button class="filter-btn" data-filter="a_venir">À venir</button>
      <button class="filter-btn" data-filter="en_cours">En cours</button>
      <button class="filter-btn" data-filter="terminee">Terminées</button>
      <button class="filter-btn" data-filter="annulee">Annulées</button>
    </div>
    <div id="missions-list">
      ${renderMissionsList('tous')}
    </div>`;
}

function typeLabel(type) {
  return MISSION_TYPES.find(t => t.value === type)?.label || type || 'Formation';
}

function renderMissionsList(filter) {
  const today = isoToday();
  const list = filter === 'tous'
    ? store.missions
    : filter === 'a_venir'
      ? store.missions.filter(m => m.statut === 'a_venir' || (m.statut === 'en_cours' && (m.sessions?.[0]?.date || '') > today))
      : filter === 'en_cours'
        ? store.missions.filter(m => m.statut === 'en_cours' && (m.sessions?.[0]?.date || '') <= today)
        : store.missions.filter(m => m.statut === filter);

  const sorted = [...list].sort((a, b) => {
    const aDate = (a.sessions?.[0]?.date) || '';
    const bDate = (b.sessions?.[0]?.date) || '';
    // Pour "à venir" : ordre chronologique (la plus proche en premier)
    return filter === 'a_venir'
      ? aDate.localeCompare(bDate)
      : bDate.localeCompare(aDate);
  });

  if (sorted.length === 0) return '<p class="empty-state">Aucune mission.</p>';

  return `<div class="missions-grid">
    ${sorted.map(m => {
      const org = m.organisme_id ? getOrganisme(m.organisme_id) : null;
      const entreprises = getMissionEntreprises(m);
      const facture = getMissionFacture(m.id);
      const sessions = m.sessions || [];
      const firstDate = sessions[0]?.date;
      const lastDate = sessions[sessions.length - 1]?.date;
      const total = missionTotalHT(m);
      const heures = missionHeuresFormateur(m);
      const isAVenir = m.statut === 'a_venir' || (m.statut === 'en_cours' && (firstDate || '') > today);
      const statutClass = isAVenir ? 'warning' : ({ en_cours: 'info', terminee: 'success', annulee: 'danger' }[m.statut] || 'info');
      const statutLabel = isAVenir ? '🗓 À venir' : ({ en_cours: 'En cours', terminee: 'Terminée', annulee: 'Annulée' }[m.statut] || m.statut);

      return `
        <div class="mission-card glass-card" data-id="${m.id}" role="button" tabindex="0">
          <div class="mission-card-header">
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <span class="badge badge-${statutClass}">${statutLabel}</span>
              <span class="badge badge-info">${escHtml(typeLabel(m.type))}</span>
              ${m.distanciel ? '<span class="badge badge-info">Distanciel</span>' : ''}
            </div>
            <div class="mission-actions">
              <button class="btn-icon btn-edit-mission" data-id="${m.id}" title="Modifier">✏️</button>
              <button class="btn-icon btn-delete-mission" data-id="${m.id}" title="Supprimer">🗑️</button>
            </div>
          </div>
          <h3 class="mission-title">${escHtml(m.intitule || 'Mission sans titre')}</h3>
          <div class="mission-meta">
            ${org ? `<div class="meta-item"><span>🏢</span> ${escHtml(org.nom)}</div>` : ''}
            ${entreprises.length > 0
              ? `<div class="meta-item"><span>🏭</span> ${entreprises.map(e => escHtml(e.nom)).join(', ')}</div>`
              : ''}
            <div class="meta-item"><span>👥</span> ${m.participants || 0} participant(s)</div>
            <div class="meta-item"><span>⏱</span> ${heures}h · ${sessions.length} jour(s)${m.distanciel ? ' · <span style="color:var(--orange)">🖥 distanciel</span>' : ''}</div>
            ${firstDate ? `<div class="meta-item"><span>📅</span> ${formatDate(firstDate)}${lastDate !== firstDate ? ` → ${formatDate(lastDate)}` : ''}</div>` : ''}
            ${m.contrat ? `<a href="${m.contrat.web_view_link}" target="_blank" rel="noopener" class="meta-item meta-link">📎 ${escHtml(m.contrat.filename)}</a>` : ''}
          </div>
          <div class="mission-footer">
            <div class="mission-total">${formatCurrency(total)}</div>
            ${facture
              ? `<span class="badge badge-${facture.statut === 'payee' ? 'success' : 'warning'}">${facture.statut === 'payee' ? '✓ Payée' : '⏳ Facturée'}</span>`
              : m.statut === 'terminee'
                ? `<button class="btn-sm btn-primary btn-facturer" data-id="${m.id}">Facturer</button>`
                : ''}
          </div>
        </div>`;
    }).join('')}
  </div>`;
}

export function init() {
  document.getElementById('btn-new-mission')?.addEventListener('click', () => openMissionForm());

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('missions-list').innerHTML = renderMissionsList(btn.dataset.filter);
      attachMissionEvents();
    });
  });

  attachMissionEvents();
}

function attachMissionEvents() {
  document.querySelectorAll('.mission-card').forEach(card => {
    card.addEventListener('click', () => openMissionDetail(card.dataset.id));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMissionDetail(card.dataset.id); }
    });
  });
  document.querySelectorAll('.mission-card a.meta-link').forEach(link =>
    link.addEventListener('click', e => e.stopPropagation()));
  document.querySelectorAll('.btn-edit-mission').forEach(btn =>
    btn.addEventListener('click', e => { e.stopPropagation(); openMissionForm(btn.dataset.id); }));
  document.querySelectorAll('.btn-delete-mission').forEach(btn =>
    btn.addEventListener('click', e => { e.stopPropagation(); deleteMission(btn.dataset.id); }));
  document.querySelectorAll('.btn-facturer').forEach(btn =>
    btn.addEventListener('click', e => { e.stopPropagation(); navigate('factures', { action: 'new', missionId: btn.dataset.id }); }));
}

// ── Détail mission (popup résumé) ─────────────────────────────────────────
function missionDetailHTML(m) {
  const org = m.organisme_id ? getOrganisme(m.organisme_id) : null;
  const entreprises = getMissionEntreprises(m);
  const facture = getMissionFacture(m.id);
  const sessions = m.sessions || [];
  const total = missionTotalHT(m);
  const heures = missionHeuresFormateur(m);
  const today = isoToday();
  const firstDate = sessions[0]?.date;
  const isAVenir = m.statut === 'a_venir' || (m.statut === 'en_cours' && (firstDate || '') > today);
  const statutClass = isAVenir ? 'warning' : ({ en_cours: 'info', terminee: 'success', annulee: 'danger' }[m.statut] || 'info');
  const statutLabel = isAVenir ? '🗓 À venir' : ({ en_cours: 'En cours', terminee: 'Terminée', annulee: 'Annulée' }[m.statut] || m.statut);
  const specialite = SPECIALITES.find(s => s.code === m.specialite);
  const factureStatutClass = facture?.statut === 'payee' ? 'success' : (facture && facture.date_echeance < today ? 'danger' : 'warning');
  const factureStatutLabel = facture?.statut === 'payee' ? '✓ Payée' : (facture?.date_echeance < today ? '⚠️ En retard' : '⏳ En attente');

  return `
    <div class="mission-detail-v2">

      <!-- Badges statut -->
      <div class="detail-badges-row">
        <span class="badge badge-${statutClass} badge-lg">${statutLabel}</span>
        <span class="badge badge-info badge-lg">${escHtml(typeLabel(m.type))}</span>
        ${m.distanciel ? '<span class="badge badge-info badge-lg">🖥 Distanciel</span>' : ''}
        ${facture ? `<span class="badge badge-${factureStatutClass} badge-lg">${factureStatutLabel}</span>` : ''}
      </div>

      <!-- Infos générales -->
      <div class="detail-section" data-gsap="section">
        <div class="detail-section-header">
          <span class="detail-section-icon">ℹ️</span>
          <h4>Informations générales</h4>
        </div>
        <div class="detail-info-grid">
          ${org ? `<div class="detail-info-block"><div class="detail-info-label">Organisme</div><div class="detail-info-value">${escHtml(org.nom)}</div></div>` : ''}
          ${entreprises.length ? `<div class="detail-info-block"><div class="detail-info-label">Entreprise(s)</div><div class="detail-info-value">${entreprises.map(e => escHtml(e.nom)).join(', ')}</div></div>` : ''}
          <div class="detail-info-block"><div class="detail-info-label">Participants</div><div class="detail-info-value">${m.participants || 0}</div></div>
          ${specialite ? `<div class="detail-info-block detail-info-block-full"><div class="detail-info-label">Spécialité BPF</div><div class="detail-info-value">${specialite.code} — ${escHtml(specialite.label)}</div></div>` : ''}
        </div>
      </div>

      <!-- Barre financière -->
      <div class="detail-finance-bar" data-gsap="section">
        <div class="detail-finance-item">
          <span class="detail-finance-label">Tarif / jour</span>
          <span class="detail-finance-value">${formatCurrency(m.tarif_journalier || 0)}</span>
        </div>
        ${m.frais_deplacement ? `<div class="detail-finance-item">
          <span class="detail-finance-label">Frais déplacement</span>
          <span class="detail-finance-value">${formatCurrency(m.frais_deplacement)}</span>
        </div>` : ''}
        <div class="detail-finance-item detail-finance-total">
          <span class="detail-finance-label">Total HT</span>
          <span class="detail-finance-value">${formatCurrency(total)}</span>
        </div>
      </div>

      <!-- Timeline des sessions -->
      <div class="detail-section" data-gsap="section">
        <div class="detail-section-header">
          <span class="detail-section-icon">📅</span>
          <h4>Sessions — ${sessions.length} jour(s) · ${heures}h de formation</h4>
        </div>
        <div class="detail-timeline">
          ${sessions.map((s, i) => `
            <div class="detail-timeline-item" data-gsap="timeline-item">
              <div class="timeline-connector${i === sessions.length - 1 ? ' timeline-last' : ''}">
                <div class="timeline-dot${i === 0 ? ' timeline-dot-first' : ''}"></div>
                <div class="timeline-line"></div>
              </div>
              <div class="timeline-content">
                <span class="timeline-date">${formatDate(s.date)}</span>
                <span class="timeline-hours">${s.heures}h</span>
                ${s.distanciel ? '<span class="badge badge-info" style="font-size:0.68rem;padding:2px 7px">distanciel</span>' : ''}
              </div>
            </div>`).join('')}
        </div>
      </div>

      <!-- Documents -->
      <div class="detail-section" data-gsap="section">
        <div class="detail-section-header">
          <span class="detail-section-icon">📎</span>
          <h4>Documents</h4>
        </div>

        <!-- Contrat signé -->
        <div class="detail-doc-category">
          <span class="detail-doc-type-label">Contrat signé</span>
          ${m.contrat
            ? `<div class="detail-doc-row">
                <div class="detail-doc-file">
                  <span class="detail-doc-icon">📄</span>
                  <div>
                    <div class="detail-doc-filename">${escHtml(m.contrat.filename)}</div>
                    ${m.contrat.uploaded_at ? `<div class="detail-doc-meta">Ajouté le ${formatDate(m.contrat.uploaded_at.split('T')[0])}</div>` : ''}
                  </div>
                </div>
                <div class="detail-doc-actions">
                  <button class="btn-preview-doc btn-secondary btn-sm" data-target="preview-contrat" data-drive-id="${m.contrat.drive_id}" data-mime="${escHtml(m.contrat.mime_type || 'application/pdf')}">👁 Prévisualiser</button>
                  <a href="${m.contrat.web_view_link}" target="_blank" rel="noopener" class="btn-secondary btn-sm">⬡ Drive</a>
                </div>
              </div>
              <div id="preview-contrat" class="doc-preview-panel hidden"></div>`
            : '<p class="detail-doc-empty">Aucun contrat joint</p>'}
        </div>

        <!-- Fiche de présence -->
        <div class="detail-doc-category">
          <span class="detail-doc-type-label">Fiche de présence</span>
          ${m.fiche_presence
            ? `<div class="detail-doc-row">
                <div class="detail-doc-file">
                  <span class="detail-doc-icon">📋</span>
                  <div>
                    <div class="detail-doc-filename">${escHtml(m.fiche_presence.filename)}</div>
                    ${m.fiche_presence.uploaded_at ? `<div class="detail-doc-meta">Ajoutée le ${formatDate(m.fiche_presence.uploaded_at.split('T')[0])}</div>` : ''}
                  </div>
                </div>
                <div class="detail-doc-actions">
                  <button class="btn-preview-doc btn-secondary btn-sm" data-target="preview-fiche" data-drive-id="${m.fiche_presence.drive_id}" data-mime="${escHtml(m.fiche_presence.mime_type || 'application/pdf')}">👁 Prévisualiser</button>
                  <a href="${m.fiche_presence.web_view_link}" target="_blank" rel="noopener" class="btn-secondary btn-sm">⬡ Drive</a>
                </div>
              </div>
              <div id="preview-fiche" class="doc-preview-panel hidden"></div>`
            : '<p class="detail-doc-empty">Aucune fiche de présence jointe</p>'}
        </div>
      </div>

      <!-- Facturation -->
      ${facture ? `
      <div class="detail-section" data-gsap="section">
        <div class="detail-section-header">
          <span class="detail-section-icon">🧾</span>
          <h4>Facturation</h4>
        </div>
        <div class="detail-facture-card">
          <div class="detail-facture-num">${escHtml(facture.num_facture || '—')}</div>
          <div class="detail-facture-grid">
            <div class="detail-info-block"><div class="detail-info-label">Émise le</div><div class="detail-info-value">${formatDate(facture.date_emission)}</div></div>
            <div class="detail-info-block"><div class="detail-info-label">Échéance</div><div class="detail-info-value ${facture.statut !== 'payee' && facture.date_echeance < today ? 'text-danger' : ''}">${formatDate(facture.date_echeance)}</div></div>
            <div class="detail-info-block"><div class="detail-info-label">Montant HT</div><div class="detail-info-value" style="color:var(--orange);font-size:1.1rem">${formatCurrency(facture.montant_ht)}</div></div>
            ${facture.statut === 'payee' && facture.date_paiement ? `<div class="detail-info-block"><div class="detail-info-label">Payée le</div><div class="detail-info-value" style="color:#4ade80">${formatDate(facture.date_paiement)}</div></div>` : ''}
          </div>
          <span class="badge badge-${factureStatutClass}" style="margin-top:4px">${factureStatutLabel}</span>
        </div>
      </div>` : ''}

      <!-- Notes -->
      ${m.notes ? `
      <div class="detail-section" data-gsap="section">
        <div class="detail-section-header">
          <span class="detail-section-icon">📝</span>
          <h4>Notes internes</h4>
        </div>
        <p class="detail-notes">${escHtml(m.notes)}</p>
      </div>` : ''}

      <!-- Actions -->
      <div class="form-actions" style="margin-top:8px">
        <button type="button" class="btn-secondary" id="btn-detail-close">Fermer</button>
        <button type="button" class="btn-primary" id="btn-detail-edit" data-id="${m.id}">✏️ Modifier</button>
      </div>
    </div>`;
}

function openMissionDetail(id) {
  const m = store.missions.find(x => x.id === id);
  if (!m) return;
  showModal(m.intitule || 'Détail de la mission', missionDetailHTML(m), 'modal-large');

  document.getElementById('btn-detail-close')?.addEventListener('click', closeModal);
  document.getElementById('btn-detail-edit')?.addEventListener('click', () => openMissionForm(id));

  // Prévisualisation des documents
  document.querySelectorAll('.btn-preview-doc').forEach(btn => {
    btn.addEventListener('click', async () => {
      const targetId = btn.dataset.target;
      const driveId = btn.dataset.driveId;
      const mime = btn.dataset.mime;
      const panel = document.getElementById(targetId);
      if (!panel) return;

      if (!panel.classList.contains('hidden')) {
        panel.classList.add('hidden');
        panel.innerHTML = '';
        btn.textContent = '👁 Prévisualiser';
        return;
      }

      btn.textContent = '⏳ Chargement…';
      btn.disabled = true;
      panel.classList.remove('hidden');
      panel.innerHTML = `<div class="doc-preview-loading"><div class="loading-spinner"></div><p>Chargement du document…</p></div>`;

      try {
        const blob = await fetchDriveBlob(driveId);
        const url = URL.createObjectURL(blob);
        if (mime.startsWith('image/')) {
          panel.innerHTML = `<img src="${url}" class="doc-preview-img" alt="Document">`;
        } else if (mime === 'application/pdf') {
          panel.innerHTML = `<iframe src="${url}" class="doc-preview-iframe" title="Document"></iframe>`;
        } else {
          panel.innerHTML = `<div class="doc-preview-word"><span>📄</span><p>Prévisualisation non disponible pour ce format.</p><a href="${url}" download="${btn.closest('.detail-doc-row')?.querySelector('.detail-doc-filename')?.textContent || 'document'}" class="btn-secondary btn-sm">⬇️ Télécharger</a></div>`;
        }
        btn.textContent = '✕ Fermer';
      } catch (e) {
        panel.innerHTML = `<p class="doc-preview-error">Impossible de charger le document. <a href="#" class="doc-preview-retry" data-target="${targetId}" data-drive-id="${driveId}" data-mime="${mime}">Réessayer</a></p>`;
        btn.textContent = '👁 Prévisualiser';
      }
      btn.disabled = false;
    });
  });

  // Animations GSAP si disponible
  if (window.gsap) {
    gsap.from('[data-gsap="section"]', {
      opacity: 0,
      y: 18,
      stagger: 0.07,
      duration: 0.38,
      ease: 'power2.out',
      clearProps: 'all',
    });
    gsap.from('[data-gsap="timeline-item"]', {
      opacity: 0,
      x: -14,
      stagger: 0.055,
      duration: 0.3,
      ease: 'power2.out',
      delay: 0.18,
      clearProps: 'all',
    });
  }
}

function isAnimation(type) {
  return type === 'animation';
}

function isFormationType(type) {
  return type === 'animation' || type === 'conception';
}

function missionFormHTML(m = {}) {
  const sessions = m.sessions || [{ date: isoToday(), heures: 7 }];
  const type = m.type || 'animation';
  const animation = isAnimation(type);

  // Entreprises sélectionnées (multi pour animation, single pour les autres)
  const selectedEntreprises = m.entreprises_ids?.length
    ? m.entreprises_ids
    : (m.entreprise_id ? [m.entreprise_id] : []);
  const singleEntrepriseId = selectedEntreprises[0] || '';

  return `
    <form id="form-mission" class="form-grid">
      <div class="form-group">
        <label>Intitulé *</label>
        <input type="text" name="intitule" value="${escHtml(m.intitule || '')}" required placeholder="Ex: Formation SST">
      </div>
      <div class="form-group form-group-half">
        <label>Type de prestation</label>
        <select name="type" id="select-type">
          ${MISSION_TYPES.map(t => `<option value="${t.value}" ${type === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group form-group-half">
        <label>Statut</label>
        <select name="statut">
          <option value="a_venir" ${m.statut === 'a_venir' ? 'selected' : ''}>À venir</option>
          <option value="en_cours" ${(m.statut || 'en_cours') === 'en_cours' ? 'selected' : ''}>En cours</option>
          <option value="terminee" ${m.statut === 'terminee' ? 'selected' : ''}>Terminée</option>
          <option value="annulee" ${m.statut === 'annulee' ? 'selected' : ''}>Annulée</option>
        </select>
      </div>

      <!-- Organisme : uniquement pour animation (optionnel) -->
      <div class="form-group" id="field-organisme" ${!animation ? 'style="display:none"' : ''}>
        <label>Organisme de formation
          <span style="color:var(--text-muted);font-weight:400"> — optionnel (laisser vide si mission directe)</span>
        </label>
        <select name="organisme_id" id="select-organisme">
          <option value="">— Aucun (mission directe entreprise) —</option>
          ${store.organismes.map(o => `<option value="${o.id}" ${m.organisme_id === o.id ? 'selected' : ''}>${escHtml(o.nom)}</option>`).join('')}
        </select>
      </div>

      <!-- Entreprises formées : multi-sélection pour animation -->
      <div class="form-group" id="field-entreprises-multi" ${!animation ? 'style="display:none"' : ''}>
        <label>Entreprises formées
          <span style="color:var(--text-muted);font-weight:400"> — sélection multiple (inter / intra)</span>
        </label>
        <div class="entreprises-checkboxes">
          ${store.entreprises.length === 0
            ? '<span style="color:var(--text-muted);font-size:0.85rem">Aucune entreprise enregistrée</span>'
            : store.entreprises.map(e => `
              <label class="entreprise-tag">
                <input type="checkbox" name="entreprises_ids" value="${e.id}" ${selectedEntreprises.includes(e.id) ? 'checked' : ''}>
                <span>${escHtml(e.nom)}</span>
              </label>`).join('')}
        </div>
      </div>

      <!-- Entreprise cliente : sélection unique pour les autres types -->
      <div class="form-group" id="field-entreprise-single" ${animation ? 'style="display:none"' : ''}>
        <label>Entreprise cliente</label>
        <select name="entreprise_single_id">
          <option value="">— Sélectionner —</option>
          ${store.entreprises.map(e => `<option value="${e.id}" ${singleEntrepriseId === e.id ? 'selected' : ''}>${escHtml(e.nom)}</option>`).join('')}
        </select>
      </div>

      <div class="form-group form-group-half">
        <label>Nombre de participants</label>
        <input type="number" name="participants" value="${m.participants || ''}" min="0">
      </div>
      <div class="form-group form-group-half">
        <label>Tarif journalier HT (€)</label>
        <input type="number" name="tarif_journalier" value="${m.tarif_journalier || ''}" min="0" step="0.01">
      </div>
      <div class="form-group">
        <label>Frais de déplacement HT (€)</label>
        <input type="number" name="frais_deplacement" value="${m.frais_deplacement || 0}" min="0" step="0.01">
      </div>

      <div class="form-group" id="specialite-group" ${!isFormationType(type) ? 'style="display:none"' : ''}>
        <label>Spécialité de formation (BPF)</label>
        <select name="specialite">
          <option value="">— Sélectionner —</option>
          ${SPECIALITES.map(s => `<option value="${s.code}" ${m.specialite === s.code ? 'selected' : ''}>${s.code} — ${s.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-section-title">Sessions / Jours d'intervention</div>
      <div id="sessions-container" class="form-group-full">
        ${sessions.map((s, i) => sessionRow(s, i)).join('')}
      </div>
      <div class="form-group-full">
        <button type="button" class="btn-secondary" id="btn-add-session">+ Ajouter une session</button>
      </div>

      <div class="form-section-title">Contrat signé</div>
      <div class="form-group-full" id="contrat-zone-wrap">
        ${contratZoneHTML(m.contrat)}
      </div>

      <div class="form-section-title">Fiche de présence</div>
      <div class="form-group-full" id="fiche-zone-wrap">
        ${ficheZoneHTML(m.fiche_presence)}
      </div>

      <div class="form-group form-group-full">
        <label>Notes internes</label>
        <textarea name="notes" rows="3">${escHtml(m.notes || '')}</textarea>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-secondary" id="btn-cancel">Annuler</button>
        <button type="submit" class="btn-primary">Enregistrer</button>
      </div>
    </form>`;
}

function sessionRow(s, i) {
  return `
    <div class="session-row" data-idx="${i}">
      <div class="form-group form-group-half">
        <label>Date</label>
        <input type="date" name="sessions[${i}][date]" value="${s.date || ''}" required>
      </div>
      <div class="form-group" style="max-width:160px">
        <label>Heures / jour</label>
        <input type="number" name="sessions[${i}][heures]" value="${s.heures || 7}" min="1" max="12" required>
      </div>
      <div class="form-group" style="justify-content:flex-end;padding-top:22px">
        <label class="session-distanciel-label">
          <input type="checkbox" name="sessions[${i}][distanciel]" value="true" ${s.distanciel ? 'checked' : ''}>
          <span>À distance</span>
        </label>
      </div>
      <div class="form-group" style="align-self:flex-end;margin-bottom:16px;max-width:40px">
        <button type="button" class="btn-icon btn-remove-session" data-idx="${i}" title="Supprimer">🗑️</button>
      </div>
    </div>`;
}

function contratZoneHTML(contrat) {
  if (contrat) {
    const dateLabel = contrat.uploaded_at ? formatDate(contrat.uploaded_at.split('T')[0]) : '';
    return `
      <div class="contrat-attached">
        <div class="contrat-icon">📄</div>
        <div class="contrat-info">
          <div class="contrat-filename">${escHtml(contrat.filename)}</div>
          ${dateLabel ? `<div class="contrat-meta">Ajouté le ${dateLabel}</div>` : ''}
        </div>
        <div class="contrat-actions">
          <a href="${contrat.web_view_link}" target="_blank" rel="noopener" class="btn-secondary btn-sm">👁 Consulter</a>
          <button type="button" class="btn-icon" id="btn-remove-contrat" title="Supprimer">🗑️</button>
        </div>
      </div>`;
  }
  return `
    <div class="contrat-dropzone" id="contrat-dropzone">
      <input type="file" id="contrat-file-input" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" hidden>
      <div class="dropzone-icon">📎</div>
      <p>Glissez-déposez le contrat signé ici</p>
      <p class="dropzone-sub">ou <span class="dropzone-link">cliquez pour parcourir</span> — PDF, image ou Word, 10 Mo max</p>
    </div>`;
}

function ficheZoneHTML(fiche) {
  if (fiche) {
    const dateLabel = fiche.uploaded_at ? formatDate(fiche.uploaded_at.split('T')[0]) : '';
    return `
      <div class="contrat-attached">
        <div class="contrat-icon">📋</div>
        <div class="contrat-info">
          <div class="contrat-filename">${escHtml(fiche.filename)}</div>
          ${dateLabel ? `<div class="contrat-meta">Ajoutée le ${dateLabel}</div>` : ''}
        </div>
        <div class="contrat-actions">
          <a href="${fiche.web_view_link}" target="_blank" rel="noopener" class="btn-secondary btn-sm">👁 Consulter</a>
          <button type="button" class="btn-icon" id="btn-remove-fiche" title="Supprimer">🗑️</button>
        </div>
      </div>`;
  }
  return `
    <div class="contrat-dropzone" id="fiche-dropzone">
      <input type="file" id="fiche-file-input" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" hidden>
      <div class="dropzone-icon">📋</div>
      <p>Glissez-déposez la fiche de présence ici</p>
      <p class="dropzone-sub">ou <span class="dropzone-link">cliquez pour parcourir</span> — PDF, image ou Word, 10 Mo max</p>
    </div>`;
}

let sessionCount = 1;
let currentContrat = null;
let currentFiche = null;

function openMissionForm(id = null) {
  const m = id ? store.missions.find(x => x.id === id) : null;
  sessionCount = m?.sessions?.length || 1;
  currentContrat = m?.contrat || null;
  currentFiche = m?.fiche_presence || null;
  showModal(id ? 'Modifier la mission' : 'Nouvelle mission', missionFormHTML(m || {}), 'modal-large');

  document.getElementById('btn-cancel')?.addEventListener('click', closeModal);
  bindContratZoneEvents();
  bindFicheZoneEvents();

  // Afficher/masquer les champs selon le type de prestation
  document.getElementById('select-type')?.addEventListener('change', e => {
    const type = e.target.value;
    const anim = isAnimation(type);
    const formation = isFormationType(type);
    document.getElementById('field-organisme').style.display        = anim ? '' : 'none';
    document.getElementById('field-entreprises-multi').style.display = anim ? '' : 'none';
    document.getElementById('field-entreprise-single').style.display = anim ? 'none' : '';
    document.getElementById('specialite-group').style.display        = formation ? '' : 'none';
  });

  document.getElementById('btn-add-session')?.addEventListener('click', () => {
    const container = document.getElementById('sessions-container');
    const div = document.createElement('div');
    div.innerHTML = sessionRow({ date: isoToday(), heures: 7 }, sessionCount++);
    container.appendChild(div.firstElementChild);
    attachRemoveSession();
  });

  attachRemoveSession();

  document.getElementById('form-mission')?.addEventListener('submit', async e => {
    e.preventDefault();
    await saveMissionForm(e.target, id);
  });
}

function attachRemoveSession() {
  document.querySelectorAll('.btn-remove-session').forEach(btn => {
    btn.onclick = () => {
      const row = btn.closest('.session-row');
      if (document.querySelectorAll('.session-row').length > 1) row.remove();
      else toast('Une mission doit avoir au moins une session', 'error');
    };
  });
}

function bindContratZoneEvents() {
  const dropzone = document.getElementById('contrat-dropzone');
  if (dropzone) {
    const input = document.getElementById('contrat-file-input');
    dropzone.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      if (input.files[0]) handleContratFile(input.files[0]);
    });
    dropzone.addEventListener('dragover', e => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) handleContratFile(file);
    });
  }

  document.getElementById('btn-remove-contrat')?.addEventListener('click', async () => {
    const ok = await confirm('Supprimer le contrat attaché à cette mission ?');
    if (!ok) return;
    if (currentContrat?.drive_id) {
      try { await deleteDriveFile(currentContrat.drive_id); } catch (e) { console.warn('Suppression Drive échouée:', e); }
    }
    currentContrat = null;
    refreshContratZone();
    toast('Contrat supprimé');
  });
}

function refreshContratZone() {
  const wrap = document.getElementById('contrat-zone-wrap');
  if (!wrap) return;
  wrap.innerHTML = contratZoneHTML(currentContrat);
  bindContratZoneEvents();
}

function bindFicheZoneEvents() {
  const dropzone = document.getElementById('fiche-dropzone');
  if (dropzone) {
    const input = document.getElementById('fiche-file-input');
    dropzone.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      if (input.files[0]) handleFicheFile(input.files[0]);
    });
    dropzone.addEventListener('dragover', e => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) handleFicheFile(file);
    });
  }

  document.getElementById('btn-remove-fiche')?.addEventListener('click', async () => {
    const ok = await confirm('Supprimer la fiche de présence attachée à cette mission ?');
    if (!ok) return;
    if (currentFiche?.drive_id) {
      try { await deleteDriveFile(currentFiche.drive_id); } catch (e) { console.warn('Suppression fiche Drive échouée:', e); }
    }
    currentFiche = null;
    refreshFicheZone();
    toast('Fiche de présence supprimée');
  });
}

function refreshFicheZone() {
  const wrap = document.getElementById('fiche-zone-wrap');
  if (!wrap) return;
  wrap.innerHTML = ficheZoneHTML(currentFiche);
  bindFicheZoneEvents();
}

async function handleFicheFile(file) {
  if (file.size > CONTRAT_MAX_SIZE) {
    toast('Fichier trop volumineux (10 Mo max)', 'error');
    return;
  }
  if (!CONTRAT_ALLOWED_TYPES.includes(file.type)) {
    toast('Format non supporté — utilisez un PDF, une image ou un document Word', 'error');
    return;
  }

  const wrap = document.getElementById('fiche-zone-wrap');
  wrap.innerHTML = `<div class="contrat-dropzone contrat-uploading"><div class="loading-spinner"></div><p>Envoi de la fiche…</p></div>`;

  try {
    const result = await uploadFiche(file.name, file, file.type);
    currentFiche = {
      drive_id: result.id,
      filename: file.name,
      web_view_link: result.webViewLink,
      mime_type: file.type,
      uploaded_at: new Date().toISOString(),
    };
    toast('Fiche de présence ajoutée ✓');
  } catch (e) {
    console.error('Upload fiche échoué:', e);
    toast('Erreur lors de l\'envoi de la fiche', 'error');
  }
  refreshFicheZone();
}

async function handleContratFile(file) {
  if (file.size > CONTRAT_MAX_SIZE) {
    toast('Fichier trop volumineux (10 Mo max)', 'error');
    return;
  }
  if (!CONTRAT_ALLOWED_TYPES.includes(file.type)) {
    toast('Format non supporté — utilisez un PDF, une image ou un document Word', 'error');
    return;
  }

  const wrap = document.getElementById('contrat-zone-wrap');
  wrap.innerHTML = `<div class="contrat-dropzone contrat-uploading"><div class="loading-spinner"></div><p>Envoi du contrat…</p></div>`;

  try {
    const result = await uploadContrat(file.name, file, file.type);
    currentContrat = {
      drive_id: result.id,
      filename: file.name,
      web_view_link: result.webViewLink,
      mime_type: file.type,
      uploaded_at: new Date().toISOString(),
    };
    toast('Contrat ajouté ✓');
  } catch (e) {
    console.error('Upload contrat échoué:', e);
    toast('Erreur lors de l\'envoi du contrat', 'error');
  }
  refreshContratZone();
}

async function saveMissionForm(form, id) {
  const fd = new FormData(form);
  const previousStatut = id ? store.missions.find(x => x.id === id)?.statut : null;

  const sessions = [];
  let i = 0;
  while (fd.has(`sessions[${i}][date]`)) {
    sessions.push({
      date: fd.get(`sessions[${i}][date]`),
      heures: parseInt(fd.get(`sessions[${i}][heures]`)) || 7,
      distanciel: fd.get(`sessions[${i}][distanciel]`) === 'true',
    });
    i++;
  }
  sessions.sort((a, b) => a.date.localeCompare(b.date));

  const type = fd.get('type');
  const anim = isAnimation(type);

  // Pour animation : organisme optionnel + multi-entreprises
  // Pour les autres : pas d'organisme + une seule entreprise
  const organisme_id = anim ? (fd.get('organisme_id') || null) : null;
  const entreprises_ids = anim
    ? fd.getAll('entreprises_ids')
    : (fd.get('entreprise_single_id') ? [fd.get('entreprise_single_id')] : []);

  const data = {
    intitule: fd.get('intitule'),
    type,
    statut: fd.get('statut'),
    organisme_id,
    entreprises_ids,
    participants: parseInt(fd.get('participants')) || 0,
    tarif_journalier: parseFloat(fd.get('tarif_journalier')) || 0,
    frais_deplacement: parseFloat(fd.get('frais_deplacement')) || 0,
    specialite: isFormationType(type) ? (fd.get('specialite') || '') : '',
    distanciel: sessions.some(s => s.distanciel),
    notes: fd.get('notes') || '',
    sessions,
    contrat: currentContrat,
    fiche_presence: currentFiche,
  };

  let savedMissionId;
  if (id) {
    const idx = store.missions.findIndex(x => x.id === id);
    store.missions[idx] = { ...store.missions[idx], ...data };
    savedMissionId = id;
  } else {
    savedMissionId = uuid();
    store.missions.push({ id: savedMissionId, created_at: new Date().toISOString(), ...data });
  }

  await saveMissions();

  // Sync Google Calendar
  try {
    const calendarId = store.settings.calendar_id;
    if (calendarId && calendarId !== 'primary') {
      const mission = store.missions.find(x => x.id === savedMissionId);
      const org = getOrganisme(mission.organisme_id);
      const entreprises = getMissionEntreprises(mission);
      const entLabel = entreprises.map(e => e.nom).join(', ') || 'Entreprise inconnue';
      const fakeEnt = { nom: entLabel };
      for (const session of sessions) {
        if (!session.calendar_event_id) {
          const ev = await createEvent(calendarId, session, mission, org, fakeEnt);
          session.calendar_event_id = ev.id;
        }
      }
      await saveMissions();
    }
  } catch (e) {
    console.warn('Calendar sync failed:', e);
    toast('Mission enregistrée (Google Calendar non synchronisé)', 'warning');
  }

  // Proposer de créer une facture si la mission vient d'être marquée terminée
  if (data.statut === 'terminee' && previousStatut !== 'terminee') {
    const existingFacture = store.factures.find(f => f.mission_id === savedMissionId);
    if (!existingFacture) {
      closeModal();
      const createInvoice = await confirm('Mission terminée. Souhaitez-vous créer la facture maintenant ?');
      if (createInvoice) {
        navigate('factures', { action: 'new', missionId: savedMissionId });
        return;
      }
      navigate('missions');
      toast('Mission enregistrée ✓');
      return;
    }
  }

  toast('Mission enregistrée ✓');
  closeModal();
  navigate('missions');
}

async function deleteMission(id) {
  const facture = getMissionFacture(id);
  if (facture) { toast('Cette mission a une facture associée. Supprimez la facture d\'abord.', 'error'); return; }
  const ok = await confirm('Supprimer cette mission définitivement ?');
  if (!ok) return;
  const mission = store.missions.find(m => m.id === id);
  if (mission?.contrat?.drive_id) {
    try { await deleteDriveFile(mission.contrat.drive_id); } catch (e) { console.warn('Suppression contrat Drive échouée:', e); }
  }
  if (mission?.fiche_presence?.drive_id) {
    try { await deleteDriveFile(mission.fiche_presence.drive_id); } catch (e) { console.warn('Suppression fiche Drive échouée:', e); }
  }
  store.missions = store.missions.filter(m => m.id !== id);
  await saveMissions();
  toast('Mission supprimée');
  navigate('missions');
}
