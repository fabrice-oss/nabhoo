import { store } from './data.js';
import { formatDate, formatCurrency } from './utils.js';

// ── Correctif caractères : Intl 'fr-FR' insère U+202F / U+00A0 comme
// séparateur de milliers. La police Roboto embarquée dans pdfmake ne contient
// pas ces glyphes → rendu \x00 dans le PDF. On les remplace par une espace.
function pdfCurrency(n) {
  return formatCurrency(n)
    .replace(/ /g, ' ')
    .replace(/ /g, ' ');
}

// Le logo posé sur le bandeau bleu nuit est celui de l'ORGANISME émetteur,
// pas celui de NABHOO : on ne lit que store.settings.logo_base64. Pas de
// repli sur assets/logo.png — c'est le logo NABHOO, noir, illisible sur navy.
// Sans logo réglé, le bandeau n'affiche que le nom commercial en blanc.
async function getLogoDataUrl() {
  return store.settings.logo_base64 || null;
}

// ══════════════════════════════════════════════════════════════════════════════
// PALETTE — reprise du logo AVRILA (bleu nuit, bleu roi, cyan, orange)
// ══════════════════════════════════════════════════════════════════════════════
const NAVY       = '#0B2A5B'; // bandeau, pied de page, ligne net à payer
const NAVY_MID   = '#123C7E'; // en-tête du tableau des prestations
const BLUE       = '#1A63D8'; // libellés de section, totaux de ligne
const CYAN       = '#35D3EF'; // accent : mot FACTURE, montant à payer
const ORANGE     = '#FF9D4D'; // échéance sur fond bleu nuit
const MIST       = '#EEF3F9'; // aplat clair : bloc client, objet, totaux
const TILE       = '#F7FAFD'; // aplat très clair : lignes, bloc règlement
const INK        = '#0B2A5B'; // titres
const BODY       = '#3E5578'; // texte courant
const MUTED      = '#5A6B85'; // libellés secondaires (contraste 4.5:1)
const FAINT      = '#5E7290'; // identifiants légaux en petit corps
const ON_NAVY    = '#FFFFFF';
const ON_NAVY_2  = '#8FB4E8';

const PAGE_W  = 595.28;       // A4 en points
const MARGIN  = 42;           // marge latérale
const MARGIN_T = 34;          // marge haute (le bandeau la déborde)
const NO_BORDERS = { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 };

// Un aplat de couleur pleine largeur intérieure, sans filet
function block(stack, fill, pad) {
  return {
    table: { widths: ['*'], body: [[{ stack, fillColor: fill, border: [false, false, false, false], margin: pad }]] },
    layout: NO_BORDERS,
  };
}

function label(text, color) {
  return { text, fontSize: 6.75, bold: true, characterSpacing: 1.65, color };
}

