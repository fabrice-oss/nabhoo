// Tous les appels HTTP sont simulés : aucune facture réelle n'est créée.
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = readFileSync(join(__dirname, '../js/api/pennylane.js'), 'utf8')
  .replace(/^import .*;$/gm, '')
  .replace(/export async function/g, 'async function');

function setup(options = {}) {
  const requests = [];
  let saves = 0;
  const facture = {
    id: 'test-001', numero: 'AF-2026-001', client_type: 'organisme', client_id: 'org',
    date_emission: '2026-09-10', date_echeance: '2026-10-25', montant_ht: 2050,
    tva_taux: options.rate ?? 0,
  };
  const mission = { organisme_id: 'org', intitule: 'Formation test' };
  const customer = { id: 'org', nom: 'Client Test', pennylane_customer_id: options.customer ?? '123' };
  const lines = [
    { description: 'Formation test', quantity: 5, unitPrice: 400, total: 2000, pennylaneUnit: 'day' },
    { description: 'Frais de déplacement', quantity: 1, unitPrice: 50, total: 50, pennylaneUnit: 'piece' },
  ];
  const rate = Number(facture.tva_taux);
  const vatAmount = Math.round(2050 * rate) / 100;
  const store = {
    settings: { pennylane_token: 'FAKE-TOKEN', facturation: { tva_taux: rate } },
    organismes: [customer], entreprises: [], factures: [facture],
  };
  const context = vm.createContext({
    store,
    saveFactures: async () => { saves += 1; },
    generateInvoicePDF: async () => new Blob(['%PDF-test'], { type: 'application/pdf' }),
    invoiceTotals: () => ({ lines, totalHT: 2050, vatRate: rate, vatAmount, totalTTC: 2050 + vatAmount }),
    resolveInvoiceCustomer: () => customer,
    Blob, FormData, Set, Number, Math, Date, JSON, String, Error,
    console: { log() {}, warn() {}, error() {} },
    fetch: async (url, request = {}) => {
      requests.push({ url, request });
      if (url.endsWith('/file_attachments')) {
        const status = options.uploadStatus ?? 201;
        return response(status, options.uploadPayload ?? { id: 77 });
      }
      if (url.endsWith('/customer_invoices/import')) {
        const status = options.importStatus ?? 201;
        return response(status, options.importPayload ?? { id: 42, status: 'imported' });
      }
      if (request.method !== 'POST' && url.includes('/customer_invoices/')) {
        return response(200, { id: 42, currency_amount: String(2050 + vatAmount), schematron_validation_status: 'valid', factur_x: true });
      }
      if (url.endsWith('/appendices')) return response(200, { items: [{ id: 9 }] });
      return response(201, { id: 88, draft: true });
    },
  });
  vm.runInContext(source, context);
  return { context, requests, facture, mission, saves: () => saves, send: () => context.sendFactureToPennylane(facture, mission) };
}

function response(status, payload) {
  return { ok: status < 400, status, json: async () => payload };
}

(async () => {
  const basic = setup();
  const result = await basic.send();
  assert.equal(result.id, 42);
  assert.equal(basic.requests.length, 2);
  assert.ok(basic.requests[0].url.endsWith('/file_attachments'));
  assert.ok(basic.requests[1].url.endsWith('/customer_invoices/import'));
  const body = JSON.parse(basic.requests[1].request.body);
  assert.equal(body.file_attachment_id, 77);
  assert.equal(body.convert_to_e_invoice, true);
  assert.equal(body.import_as_incomplete, false);
  assert.equal(body.external_reference, 'nabhoo-test-001');
  assert.equal(body.invoice_number, 'AF-2026-001');
  assert.equal(body.currency_amount_before_tax, '2050.00');
  assert.equal(body.currency_amount, '2050.00');
  assert.equal(body.invoice_lines.reduce((sum, line) => sum + Number(line.currency_amount), 0), 2050);
  for (const line of body.invoice_lines) {
    for (const field of ['label', 'currency_amount', 'currency_tax', 'raw_currency_unit_price', 'unit', 'vat_rate', 'quantity', 'substance']) assert.ok(field in line);
    assert.equal(line.vat_rate, 'exempt');
    assert.equal(line.substance, 'services');
  }
  assert.equal(basic.facture.pennylane_file_attachment_id, 77);
  assert.equal(basic.facture.pennylane_id, 42);
  assert.equal(basic.facture.pennylane_imported, true);
  assert.equal(basic.saves(), 2);
  await basic.send();
  assert.equal(basic.requests.length, 2, 'Une relance ne doit créer aucun doublon');

  const vat = setup({ rate: 20 });
  await vat.send();
  const vatBody = JSON.parse(vat.requests[1].request.body);
  assert.equal(vatBody.currency_tax, '410.00');
  assert.equal(vatBody.currency_amount, '2460.00');
  assert.equal(vatBody.invoice_lines.reduce((sum, line) => sum + Number(line.currency_amount), 0), 2460);
  assert.equal(vatBody.invoice_lines.reduce((sum, line) => sum + Number(line.currency_tax), 0), 410);

  for (const [rate, code] of [[10, 'FR_100'], [8.5, 'FR_085'], [5.5, 'FR_055'], [2.1, 'FR_021']]) {
    const test = setup({ rate });
    await test.send();
    assert.equal(JSON.parse(test.requests[1].request.body).invoice_lines[0].vat_rate, code);
  }

  const badCustomer = setup({ customer: '123abc' });
  await assert.rejects(badCustomer.send(), /ID client Pennylane invalide/);
  assert.equal(badCustomer.requests.length, 0);

  const uploadError = setup({ uploadStatus: 403, uploadPayload: { message: 'Missing file_attachments:all' } });
  await assert.rejects(uploadError.send(), /403.*Missing file_attachments:all/);
  assert.equal(uploadError.saves(), 0);

  const importError = setup({ importStatus: 422, importPayload: { message: 'Entry lines are not balanced' } });
  await assert.rejects(importError.send(), /422.*not balanced/);
  assert.equal(importError.facture.pennylane_file_attachment_id, 77);
  assert.equal(importError.saves(), 1);
  await assert.rejects(importError.send());
  assert.equal(importError.requests.filter(request => request.url.endsWith('/file_attachments')).length, 1, 'Le PDF ne doit pas être téléversé deux fois');

  const parallel = setup();
  const outcomes = await Promise.allSettled([parallel.send(), parallel.send()]);
  assert.equal(outcomes.filter(outcome => outcome.status === 'rejected').length, 1);

  const verified = setup();
  const verification = await verified.context.verifyPennylaneImport(42);
  assert.equal(verification.schematron, 'valid');
  assert.equal(verification.facturX, true);

  console.log('Tests Pennylane réussis : PDF personnalisé, import Factur-X, TVA, équilibre, reprise, anti-doublon et vérification. Aucun appel réseau réel.');
})().catch(error => { console.error(error); process.exitCode = 1; });
