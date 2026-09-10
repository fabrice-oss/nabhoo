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
      const { PDFDocument, AFRelationship, PDFName } = window.PDFLib;
      const pdfBytes = await pdfBlob.arrayBuffer();
      const xmlBytes = new TextEncoder().encode(xml);
      const pdfDoc   = await PDFDocument.load(pdfBytes);

      // Embed XML avec AFRelationship=Data (requis Factur-X)
      await pdfDoc.attach(xmlBytes, 'factur-x.xml', {
        mimeType: 'application/xml',
        description: 'Factur-X EN 16931',
        creationDate: new Date(),
        modificationDate: new Date(),
        afRelationship: AFRelationship?.Data,
      });
      console.log('[FX] attach OK — AFRelationship:', AFRelationship?.Data);

      // XMP metadata PDF/A-3b + Factur-X (best-effort, n'annule pas l'envoi si ça échoue)
      try {
        const xmpData = [
          '<?xpacket begin="\xef\xbb\xbf" id="W5M0MpCehiHzreSzNTczkc9d"?>',
          '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
          '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
          '<rdf:Description rdf:about=""',
          '    xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"',
          '    xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">',
          '<pdfaid:part>3</pdfaid:part>',
          '<pdfaid:conformance>B</pdfaid:conformance>',
          '<fx:DocumentType>INVOICE</fx:DocumentType>',
          '<fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>',
          '<fx:Version>1.0</fx:Version>',
          '<fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>',
          '</rdf:Description>',
          '</rdf:RDF>',
          '</x:xmpmeta>',
          '<?xpacket end="w"?>',
        ].join('\n');
        const xmpBytes = new TextEncoder().encode(xmpData);
        const metaStream = pdfDoc.context.flateStream(xmpBytes, {
          Type: PDFName.of('Metadata'),
          Subtype: PDFName.of('XML'),
        });
        const metaRef = pdfDoc.context.register(metaStream);
        pdfDoc.catalog.set(PDFName.of('Metadata'), metaRef);
        console.log('[FX] XMP metadata OK');
      } catch (xmpErr) {
        console.warn('[FX] XMP metadata échouée (PDF envoyé sans XMP) :', xmpErr);
      }

      const combined = await pdfDoc.save();
      fileToSend = new Blob([combined], { type: 'application/pdf' });
      filename   = `${facture.numero}.pdf`;
      console.log('[FX] PDF final :', combined.byteLength, 'bytes');
    } catch (e) {
      console.warn('[FX] pdf-lib échoué, envoi XML seul :', e);
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
