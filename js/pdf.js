import { store } from './data.js';
import { formatDate, formatCurrency } from './utils.js';
import { resolveInvoiceCustomer, invoiceTotals, sirenFrom, validateInvoice, complianceMessage } from './invoice-model.js';

const NAVY = '#172554';
const BLUE = '#3659D9';
const CYAN = '#39C6E8';
const INK = '#172033';
const BODY = '#445066';
const MUTED = '#68758B';
const LINE = '#DCE3EE';
const MIST = '#F5F7FB';
const WHITE = '#FFFFFF';
const MARGIN = 38;
const NO_BORDERS = {
  hLineWidth: () => 0, vLineWidth: () => 0,
  paddingLeft: () => 0, paddingRight: () => 0,
  paddingTop: () => 0, paddingBottom: () => 0,
};

function pdfCurrency(value) {
  return formatCurrency(value).replace(/[\u202f\u00a0]/g, ' ');
}

function clean(value) { return String(value || '').trim(); }
function compact(values) { return values.filter(Boolean); }

function row(text, options = {}) {
  return {
    text, fontSize: options.size || 8, color: options.color || BODY,
    bold: Boolean(options.bold), margin: [0, options.top || 1.5, 0, 0],
  };
}

function sectionLabel(text) {
  return { text, fontSize: 6.8, bold: true, characterSpacing: 1.25, color: BLUE };
}

function card(stack, fill = MIST, padding = [13, 11, 13, 11]) {
  return {
    table: { widths: ['*'], body: [[{ stack, fillColor: fill, border: [false, false, false, false], margin: padding }]] },
    layout: NO_BORDERS,
  };
}

function legalSellerName(settings) {
  const status = clean(settings.forme_juridique);
  const ei = /entrepreneur individuel|\bei\b/i.test(status) ? status : 'Entrepreneur individuel';
  return `${clean(settings.dirigeant)} - ${ei}`;
}

function clientAddress(customer) {
  return clean(customer.adresse_facturation) || clean(customer.adresse);
}