export async function generateInvoicePDF(facture, mission) {
  const s    = store.settings;
  const org  = store.organismes.find(o => o.id === mission.organisme_id) || {};
  const logo = await getLogoDataUrl();

  const lignes  = buildLignes(facture, mission);
  const totalHT = lignes.reduce((sum, l) => sum + l.total, 0);
  const isPaid  = facture.statut === 'payee';

  // TVA : 0 ou absent → franchise art. 293 B. Sinon on calcule.
  const tauxTVA   = Number(facture.tva_taux ?? s.facturation?.tva_taux ?? 0);
  const tvaDue    = tauxTVA > 0;
  const montantTVA = tvaDue ? totalHT * tauxTVA / 100 : 0;
  const netAPayer = totalHT + montantTVA;

  // ════════════════════════════════════════════════════════════════════════════
  // 1. BANDEAU BLEU NUIT — déborde les marges pour toucher les bords de page
  // ════════════════════════════════════════════════════════════════════════════
  const identite = {
    columns: [
      logo
        ? { image: logo, fit: [40.5, 40.5], width: 46 }
        : { text: '', width: 0 },   // sans logo : le nom commercial porte l'identité
      {
        stack: [
          { text: (s.nom_commercial || 'AVRILA FORMATION').toUpperCase(), fontSize: 12, bold: true, characterSpacing: 1.8, color: ON_NAVY },
          { text: `ORGANISME DE FORMATION${s.nda ? '  ·  NDA ' + s.nda : ''}`, fontSize: 7.5, characterSpacing: 0.85, color: ON_NAVY_2, margin: [0, 4, 0, 0] },
        ],
        width: '*',
        margin: [6, 5, 0, 0],
      },
    ],
    columnGap: 0,
    width: '*',
  };

  const numeroBloc = {
    stack: [
      { text: 'FACTURE', fontSize: 8.25, bold: true, characterSpacing: 3.4, color: CYAN, alignment: 'right' },
      { text: facture.numero || '', fontSize: 21.75, bold: true, characterSpacing: 0.4, color: ON_NAVY, alignment: 'right', margin: [0, 5, 0, 0] },
    ],
    width: 'auto',
  };

  const dateCell = (lbl, value, color) => ({
    stack: [
      { text: lbl, fontSize: 6.75, bold: true, characterSpacing: 1.5, color: ON_NAVY_2 },
      { text: value, fontSize: 9.75, bold: true, color, margin: [0, 5, 0, 0] },
    ],
    width: 'auto',
  });

  const bandeau = block([
    { columns: [identite, numeroBloc], columnGap: 24 },
    {
      columns: [
        {
          columns: [
            dateCell('ÉMISE LE', formatDate(facture.date_emission), ON_NAVY),
            dateCell('ÉCHÉANCE', formatDate(facture.date_echeance), ORANGE),
            { text: '', width: '*' },
          ],
          columnGap: 26,
          width: '*',
        },
        {
          stack: [
            { text: 'NET À PAYER', fontSize: 6.75, bold: true, characterSpacing: 1.8, color: ON_NAVY_2, alignment: 'right' },
            { text: pdfCurrency(netAPayer), fontSize: 28.5, bold: true, color: CYAN, alignment: 'right', margin: [0, 4, 0, 0] },
          ],
          width: 'auto',
        },
      ],
      columnGap: 24,
      margin: [0, 22, 0, 0],
    },
  ], NAVY, [MARGIN, 34.5, MARGIN, 24]);
  bandeau.margin = [-MARGIN, -MARGIN_T, -MARGIN, 28];

  // ════════════════════════════════════════════════════════════════════════════
  // 2. ÉMETTEUR (à plat) / FACTURÉ À (aplat clair)
  // ════════════════════════════════════════════════════════════════════════════
  const line = (text, opts = {}) => ({ text, fontSize: opts.size || 8.25, color: opts.color || BODY, bold: !!opts.bold, margin: [0, opts.top || 1.5, 0, 0] });

  const emetteur = {
    stack: [
      label('ÉMETTEUR', BLUE),
      { text: s.nom_commercial || 'AVRILA FORMATION', fontSize: 10.5, bold: true, color: INK, margin: [0, 7, 0, 4] },
      ...[
        s.dirigeant       ? line(s.dirigeant) : null,
        s.adresse         ? line(s.adresse) : null,
        (s.cp || s.ville) ? line(`${s.cp || ''} ${s.ville || ''}`.trim()) : null,
        s.email           ? line(s.email, { color: BLUE, top: 4 }) : null,
        s.tel             ? line(s.tel) : null,
        s.siret           ? line(`SIRET ${s.siret}`, { size: 7.1, color: FAINT, top: 7 }) : null,
        s.naf             ? line(`Code NAF ${s.naf}`, { size: 7.1, color: FAINT }) : null,
      ].filter(Boolean),
    ],
    width: '48%',
  };

  const client = {
    ...block([
      label('FACTURÉ À', BLUE),
      { text: org.nom || '', fontSize: 10.5, bold: true, color: INK, margin: [0, 7, 0, 4] },
      ...[
        org.adresse           ? line(org.adresse) : null,
        (org.cp || org.ville) ? line(`${org.cp || ''} ${org.ville || ''}`.trim()) : null,
        org.correspondant     ? line(`À l'att. de ${org.correspondant}`, { top: 6 }) : null,
        org.email             ? line(org.email, { color: BLUE }) : null,
        org.siret             ? line(`SIRET ${org.siret}`, { size: 7.1, color: FAINT, top: 7 }) : null,
      ].filter(Boolean),
    ], MIST, [16, 15, 16, 16]),
    width: '48%',
  };

  const adresses = { columns: [emetteur, { text: '', width: '4%' }, client], columnGap: 0, margin: [0, 0, 0, 20] };

  // ════════════════════════════════════════════════════════════════════════════
  // 3. OBJET
  // ════════════════════════════════════════════════════════════════════════════
  const objetTexte = `${mission.intitule || 'Formation'}${org.nom ? ' — ' + org.nom : ''}`;
  const objet = block([
    {
      columns: [
        { ...label('OBJET', BLUE), width: 36, margin: [0, 2, 0, 0] },
        { text: objetTexte, fontSize: 9.75, bold: true, color: INK, width: '*' },
      ],
      columnGap: 12,
    },
    ...(facture.reference_formation ? [{
      columns: [
        { text: '', width: 36 },
        { text: `Réf. ${facture.reference_formation}`, fontSize: 7.5, color: MUTED, width: '*' },
      ],
      columnGap: 12,
      margin: [0, 4, 0, 0],
    }] : []),
  ], MIST, [16, 12, 16, 12]);
  objet.margin = [0, 0, 0, 20];

  // ════════════════════════════════════════════════════════════════════════════
  // 4. TABLEAU DES PRESTATIONS
  // ════════════════════════════════════════════════════════════════════════════
  const th = (text, align, pad) => ({ text, fontSize: 6.75, bold: true, characterSpacing: 1.05, color: ON_NAVY, alignment: align, fillColor: NAVY_MID, margin: pad });

  const prestations = {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: ['*', 84, 69, 84],
      body: [
        [
          th('DESCRIPTION', 'left', [12, 9, 12, 9]),
          th('PRIX UNITAIRE', 'right', [6, 9, 6, 9]),
          th('QUANTITÉ', 'center', [6, 9, 6, 9]),
          th('TOTAL', 'right', [6, 9, 12, 9]),
        ],
        ...lignes.map((l, i) => {
          const bg = i % 2 === 0 ? TILE : '#FFFFFF';
          return [
            {
              stack: [
                { text: l.description, fontSize: 9, bold: true, color: INK },
                l.subtitle ? { text: l.subtitle, fontSize: 7.5, color: MUTED, margin: [0, 4, 0, 0], lineHeight: 1.3 } : null,
              ].filter(Boolean),
              fillColor: bg, margin: [12, 12, 12, 12],
            },
            { text: pdfCurrency(l.prix_unitaire), fontSize: 8.6, color: '#26364F', alignment: 'right', fillColor: bg, margin: [6, 12, 6, 12] },
            { text: `${l.quantite} ${l.unite}`,   fontSize: 8.6, color: '#26364F', alignment: 'center', fillColor: bg, margin: [6, 12, 6, 12] },
            { text: pdfCurrency(l.total), fontSize: 9.4, bold: true, color: BLUE, alignment: 'right', fillColor: bg, margin: [6, 12, 12, 12] },
          ];
        }),
      ],
    },
    layout: NO_BORDERS,
    margin: [0, 0, 0, 24],
  };

  // ════════════════════════════════════════════════════════════════════════════
  // 5. RÈGLEMENT + TOTAUX
  // ════════════════════════════════════════════════════════════════════════════
  const reglementLines = [
    label('RÈGLEMENT', BLUE),
    { text: s.mode_paiement || 'Par virement bancaire', fontSize: 9, bold: true, color: INK, margin: [0, 7, 0, 5] },
  ];
  if (s.banque) reglementLines.push({ text: s.banque, fontSize: 7.5, color: BODY, margin: [0, 1.5, 0, 0], lineHeight: 1.35 });
  if (s.iban)   reglementLines.push({ text: `IBAN ${s.iban}`, fontSize: 7.5, color: BODY, margin: [0, 1.5, 0, 0] });
  if (s.bic)    reglementLines.push({ text: `BIC ${s.bic}`, fontSize: 7.5, color: BODY, margin: [0, 1.5, 0, 0] });

  const reglement = { ...block(reglementLines, TILE, [16, 15, 16, 16]), width: '*' };

  const totalRow = (lbl, value, opts = {}) => ({
    table: {
      widths: ['*', 'auto'],
      body: [[
        { text: lbl, fontSize: opts.big ? 7.5 : 7.9, bold: !!opts.big, characterSpacing: opts.big ? 1.35 : 0.3, color: opts.labelColor, fillColor: opts.fill, border: [false, false, false, false], margin: [12, opts.big ? 12 : 9, 8, opts.big ? 12 : 9] },
        { text: value, fontSize: opts.valueSize || 9, bold: true, color: opts.valueColor, fillColor: opts.fill, alignment: 'right', border: [false, false, false, false], margin: [8, opts.big ? 11 : 9, 12, opts.big ? 11 : 9] },
      ]],
    },
    layout: NO_BORDERS,
    margin: [0, 0, 0, 6],
  });

  const totauxStack = [
    totalRow('TOTAL HT', pdfCurrency(totalHT), { fill: MIST, labelColor: MUTED, valueColor: INK }),
    tvaDue
      ? totalRow(`TVA ${tauxTVA} %`, pdfCurrency(montantTVA), { fill: MIST, labelColor: MUTED, valueColor: INK })
      : totalRow('TVA', 'Non applicable', { fill: MIST, labelColor: MUTED, valueColor: MUTED, valueSize: 8.25 }),
    totalRow('NET À PAYER', pdfCurrency(netAPayer), { fill: NAVY, labelColor: ON_NAVY_2, valueColor: CYAN, valueSize: 14.25, big: true }),
  ];
  if (!tvaDue) {
    totauxStack.push({
      text: s.facturation?.mention_tva || 'TVA non applicable, art. 293 B du CGI',
      fontSize: 6.75, color: FAINT, alignment: 'right', margin: [0, 2, 0, 0],
    });
  }

  const bas = { columns: [reglement, { text: '', width: 18 }, { stack: totauxStack, width: 225 }], columnGap: 0 };

  // ════════════════════════════════════════════════════════════════════════════
  // 6. DOCUMENT
  // ════════════════════════════════════════════════════════════════════════════
  const piedTexte = [
    "Facture générée par l'application NABHOO créé par AVRILA STUDIO",
    'Conditions générales de vente disponibles sur le site de l\'organisme',
  ].join('  ·  ');

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [MARGIN, MARGIN_T, MARGIN, 46],
    defaultStyle: { font: 'Roboto', fontSize: 8.25, color: BODY, lineHeight: 1.22 },

    ...(isPaid ? { watermark: { text: 'PAYÉE', color: BLUE, opacity: 0.09, bold: true, fontSize: 78, angle: -32 } } : {}),

    // Pied de page : bandeau bleu nuit pleine largeur, sans filet
    footer: () => ({
      table: {
        widths: [PAGE_W],
        body: [[{
          text: piedTexte,
          fontSize: 6.75, color: ON_NAVY_2, alignment: 'center', characterSpacing: 0.4,
          fillColor: NAVY, border: [false, false, false, false], margin: [MARGIN, 10, MARGIN, 10],
        }]],
      },
      layout: NO_BORDERS,
      margin: [0, 6, 0, 0],
    }),

    content: [bandeau, adresses, objet, prestations, bas],
  };

  return new Promise((resolve) => {
    pdfMake.createPdf(docDefinition).getBlob(resolve);
  });
}

