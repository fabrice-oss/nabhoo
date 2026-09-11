import { store, saveOrganismes } from '../data.js';
import { uuid, toast, escHtml, confirm, formatDate } from '../utils.js';
import { showModal, closeModal } from '../app.js';
import { uploadOrganismeDoc, deleteDriveFile } from '../api/drive.js';

const DOC_MAX_SIZE = 10 * 1024 * 1024;
const DOC_ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

let currentDoc = null;

export function render() {
  return `
    <div class="view-header">
      <h2>Organismes de formation</h2>
      <button class="btn-primary" id="btn-new-organisme">+ Nouvel organisme</button>
    </div>
    <div class="glass-card">
      ${store.organismes.length === 0
        ? '<p class="empty-state">Aucun organisme. Ajoutez votre premier partenaire.</p>'
        : `<div class="table-wrapper"><table class="data-table">
            <thead><tr>
              <th>Nom</th><th>Correspondant</th><th>Email</th><th>Téléphone</th><th>SIRET</th><th>Document</th><th>Actions</th>
            </tr></thead>
            <tbody>
              ${store.organismes.map(o => `
                <tr>
                  <td><strong>${escHtml(o.nom)}</strong></td>
                  <td>${escHtml(o.correspondant || '—')}</td>
                  <td>${o.email ? `<a href="mailto:${escHtml(o.email)}">${escHtml(o.email)}</a>` : '—'}</td>
                  <td>${escHtml(o.tel || '—')}</td>
                  <td>${escHtml(o.siret || '—')}</td>
                  <td>${o.document
                    ? `<a href="${o.document.web_view_link}" target="_blank" rel="noopener" class="meta-link" title="${escHtml(o.document.filename)}">📎 ${escHtml(o.document.filename)}</a>`
                    : '—'}</td>
                  <td class="actions">
                    <button class="btn-icon btn-edit" data-id="${o.id}" title="Modifier">✏️</button>
                    <button class="btn-icon btn-delete" data-id="${o.id}" title="Supprimer">🗑️</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table></div>`}
    </div>`;
}

export function init() {
  document.getElementById('btn-new-organisme')?.addEventListener('click', () => openForm());
  document.querySelectorAll('.btn-edit[data-id]').forEach(btn =>
    btn.addEventListener('click', () => openForm(btn.dataset.id)));
  document.querySelectorAll('.btn-delete[data-id]').forEach(btn =>
    btn.addEventListener('click', () => deleteOrganisme(btn.dataset.id)));
}

function docZoneHTML(doc) {
  if (doc) {
    const dateLabel = doc.uploaded_at ? formatDate(doc.uploaded_at.split('T')[0]) : '';
    return `
      <div class="contrat-attached">
        <div class="contrat-icon">📎</div>
        <div class="contrat-info">
          <div class="contrat-filename">${escHtml(doc.filename)}</div>
          ${dateLabel ? `<div class="contrat-meta">Ajouté le ${dateLabel}</div>` : ''}
        </div>
        <div class="contrat-actions">
          <a href="${doc.web_view_link}" target="_blank" rel="noopener" class="btn-secondary btn-sm">👁 Consulter</a>
          <button type="button" class="btn-icon" id="btn-remove-doc" title="Supprimer">🗑️</button>
        </div>
      </div>`;
  }
  return `
    <div class="contrat-dropzone" id="doc-dropzone">
      <input type="file" id="doc-file-input" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" hidden>
      <div class="dropzone-icon">📎</div>
      <p>Glissez-déposez un document ici</p>
      <p class="dropzone-sub">ou <span class="dropzone-link">cliquez pour parcourir</span> — PDF, image ou Word, 10 Mo max</p>
    </div>`;
}

function organisme_form(o = {}) {
  return `
    <form id="form-organisme" class="form-grid">
      <div class="form-group">
        <label>Nom de l'organisme *</label>
        <input type="text" name="nom" value="${escHtml(o.nom || '')}" required>
      </div>
      <div class="form-group">
        <label>Correspondant</label>
        <input type="text" name="correspondant" value="${escHtml(o.correspondant || '')}">
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" name="email" value="${escHtml(o.email || '')}">
      </div>
      <div class="form-group">
        <label>Téléphone</label>
        <input type="tel" name="tel" value="${escHtml(o.tel || '')}">
      </div>
      <div class="form-group">
        <label>Adresse</label>
        <input type="text" name="adresse" value="${escHtml(o.adresse || '')}">
      </div>
      <div class="form-group form-group-half">
        <label>Code postal</label>
        <input type="text" name="cp" value="${escHtml(o.cp || '')}">
      </div>
      <div class="form-group form-group-half">
        <label>Ville</label>
        <input type="text" name="ville" value="${escHtml(o.ville || '')}">
      </div>
      <div class="form-group">
        <label>SIRET</label>
        <input type="text" name="siret" value="${escHtml(o.siret || '')}">
      </div>
      <div class="form-group">
        <label>N° TVA intracommunautaire <span style="font-weight:400;color:var(--text-muted)">(si attribué)</span></label>
        <input type="text" name="tva_intracom" value="${escHtml(o.tva_intracom || '')}" placeholder="FRXX123456789">
      </div>
      <div class="form-group">
        <label>Adresse de facturation <span style="font-weight:400;color:var(--text-muted)">(si différente)</span></label>
        <input type="text" name="adresse_facturation" value="${escHtml(o.adresse_facturation || '')}">
      </div>
      <div class="form-group form-group-half">
        <label>CP de facturation</label>
        <input type="text" name="cp_facturation" value="${escHtml(o.cp_facturation || '')}">
      </div>
      <div class="form-group form-group-half">
        <label>Ville de facturation</label>
        <input type="text" name="ville_facturation" value="${escHtml(o.ville_facturation || '')}">
      </div>
      <div class="form-group">
        <label>ID client Pennylane <span style="font-weight:400;color:var(--text-muted)">(facultatif — liaison facturation électronique)</span></label>
        <input type="number" name="pennylane_customer_id" value="${escHtml(o.pennylane_customer_id || '')}" placeholder="Ex : 29359435 (nombre entier)">
      </div>
      <div class="form-section-title">Document</div>
      <div class="form-group-full" id="doc-zone-wrap">
        ${docZoneHTML(o.document)}
      </div>
      <div class="form-actions">
        <button type="button" class="btn-secondary" id="btn-cancel">Annuler</button>
        <button type="submit" class="btn-primary">Enregistrer</button>
      </div>
    </form>`;
}

function openForm(id = null) {
  const o = id ? store.organismes.find(x => x.id === id) : {};
  currentDoc = o?.document || null;
  showModal(id ? 'Modifier l\'organisme' : 'Nouvel organisme', organisme_form(o || {}));

  document.getElementById('btn-cancel')?.addEventListener('click', closeModal);
  bindDocZoneEvents();

  document.getElementById('form-organisme')?.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = { ...Object.fromEntries(fd.entries()), document: currentDoc };

    if (id) {
      const idx = store.organismes.findIndex(x => x.id === id);
      store.organismes[idx] = { ...store.organismes[idx], ...data };
    } else {
      store.organismes.push({ id: uuid(), ...data });
    }
    await saveOrganismes();
    toast('Organisme enregistré');
    closeModal();
    import('../app.js').then(app => app.navigate('organismes'));
  });
}

function bindDocZoneEvents() {
  const dropzone = document.getElementById('doc-dropzone');
  if (dropzone) {
    const input = document.getElementById('doc-file-input');
    dropzone.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { if (input.files[0]) handleDocFile(input.files[0]); });
    dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files[0]) handleDocFile(e.dataTransfer.files[0]);
    });
  }
  document.getElementById('btn-remove-doc')?.addEventListener('click', async () => {
    const ok = await confirm('Supprimer le document attaché à cet organisme ?');
    if (!ok) return;
    if (currentDoc?.drive_id) {
      try { await deleteDriveFile(currentDoc.drive_id); } catch (e) { console.warn('Suppression Drive échouée:', e); }
    }
    currentDoc = null;
    refreshDocZone();
    toast('Document supprimé');
  });
}

function refreshDocZone() {
  const wrap = document.getElementById('doc-zone-wrap');
  if (!wrap) return;
  wrap.innerHTML = docZoneHTML(currentDoc);
  bindDocZoneEvents();
}

async function handleDocFile(file) {
  if (file.size > DOC_MAX_SIZE) { toast('Fichier trop volumineux (10 Mo max)', 'error'); return; }
  if (!DOC_ALLOWED_TYPES.includes(file.type)) { toast('Format non supporté — PDF, image ou Word', 'error'); return; }

  const wrap = document.getElementById('doc-zone-wrap');
  wrap.innerHTML = `<div class="contrat-dropzone contrat-uploading"><div class="loading-spinner"></div><p>Envoi du document…</p></div>`;

  try {
    const result = await uploadOrganismeDoc(file.name, file, file.type);
    currentDoc = {
      drive_id: result.id,
      filename: file.name,
      web_view_link: result.webViewLink,
      mime_type: file.type,
      uploaded_at: new Date().toISOString(),
    };
    toast('Document ajouté ✓');
  } catch (e) {
    console.error('Upload document échoué:', e);
    toast('Erreur lors de l\'envoi du document', 'error');
  }
  refreshDocZone();
}

async function deleteOrganisme(id) {
  const used = store.missions.some(m => m.organisme_id === id);
  if (used) { toast('Cet organisme est utilisé dans une mission', 'error'); return; }
  const ok = await confirm('Supprimer cet organisme ?');
  if (!ok) return;
  const o = store.organismes.find(x => x.id === id);
  if (o?.document?.drive_id) {
    try { await deleteDriveFile(o.document.drive_id); } catch (e) { console.warn('Suppression document Drive échouée:', e); }
  }
  store.organismes = store.organismes.filter(o => o.id !== id);
  await saveOrganismes();
  toast('Organisme supprimé');
  import('../app.js').then(app => app.navigate('organismes'));
}
