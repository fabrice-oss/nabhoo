import { store, saveFactures } from '../data.js';
import { generateFacturXML } from '../facturx.js';
import { generateInvoicePDF } from '../pdf.js';

// Proxy Cloudflare Worker — remplace l'appel direct bloqué par CORS
// Mettre à jour après déploiement : https://nabhoo-pennylane.TON_COMPTE.workers.dev
const PROXY = 'https://nabhoo-pennylane.fabriceavrila.workers.dev';
const BASE  = `${PROXY}/api/external/v2`;

function getToken() {
  return store.settings.pennylane_token || '';
}

export async function sendFactureToPennylane(facture, mission) {
  const token = getToken();
  if (!token) throw new Error('Token Pennylane non configuré — rendez-vous dans Paramètres.');

  // 1. Génère le XML Factur-X (EN 16931)
  const xml = generateFacturXML(facture, mission);
  const xmlBlob = new Blob([xml], { type: 'application/xml' });

  // 2. Génère le PDF
  const pdfBlob = await generateInvoicePDF(facture, mission);

  // 3. Embed XML dans le PDF via pdf-lib (si disponible), sinon envoie XML seul
  let fileToSend = xmlBlob;
  let filename   = 'factur-x.xml';

  if (window.PDFLib) {
    try {
      const pdfBytes = await pdfBlob.arrayBuffer();
      const xmlBytes = new TextEncoder().encode(xml);
      const pdfDoc   = await window.PDFLib.PDFDocument.load(pdfBytes);
      await pdfDoc.attach(xmlBytes, 'factur-x.xml', {
        mimeType: 'application/xml',
        description: 'Factur-X EN 16931',
        creationDate: new Date(),
        modificationDate: new Date(),
      });
      const combined = await pdfDoc.save();
      fileToSend = new Blob([combined], { type: 'application/pdf' });
      filename   = `${facture.numero}.pdf`;
    } catch (e) {
      console.warn('pdf-lib embedding échoué, envoi XML seul :', e);
    }
  }

  // 4. Envoi multipart/form-data
  const org = store.organismes.find(o => o.id === mission.organisme_id) || {};
  const fd = new FormData();
  fd.append('file', fileToSend, filename);
  if (org.pennylane_customer_id) {
    const customerId = parseInt(org.pennylane_customer_id, 10);
    if (!isNaN(customerId)) {
      fd.append('invoice_options', JSON.stringify({ customer_id: customerId }));
    }
  }

  const res = await fetch(`${BASE}/customer_invoices/e_invoices/imports`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Pennylane ${res.status}`);
  }

  const data = await res.json();

  // 5. Stocke l'ID Pennylane dans la facture
  const idx = store.factures.findIndex(f => f.id === facture.id);
  if (idx !== -1) {
    store.factures[idx].pennylane_id      = data.invoice?.id || data.id || null;
    store.factures[idx].pennylane_sent_at = new Date().toISOString();
    await saveFactures();
  }

  return data;
}