// ── Construction des lignes de facturation ───────────────────────────────────
function buildLignes(facture, mission) {
  const lignes   = [];
  const sessions = mission.sessions || [];
  const nb       = sessions.length;
  const tarif    = mission.tarif_journalier || 0;

  const dates = sessions.map(s =>
    new Date(s.date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  );
  // « 3, 4, 7, 8 et 9 septembre 2026 » plutôt qu'une énumération répétitive
  const sessionDates = dates.length > 1
    ? dates.slice(0, -1).join(', ') + ' et ' + dates[dates.length - 1]
    : dates[0] || '';

  if (nb > 0 && tarif > 0) {
    lignes.push({
      description:   `Animation de formation : ${mission.intitule || 'Formation'}`,
      subtitle:      sessionDates ? `Sessions : ${sessionDates}` : '',
      quantite:      nb,
      unite:         nb > 1 ? 'jours' : 'jour',
      prix_unitaire: tarif,
      total:         nb * tarif,
    });
  }

  if (mission.frais_deplacement > 0) {
    lignes.push({
      description:   'Frais de déplacement',
      subtitle:      'Remboursement forfaitaire',
      quantite:      1,
      unite:         'forfait',
      prix_unitaire: mission.frais_deplacement,
      total:         mission.frais_deplacement,
    });
  }

  return lignes;
}