export async function buildInvoiceDefinition(facture, mission, { validate = true } = {}) {
  const validation = validateInvoice(facture, mission);
  if (validate && !validation.valid) throw new Error(complianceMessage(validation.errors));

  const settings = store.settings;
  const customer = validation.customer || resolveInvoiceCustomer(facture, mission) || {};
  const logo = settings.logo_base64 || null;
  const { lines, totalHT, vatRate, vatAmount, totalTTC } = invoiceTotals(facture, mission);
  const vatDue = vatRate > 0;
  const sellerSiren = sirenFrom(settings.siret);
  const buyerSiren = sirenFrom(customer.siret || customer.siren);
  const legal = settings.facturation || {};
  const isPaid = facture.statut === 'payee';

  const header = {
    columns: [
      {
        width: '*',
        columns: compact([
          logo ? { image: logo, fit: [108, 54], width: 116, margin: [0, 0, 12, 0] } : null,
          {
            stack: [
              { text: clean(settings.nom_commercial), fontSize: 13, bold: true, color: NAVY },
              { text: legalSellerName(settings), fontSize: 7.7, color: MUTED, margin: [0, 4, 0, 0] },
            ],
            width: '*', margin: [0, 7, 0, 0],
          },
        ]),
      },
      {
        width: 190, alignment: 'right',
        stack: [
          { text: 'FACTURE', fontSize: 23, bold: true, characterSpacing: 2.4, color: NAVY },
          { text: facture.numero, fontSize: 11, bold: true, color: BLUE, margin: [0, 5, 0, 0] },
          { text: `Emise le ${formatDate(facture.date_emission)}`, fontSize: 7.8, color: BODY, margin: [0, 5, 0, 0] },
          { text: `Echeance le ${formatDate(facture.date_echeance)}`, fontSize: 7.8, bold: true, color: NAVY, margin: [0, 2, 0, 0] },
        ],
      },
    ],
    columnGap: 22,
    margin: [0, 0, 0, 10],
  };

  const accent = {
    canvas: [
      { type: 'rect', x: 0, y: 0, w: 442, h: 2.2, color: BLUE },
      { type: 'rect', x: 442, y: 0, w: 77, h: 2.2, color: CYAN },
    ],
    margin: [0, 0, 0, 15],
  };

  const sellerLines = compact([
    row(legalSellerName(settings), { bold: true, color: INK, top: 6 }),
    row(clean(settings.nom_commercial)),
    row(clean(settings.adresse)),
    row(`${clean(settings.cp)} ${clean(settings.ville)}`.trim()),
    row(clean(settings.email), { color: BLUE, top: 3 }),
    row(clean(settings.tel)),
    row(`SIREN ${sellerSiren} - SIRET ${clean(settings.siret)}`, { size: 7.1, color: MUTED, top: 4 }),
    settings.tva_intracom ? row(`TVA intracommunautaire ${clean(settings.tva_intracom)}`, { size: 7.1, color: MUTED }) : null,
    settings.naf ? row(`Code NAF ${clean(settings.naf)}`, { size: 7.1, color: MUTED }) : null,
  ]);

  const buyerLines = compact([
    row(clean(customer.nom), { bold: true, color: INK, top: 6 }),
    row(clientAddress(customer)),
    row(`${clean(customer.cp_facturation || customer.cp)} ${clean(customer.ville_facturation || customer.ville)}`.trim()),
    customer.correspondant ? row(`A l'attention de ${clean(customer.correspondant)}`, { top: 4 }) : null,
    customer.email ? row(clean(customer.email), { color: BLUE }) : null,
    row(`SIREN ${buyerSiren} - SIRET ${clean(customer.siret)}`, { size: 7.1, color: MUTED, top: 4 }),
    customer.tva_intracom ? row(`TVA intracommunautaire ${clean(customer.tva_intracom)}`, { size: 7.1, color: MUTED }) : null,
  ]);

  const parties = {
    columns: [
      { ...card([sectionLabel('EMETTEUR'), ...sellerLines], WHITE, [0, 0, 12, 0]), width: '49%' },
      { ...card([sectionLabel('CLIENT FACTURE'), ...buyerLines], MIST), width: '49%' },
    ],
    columnGap: 14,
    margin: [0, 0, 0, 13],
  };

  const refs = compact([
    facture.reference_formation ? `Reference formation / ID PIPE : ${facture.reference_formation}` : null,
    facture.numero_bon_commande ? `Bon de commande : ${facture.numero_bon_commande}` : null,
  ]).join('   |   ');
  const subject = card(compact([
    {
      columns: [
        { ...sectionLabel('OBJET'), width: 42, margin: [0, 1, 0, 0] },
        { text: clean(mission.intitule) || 'Prestation de services', fontSize: 9.3, bold: true, color: INK, width: '*' },
        { text: 'PRESTATION DE SERVICES', fontSize: 6.5, bold: true, color: BLUE, alignment: 'right', width: 120 },
      ], columnGap: 8,
    },
    refs ? { text: refs, fontSize: 7.2, color: MUTED, margin: [50, 4, 0, 0] } : null,
  ]), MIST, [13, 10, 13, 10]);
  subject.margin = [0, 0, 0, 12];

  const th = (text, align = 'left') => ({
    text, fontSize: 6.6, bold: true, color: WHITE, alignment: align,
    fillColor: NAVY, margin: [8, 7, 8, 7],
  });
  const services = {
    table: {
      headerRows: 1, dontBreakRows: true, widths: ['*', 64, 84, 82],
      body: [
        [th('DESCRIPTION'), th('QUANTITE', 'center'), th('PRIX UNITAIRE HT', 'right'), th('TOTAL HT', 'right')],
        ...lines.map((line, index) => {
          const fill = index % 2 ? WHITE : MIST;
          return [
            {
              stack: compact([
                { text: line.description, fontSize: 8.3, bold: true, color: INK },
                line.subtitle ? { text: line.subtitle, fontSize: 7, color: MUTED, margin: [0, 3, 0, 0] } : null,
              ]), fillColor: fill, margin: [8, 8, 8, 8],
            },
            { text: `${line.quantity} ${line.unit}`, fontSize: 7.8, color: BODY, alignment: 'center', fillColor: fill, margin: [4, 8, 4, 8] },
            { text: pdfCurrency(line.unitPrice), fontSize: 7.8, color: BODY, alignment: 'right', fillColor: fill, margin: [4, 8, 4, 8] },
            { text: pdfCurrency(line.total), fontSize: 8.2, bold: true, color: BLUE, alignment: 'right', fillColor: fill, margin: [4, 8, 8, 8] },
          ];
        }),
      ],
    },
    layout: { hLineColor: () => LINE, vLineWidth: () => 0, hLineWidth: i => i > 1 ? 0.5 : 0 },
    margin: [0, 0, 0, 13],
  };

  const paymentStack = compact([
    sectionLabel('REGLEMENT'),
    row(clean(settings.mode_paiement) || 'Virement bancaire', { bold: true, color: INK, top: 6 }),
    settings.banque ? row(clean(settings.banque)) : null,
    settings.iban ? row(`IBAN ${clean(settings.iban)}`, { size: 7.4 }) : null,
    settings.bic ? row(`BIC ${clean(settings.bic)}`, { size: 7.4 }) : null,
    row(`Date limite de paiement : ${formatDate(facture.date_echeance)}`, { bold: true, color: INK, top: 5 }),
  ]);

  const totalRow = (label, value, strong = false) => ({
    table: {
      widths: ['*', 'auto'],
      body: [[
        { text: label, fontSize: strong ? 7.4 : 7.7, bold: strong, color: strong ? WHITE : MUTED, fillColor: strong ? NAVY : MIST, margin: [11, strong ? 10 : 7, 8, strong ? 10 : 7], border: [false, false, false, false] },
        { text: value, fontSize: strong ? 13 : 8.6, bold: true, color: strong ? WHITE : INK, alignment: 'right', fillColor: strong ? NAVY : MIST, margin: [8, strong ? 8 : 7, 11, strong ? 8 : 7], border: [false, false, false, false] },
      ]],
    },
    layout: NO_BORDERS,
    margin: [0, 0, 0, 4],
  });
  const totalsStack = [
    totalRow('TOTAL HT', pdfCurrency(totalHT)),
    totalRow(vatDue ? `TVA ${vatRate} %` : 'TVA', vatDue ? pdfCurrency(vatAmount) : 'Non applicable'),
    totalRow('NET A PAYER', pdfCurrency(totalTTC), true),
    !vatDue ? { text: legal.mention_tva || 'TVA non applicable, art. 293 B du CGI', fontSize: 6.7, color: MUTED, alignment: 'right', margin: [0, 4, 0, 0] } : null,
    vatDue && legal.tva_sur_debits ? { text: "Option pour le paiement de la taxe d'après les débits", fontSize: 6.7, color: MUTED, alignment: 'right', margin: [0, 4, 0, 0] } : null,
  ].filter(Boolean);

  const payment = {
    columns: [
      { ...card(paymentStack, MIST), width: '*' },
      { text: '', width: 14 },
      { stack: totalsStack, width: 222 },
    ],
    columnGap: 0,
    margin: [0, 0, 0, 12],
  };

  const terms = card([
    sectionLabel('CONDITIONS DE REGLEMENT'),
    { text: `Escompte : ${legal.escompte}. Penalites de retard : ${legal.penalites_taux}. Indemnite forfaitaire pour frais de recouvrement en cas de retard de paiement : ${Number(legal.indemnite_recouvrement || 40)} EUR.`, fontSize: 6.9, color: BODY, lineHeight: 1.25, margin: [0, 5, 0, 0] },
    settings.nda ? { text: `Declaration d'activite enregistree sous le numero ${clean(settings.nda)}. Cet enregistrement ne vaut pas agrement de l'Etat.`, fontSize: 6.8, color: MUTED, margin: [0, 4, 0, 0] } : null,
  ].filter(Boolean), WHITE, [0, 0, 0, 0]);

  return {
    pageSize: 'A4',
    pageMargins: [MARGIN, 30, MARGIN, 34],
    defaultStyle: { font: 'Roboto', fontSize: 8, color: BODY, lineHeight: 1.18 },
    ...(isPaid ? { watermark: { text: 'PAYEE', color: BLUE, opacity: 0.075, bold: true, fontSize: 76, angle: -30 } } : {}),
    footer: currentPage => ({
      columns: [
        { text: `Facture ${facture.numero} - ${clean(settings.nom_commercial)}`, fontSize: 6.4, color: MUTED },
        { text: `Page ${currentPage}`, fontSize: 6.4, color: MUTED, alignment: 'right' },
      ],
      margin: [MARGIN, 8, MARGIN, 0],
    }),
    content: [header, accent, parties, subject, services, payment, terms],
  };
}

export async function generateInvoicePDF(facture, mission, options = {}) {
  const definition = await buildInvoiceDefinition(facture, mission, options);
  return new Promise(resolve => pdfMake.createPdf(definition).getBlob(resolve));
}
