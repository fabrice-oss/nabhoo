// Run: node tests/pennylane.cjs — all HTTP calls are mocked, no credentials needed.
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = readFileSync(join(__dirname, '../js/api/pennylane.js'), 'utf8')
  .replace(/^import .*;$/gm, '').replace(/export async function/g, 'async function');
function setup(options = {}) {
  const requests = [];
  let saves = 0;
  const facture = { id: 'test-001', numero: 'TEST-001', date_emission: '2026-09-10', date_echeance: '2026-10-25', tva_taux: options.rate ?? 0 };
  const mission = { organisme_id: 'org', intitule: 'Test', sessions: Array.from({length:5}, () => ({date:'2026-09-10'})), tarif_journalier:400, frais_deplacement:50 };
  const store = { settings: { pennylane_token: 'FAKE-TEST-TOKEN', facturation: { tva_taux: 0 } }, organismes: [{ id: 'org', pennylane_customer_id: options.customer ?? '123' }], factures: [facture] };
  const context = vm.createContext({ store, saveFactures: async () => { saves++; }, generateInvoicePDF: async () => new Blob(['test']), Blob, FormData, console: {log(){},error(){},warn(){}}, fetch: async (url, request = {}) => {
    requests.push({ url, request });
    const attachment = url.endsWith('/appendices');
    const status = attachment ? options.attachmentStatus ?? 201 : options.status ?? 201;
    const data = request.method === 'POST' ? options.payload ?? {id:42} : attachment ? {items:[{id:7}]} : {id:42,draft:options.draft ?? true,currency_amount:'2050.00'};
    return { ok: status < 400, status, json: async () => data };
  }});
  vm.runInContext(source, context);
  return { context, requests, facture, mission, store, saves: () => saves, send: () => context.sendFactureToPennylane(facture, mission) };
}
(async () => {
  for (const [rate, code] of [[0,'exempt'],[20,'FR_200'],[10,'FR_100'],[8.5,'FR_85'],[5.5,'FR_55'],[2.1,'FR_21']]) {
    const t = setup({rate}); await t.send();
    const body = JSON.parse(t.requests[0].request.body);
    assert.equal(body.draft,true);
    assert.equal(body.external_reference,'nabhoo-test-001');
    assert.equal(body.invoice_lines.length,2);
    for (const line of body.invoice_lines) {
      for(const field of ['label','raw_currency_unit_price','unit','vat_rate','quantity']) assert.ok(field in line);
      assert.equal(line.vat_rate,code);
      assert.equal(line.unit,'piece');
    }
    assert.equal(body.invoice_lines[0].raw_currency_unit_price,'2000.00');
    assert.equal(body.invoice_lines[1].raw_currency_unit_price,'50.00');
    assert.equal(t.facture.pennylane_id,42);
    assert.equal(t.facture.pennylane_pdf_attached,true);
    await t.send(); assert.equal(t.requests.length,2,'No duplicate on retry');
  }
  for(const rate of [7,'invalid',-1]) {
    const t = setup({rate}); await assert.rejects(t.send()); assert.equal(t.requests.length,0);
  }
  for(const customer of ['123abc','',-1,'9007199254740992']) {
    const t=setup({customer}); await assert.rejects(t.send()); assert.equal(t.requests.length,0);
  }
  const denied=setup({status:403,payload:{error:'Missing scope'}});
  await assert.rejects(denied.send(), /403.*Missing scope/); assert.equal(denied.saves(),0);
  const invalid=setup({status:400,payload:{message:'Invalid payload',code:'NotAnyOf'}});
  await assert.rejects(invalid.send(),/400.*NotAnyOf/);
  const missing=setup({payload:{}}); await assert.rejects(missing.send(),/sans identifiant/);
  const pdf=setup({attachmentStatus:403});
  assert.match((await pdf.send()).nabhoo_warning,/403/);
  assert.equal(pdf.facture.pennylane_id,42); assert.equal(pdf.facture.pennylane_pdf_attached,undefined);
  await pdf.send(); assert.equal(pdf.requests.filter(x=>x.url.endsWith('/customer_invoices')).length,1);
  const parallel=setup();
  const outcomes=await Promise.allSettled([parallel.send(),parallel.send()]);
  assert.equal(outcomes.filter(x=>x.status==='rejected').length,1);
  const verify=setup(); assert.equal((await verify.context.verifyPennylaneDraft(42)).amount,'2050.00');
  const final=setup({draft:false}); await assert.rejects(final.context.verifyPennylaneDraft(42),/pas un brouillon/);
  console.log('20 scénarios réussis : schéma, TVA, montants, validation, doublons, erreurs API/PDF et vérification distante simulée. Aucun appel réseau réel.');
})().catch(e=>{ console.error(e); process.exitCode=1; });
