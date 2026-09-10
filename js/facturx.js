import { store } from './data.js';

function isoToFx(iso) {
  return iso ? iso.replace(/-/g, '') : '';
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(n) {
  return Number(n || 0).toFixed(2);
}

export function generateFacturXML(facture, mission) {
  const s   = store.settings;
  const org = store.organismes.find(o => o.id === mission.organisme_id) || {};

  const sessions = mission.sessions || [];
  const nb       = sessions.length;
  const tarif    = mission.tarif_journalier || 0;

  const tauxTVA    = Number(facture.tva_taux ?? s.facturation?.tva_taux ?? 0);
  const tvaDue     = tauxTVA > 0;
  const catCode    = tvaDue ? 'S' : 'E';

  // ── Lignes ──────────────────────────────────────────────────────────────────
  const lignes = [];

  if (nb > 0 && tarif > 0) {
    const dates = sessions.map(s =>
      new Date(s.date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    );
    const sessionDates = dates.length > 1
      ? dates.slice(0, -1).join(', ') + ' et ' + dates[dates.length - 1]
      : dates[0] || '';
    lignes.push({
      id: 1,
      name: `Animation de formation : ${mission.intitule || 'Formation'}`,
      note: sessionDates ? `Sessions : ${sessionDates}` : '',
      qty: nb,
      unit: 'DAY',
      unitPrice: tarif,
      total: nb * tarif,
    });
  }

  if (mission.frais_deplacement > 0) {
    lignes.push({
      id: lignes.length + 1,
      name: 'Frais de déplacement',
      note: 'Remboursement forfaitaire',
      qty: 1,
      unit: 'C62',
      unitPrice: mission.frais_deplacement,
      total: mission.frais_deplacement,
    });
  }

  const totalHT    = lignes.reduce((sum, l) => sum + l.total, 0);
  const montantTVA = tvaDue ? totalHT * tauxTVA / 100 : 0;
  const netAPayer  = totalHT + montantTVA;

  const lineItems = lignes.map(l => `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>${l.id}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:Name>${esc(l.name)}</ram:Name>
        ${l.note ? `<ram:Description>${esc(l.note)}</ram:Description>` : ''}
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>
          <ram:ChargeAmount>${fmt(l.unitPrice)}</ram:ChargeAmount>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="${l.unit}">${l.qty}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>${catCode}</ram:CategoryCode>
          <ram:RateApplicablePercent>${fmt(tauxTVA)}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${fmt(l.total)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`).join('');

  const sellerAddr = [
    s.adresse ? `<ram:LineOne>${esc(s.adresse)}</ram:LineOne>` : '',
    s.cp      ? `<ram:PostcodeCode>${esc(s.cp)}</ram:PostcodeCode>` : '',
    s.ville   ? `<ram:CityName>${esc(s.ville)}</ram:CityName>` : '',
    '<ram:CountryID>FR</ram:CountryID>',
  ].join('');

  const buyerAddr = [
    org.adresse           ? `<ram:LineOne>${esc(org.adresse)}</ram:LineOne>` : '',
    org.cp                ? `<ram:PostcodeCode>${esc(org.cp)}</ram:PostcodeCode>` : '',
    org.ville             ? `<ram:CityName>${esc(org.ville)}</ram:CityName>` : '',
    '<ram:CountryID>FR</ram:CountryID>',
  ].join('');

  const exemption = !tvaDue
    ? `<ram:ExemptionReason>${esc(s.facturation?.mention_tva || 'TVA non applicable, art. 293 B du CGI')}</ram:ExemptionReason>`
    : '';

  const buyerRef = facture.reference_formation
    ? `<ram:BuyerOrderReferencedDocument>
        <ram:IssuerAssignedID>${esc(facture.reference_formation)}</ram:IssuerAssignedID>
      </ram:BuyerOrderReferencedDocument>`
    : '';

  const paymentMeans = s.iban
    ? `<ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>30</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount>
          <ram:IBANID>${esc(s.iban)}</ram:IBANID>
        </ram:PayeePartyCreditorFinancialAccount>
        ${s.bic ? `<ram:PayeeSpecifiedCreditorFinancialInstitution>
          <ram:BICID>${esc(s.bic)}</ram:BICID>
        </ram:PayeeSpecifiedCreditorFinancialInstitution>` : ''}
      </ram:SpecifiedTradeSettlementPaymentMeans>`
    : '';

  const dueDate = facture.date_echeance
    ? `<ram:SpecifiedTradePaymentTerms>
        <ram:DueDateDateTime>
          <udt:DateTimeString format="102">${isoToFx(facture.date_echeance)}</udt:DateTimeString>
        </ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">

  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:en16931</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>

  <rsm:ExchangedDocument>
    <ram:ID>${esc(facture.numero)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${isoToFx(facture.date_emission)}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>

  <rsm:SupplyChainTradeTransaction>
    ${lineItems}

    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${esc(s.nom_commercial || 'NABHOO')}</ram:Name>
        <ram:PostalTradeAddress>${sellerAddr}</ram:PostalTradeAddress>
        ${s.siret ? `<ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="FC">${esc(s.siret)}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : ''}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${esc(org.nom || '')}</ram:Name>
        <ram:PostalTradeAddress>${buyerAddr}</ram:PostalTradeAddress>
        ${org.siret ? `<ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="FC">${esc(org.siret)}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : ''}
      </ram:BuyerTradeParty>
      ${buyerRef}
    </ram:ApplicableHeaderTradeAgreement>

    <ram:ApplicableHeaderTradeDelivery/>

    <ram:ApplicableHeaderTradeSettlement>
      <ram:PaymentReference>${esc(facture.numero)}</ram:PaymentReference>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      ${paymentMeans}
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${fmt(montantTVA)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        ${exemption}
        <ram:BasisAmount>${fmt(totalHT)}</ram:BasisAmount>
        <ram:CategoryCode>${catCode}</ram:CategoryCode>
        <ram:RateApplicablePercent>${fmt(tauxTVA)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      ${dueDate}
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${fmt(totalHT)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${fmt(totalHT)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${fmt(montantTVA)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${fmt(netAPayer)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${fmt(netAPayer)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}
