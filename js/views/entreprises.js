import { store, saveEntreprises } from '../data.js';
import { uuid, toast, escHtml, confirm } from '../utils.js';
import { showModal, closeModal } from '../app.js';

export function render() {
  return `
    <div class="view-header">
      <h2>Entreprises formées</h2>
      <button class="btn-primary" id="btn-new-entreprise">+ Nouvelle entreprise</button>
    </div>
    <div class="glass-card">
      ${store.entreprises.length === 0
        ? '<p class="empty-state">Aucune entreprise enregistrée.</p>'
        : `<div class="table-wrapper"><table class="data-table">
            <thead><tr>
              <th>Nom</th><th>Adresse</th><th>SIRET</th><th>Actions</th>
            </tr></thead>
            <tbody>
              ${store.entreprises.map(e => `
                <tr>
                  <td><strong>${escHtml(e.nom)}</strong></td>
                  <td>${escHtml([e.adresse, e.cp, e.ville].filter(Boolean).join(', ') || '—')}</td>
                  <td>${escHtml(e.siret || '—')}</td>
                  <td class="actions">
                    <button class="btn-icon btn-edit" data-id="${e.id}" title="Modifier">✏️</button>
                    <button class="btn-icon btn-delete" data-id="${e.id}" title="Supprimer">🗑️</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table></div>`}
    </div>`;
}

export function init() {
  document.getElementById('btn-new-entreprise')?.addEventListener('click', () => openForm());
  document.querySelectorAll('.btn-edit[data-id]').forEach(btn =>
    btn.addEventListener('click', () => openForm(btn.dataset.id)));
  document.querySelectorAll('.btn-delete[data-id]').forEach(btn =>
    btn.addEventListener('click', () => deleteEntreprise(btn.dataset.id)));
}

function entreprise_form(e = {}) {
  return `
    <form id="form-entreprise" class="form-grid">
      <div class="form-group">
        <label>Nom de l'entreprise *</label>
        <input type="text" name="nom" value="${escHtml(e.nom || '')}" required>
      </div>
      <div class="form-group">
        <label>Adresse</label>
        <input type="text" name="adresse" value="${escHtml(e.adresse || '')}">
      </div>
      <div class="form-group form-group-half">
        <label>Code postal</label>
        <input type="text" name="cp" value="${escHtml(e.cp || '')}">
      </div>
      <div class="form-group form-group-half">
        <label>Ville</label>
        <input type="text" name="ville" value="${escHtml(e.ville || '')}">
      </div>
      <div class="form-group">
        <label>SIRET</label>
        <input type="text" name="siret" value="${escHtml(e.siret || '')}">
      </div>
      <div class="form-group">
        <label>Email de facturation</label>
        <input type="email" name="email" value="${escHtml(e.email || '')}">
      </div>
      <div class="form-group">
        <label>N° TVA intracommunautaire <span style="font-weight:400;color:var(--text-muted)">(si attribué)</span></label>
        <input type="text" name="tva_intracom" value="${escHtml(e.tva_intracom || '')}" placeholder="FRXX123456789">
      </div>
      <div class="form-group">
        <label>Adresse de facturation <span style="font-weight:400;color:var(--text-muted)">(si différente)</span></label>
        <input type="text" name="adresse_facturation" value="${escHtml(e.adresse_facturation || '')}">
      </div>
      <div class="form-group form-group-half">
        <label>CP de facturation</label>
        <input type="text" name="cp_facturation" value="${escHtml(e.cp_facturation || '')}">
      </div>
      <div class="form-group form-group-half">
        <label>Ville de facturation</label>
        <input type="text" name="ville_facturation" value="${escHtml(e.ville_facturation || '')}">
      </div>
      <div class="form-group">
        <label>ID client Pennylane <span style="font-weight:400;color:var(--text-muted)">(facultatif)</span></label>
        <input type="number" name="pennylane_customer_id" value="${escHtml(e.pennylane_customer_id || '')}" placeholder="Ex : 29359435">
      </div>
      <div class="form-actions">
        <button type="button" class="btn-secondary" id="btn-cancel">Annuler</button>
        <button type="submit" class="btn-primary">Enregistrer</button>
      </div>
    </form>`;
}

function openForm(id = null) {
  const e = id ? store.entreprises.find(x => x.id === id) : {};
  showModal(id ? 'Modifier l\'entreprise' : 'Nouvelle entreprise', entreprise_form(e || {}));

  document.getElementById('btn-cancel')?.addEventListener('click', closeModal);
  document.getElementById('form-entreprise')?.addEventListener('submit', async ev => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const data = Object.fromEntries(fd.entries());
    if (id) {
      const idx = store.entreprises.findIndex(x => x.id === id);
      store.entreprises[idx] = { ...store.entreprises[idx], ...data };
    } else {
      store.entreprises.push({ id: uuid(), ...data });
    }
    await saveEntreprises();
    toast('Entreprise enregistrée');
    closeModal();
    import('../app.js').then(app => app.navigate('entreprises'));
  });
}

async function deleteEntreprise(id) {
  const used = store.missions.some(m => m.entreprise_id === id);
  if (used) { toast('Cette entreprise est utilisée dans une mission', 'error'); return; }
  const ok = await confirm('Supprimer cette entreprise ?');
  if (!ok) return;
  store.entreprises = store.entreprises.filter(e => e.id !== id);
  await saveEntreprises();
  toast('Entreprise supprimée');
  import('../app.js').then(app => app.navigate('entreprises'));
}
