import { store, saveFactures } from '../data.js';
import { generateInvoicePDF } from '../pdf.js';

const PROXY = 'https://nabhoo-pennylane.fabriceavrila.workers.dev';
const BASE  = `${PROXY}/api/external/v2`;

function getToken() {
  return store.settings.pennylane_token || '';
}

// Codes TVA Pennylane (format FR_XXX où XXX = taux × 10)
// TVA 0% (exempt art. 293 B) → pas de champ vat_rate envoyé
function vatCode(taux) {
  const t = Number(taux || 0);
  if (t === 20)  return 'FR_200';
  if (t === 10)  return 'FR_100';
  if (t === 8.5) return 'FR_85';
  if (t === 5.5) return 'FR_55';
  if (t === 2.1) return 'FR_21';
  return null; // 0% = TVA non applicable → omettre le champ
}

export async function sendFactureToPennylane(facture, mission) {
  const token = getToken();
  if (!token) throw new Error('Token Pennylane non configuré — rendez-vous dans Paramètres.');

  const s   = store.settings;
  const org = store.organismes.find(o => o.id === mission.organisme_id) || {};

  const customerId = parseInt(org.pennylane_customer_id, 10);
  if (isNaN(customerId)) throw new Error('ID client Pennylane manquant — renseignez-le dans la fiche organisme.');

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
      label: `Animation de formation : ${mission.intitule || 'Formation'}${sessionDates ? ' — Sessions : ' + sessionDates : ''} (${nb} j × ${tarif} €)`,
      raw_currency_unit_price: String((nb * tarif).toFixed(2)),
    };
    if (vat) line.vat_rate = vat;
    invoiceLines.push(line);
  }

  if (mission.frais_deplacement > 0) {
    const line = {
      label: 'Frais de déplacement',
      raw_currency_unit_price: String(Number(mission.frais_deplacement).toFixed(2)),
    };
    if (vat) line.vat_rate = vat;
    invoiceLines.push(line);
  }

  if (invoiceLines.length === 0) throw new Error('Aucune ligne de facturation à envoyer.');

  // ── Corps de la requête (schéma DRAFT CUSTOMER INVOICE) ──────────────────
  const body = {
    date:          facture.date_emission,
    deadline:      facture.date_echeance,
    customer_id:   customerId,
    draft:         true,
    currency:      'EUR',
    invoice_lines: invoiceLines,
  };

  if (tauxTVA === 0 && s.facturation?.mention_tva) {
    body.special_mention = s.facturation.mention_tva;
  }

  // ── 1. Créer la facture draft via JSON ───────────────────────────────────
  const res = await fetch(`${BASE}/customer_invoices`, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err.message || (err.errors && JSON.stringify(err.errors)) || `Pennylane ${res.status}`;
    throw new Error(msg);
  }

  const data      = await res.json();
  const invoiceId = data.invoice?.id || data.id;

  // ── 2. Attacher le PDF NABHOO en appendice ───────────────────────────────
  if (invoiceId) {
    try {
      const pdfBlob = await generateInvoicePDF(facture, mission);
      const fdPdf   = new FormData();
      fdPdf.append('file', pdfBlob, `${facture.numero}.pdf`);

      await fetch(`${BASE}/customer_invoices/${invoiceId}/appendices`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fdPdf,
      });
    } catch (pdfErr) {
      console.warn('[Pennylane] PDF non joint :', pdfErr);
    }
  }

  // ── 3. Stocker l'ID dans la facture NABHOO ───────────────────────────────
  const idx = store.factures.findIndex(f => f.id === facture.id);
  if (idx !== -1) {
    store.factures[idx].pennylane_id      = invoiceId || null;
    store.factures[idx].pennylane_sent_at = new Date().toISOString();
    await saveFactures();
  }

  return data;
}
