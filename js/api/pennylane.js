import { store, saveFactures } from '../data.js';
import { generateInvoicePDF } from '../pdf.js';

const PROXY = 'https://nabhoo-pennylane.fabriceavrila.workers.dev';
const BASE  = `${PROXY}/api/external/v2`;
const pending = new Set();

function getToken() {
  return store.settings.pennylane_token || '';
}

export async function verifyPennylaneDraft(id) {
  const headers = { Authorization: `Bearer ${getToken()}` };
  const invoice = await fetch(`${BASE}/customer_invoices/${id}`, { headers });
  if (!invoice.ok) throw new Error(`Vérification du brouillon : HTTP ${invoice.status}`);
  const data = await invoice.json();
  if (data.draft !== true) throw new Error('Le document Pennylane n’est pas un brouillon : ne pas poursuivre le test.');
  const attachments = await fetch(`${BASE}/customer_invoices/${id}/appendices`, { headers });
  if (!attachments.ok) throw new Error(`Vérification PDF : HTTP ${attachments.status}`);
  const files = await attachments.json();
  if (!files.items?.length) throw new Error('Aucun PDF confirmé dans Pennylane.');
  return { amount: data.currency_amount || data.amount };
}

// Codes TVA Pennylane (format FR_XXX où XXX = taux × 10)
// Les lignes standard exigent un code TVA, même sans TVA facturée.
function vatCode(taux) {
  const t = Number(taux);
  if (t === 0) return 'exempt';
  if (t === 20)  return 'FR_200';
  if (t === 10)  return 'FR_100';
  if (t === 8.5) return 'FR_85';
  if (t === 5.5) return 'FR_55';
  if (t === 2.1) return 'FR_21';
  throw new Error(`Taux de TVA non pris en charge par l’intégration Pennylane : ${taux}. Vérifiez la facture.`);
}

export async function sendFactureToPennylane(facture, mission) {
  if (pending.has(facture.id)) throw new Error('Envoi déjà en cours pour cette facture.');
  pending.add(facture.id);
  try {
    return await sendDraft(facture, mission);
  } finally {
    pending.delete(facture.id);
  }
}

async function sendDraft(facture, mission) {
  const token = getToken();
  if (!token) throw new Error('Token Pennylane non configuré — rendez-vous dans Paramètres.');

  const s   = store.settings;
  const org = store.organismes.find(o => o.id === mission.organisme_id) || {};

  const customerId = Number(org.pennylane_customer_id);
  if (!Number.isSafeInteger(customerId) || customerId <= 0) throw new Error('ID client Pennylane invalide — renseignez-le dans la fiche organisme.');

  const sessions = mission.sessions || [];
  const nb       = sessions.length;
  const tarif    = mission.tarif_journalier || 0;
  const tauxTVA  = Number(facture.tva_taux ?? s.facturation?.tva_taux ?? 0);
  const vat      = vatCode(tauxTVA);

  // ── Lignes (qty toujours 1, prix = total de la ligne) ───────────────────
  const invoiceLines = [];

  if (nb > 0 && tarif > 0) {
    const dates = sessions.map(s =>
      new Date(s.date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    );
    const sessionDates = dates.length > 1
      ? dates.slice(0, -1).join(', ') + ' et ' + dates[dates.length - 1]
      : (dates[0] || '');

    const line = {
      label: `Animation de formation : ${mission.intitule || 'Formation'} (${nb} j x ${tarif} EUR)`,
      quantity:                  1,
      unit:                      'piece',
      vat_rate:                  vat,
      raw_currency_unit_price:   String((nb * tarif).toFixed(2)),
    };
    invoiceLines.push(line);
  }

  if (mission.frais_deplacement > 0) {
    const line = {
      label:                   'Frais de deplacement',
      quantity:                1,
      unit:                    'piece',
      vat_rate:                vat,
      raw_currency_unit_price: String(Number(mission.frais_deplacement).toFixed(2)),
    };
    invoiceLines.push(line);
  }

  if (invoiceLines.length === 0) throw new Error('Aucune ligne de facturation à envoyer.');

  // ── Corps de la requête (schéma DRAFT CUSTOMER INVOICE) ──────────────────
  const body = {
    date:          facture.date_emission,
    deadline:      facture.date_echeance,
    customer_id:   customerId,
    draft:         true,
    invoice_lines: invoiceLines,
    external_reference: `nabhoo-${facture.id}`,
    pdf_invoice_subject: facture.numero,
  };

  // Ne pas recréer une facture dont l'identifiant est déjà connu.
  let data = { id: facture.pennylane_id };
  if (!facture.pennylane_id) {
    const res = await fetch(`${BASE}/customer_invoices`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.message || err.error || (err.errors && JSON.stringify(err.errors)) || 'Requête refusée';
      throw new Error(`Pennylane ${res.status}${err.code ? ` (${err.code})` : ''} : ${msg}`);
    }

    data = await res.json();
  }
  const invoiceId = data.invoice?.id || data.id;
  if (!invoiceId) throw new Error('Réponse Pennylane sans identifiant. Vérifiez Pennylane avant toute nouvelle tentative.');

  const idx = store.factures.findIndex(f => f.id === facture.id);
  facture.pennylane_id = invoiceId;
  if (idx !== -1) {
    store.factures[idx].pennylane_id = invoiceId;
    store.factures[idx].pennylane_sent_at = new Date().toISOString();
    // Sauvegarder avant la pièce jointe pour permettre une reprise sans doublon.
    await saveFactures();
  }

  // ── 2. Attacher le PDF NABHOO en appendice ───────────────────────────────
  if (!facture.pennylane_pdf_attached) {
    try {
      const pdfBlob = await generateInvoicePDF(facture, mission);
      const fdPdf   = new FormData();
      fdPdf.append('file', pdfBlob, `${facture.numero}.pdf`);

      const attachment = await fetch(`${BASE}/customer_invoices/${invoiceId}/appendices`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fdPdf,
      });
      if (!attachment.ok) {
        const err = await attachment.json().catch(() => ({}));
        throw new Error(`PDF : HTTP ${attachment.status} — ${err.message || err.error || 'Pièce jointe refusée'}`);
      }
      facture.pennylane_pdf_attached = true;
      if (idx !== -1) {
        store.factures[idx].pennylane_pdf_attached = true;
        await saveFactures();
      }
    } catch (pdfErr) {
      data.nabhoo_warning = `Brouillon Pennylane ${invoiceId} conservé, mais pièce jointe non confirmée : ${pdfErr.message}`;
    }
  }

  return data;
}
