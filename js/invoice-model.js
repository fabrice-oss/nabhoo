import { store, getMissionEntreprises } from './data.js';

export function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

export function sirenFrom(value) {
  const d = digits(value);
  return d.length >= 9 ? d.slice(0, 9) : d;
}

export function resolveInvoiceCustomer(facture, mission) {
  if (facture?.client_type === 'organisme' && facture.client_id) {
    return store.organismes.find(o => o.id === facture.client_id) || null;
  }
  if (facture?.client_type === 'entreprise' && facture.client_id) {
    return store.entreprises.find(e => e.id === facture.client_id) || null;
  }
  if (mission?.organisme_id) {
    return store.organismes.find(o => o.id === mission.organisme_id) || null;
  }
  return getMissionEntreprises(mission || {})[0] || null;
}

export function invoiceCustomerOptions(mission) {
  if (!mission) return [];
  const options = [];
  if (mission.organisme_id) {
    const org = store.organismes.find(o => o.id === mission.organisme_id);
    if (org) options.push({ key: `organisme:${org.id}`, type: 'organisme', id: org.id, label: `${org.nom} (organisme)` });
  }
  for (const entreprise of getMissionEntreprises(mission)) {
    options.push({ key: `entreprise:${entreprise.id}`, type: 'entreprise', id: entreprise.id, label: `${entreprise.nom} (entreprise)` });
  }
  return options;
}

export function invoiceLines(facture, mission) {
  const sessions = mission?.sessions || [];
  const nb = sessions.length;
  const tarif = Number(mission?.tarif_journalier || 0);
  const frais = Number(mission?.frais_deplacement || 0);
  const statedTotal = Number(facture?.montant_ht || 0);
  const calculatedTotal = nb * tarif + frais;
  const dates = sessions.map(s => new Date(`${s.date}T12:00:00`).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  }));
  const sessionDates = dates.length > 1 ? `${dates.slice(0, -1).join(', ')} et ${dates[dates.length - 1]}` : (dates[0] || '');
  const serviceLabel = mission?.type === 'animation'
    ? `Animation de formation : ${mission.intitule || 'Formation'}`
    : (mission?.intitule || 'Prestation de services');

  // Les lignes détaillées ne sont utilisées que si elles retombent exactement
  // sur le montant de la facture. Les anciennes factures ajustées manuellement
  // restent ainsi cohérentes entre le PDF, NABHOO et Pennylane.
  if (nb > 0 && tarif > 0 && Math.abs(calculatedTotal - statedTotal) <= 0.01) {
    const lines = [{
      id: '1', description: serviceLabel,
      subtitle: sessionDates ? `Réalisation : ${sessionDates}` : '',
      quantity: nb, unit: nb > 1 ? 'jours' : 'jour', pennylaneUnit: 'day',
      unitPrice: tarif, total: nb * tarif,
    }];
    if (frais > 0) lines.push({
      id: '2', description: 'Frais de déplacement', subtitle: 'Remboursement forfaitaire',
      quantity: 1, unit: 'forfait', pennylaneUnit: 'piece', unitPrice: frais, total: frais,
    });
    return lines;
  }

  return [{
    id: '1', description: serviceLabel,
    subtitle: sessionDates ? `Réalisation : ${sessionDates}` : '',
    quantity: 1, unit: 'prestation', pennylaneUnit: 'piece',
    unitPrice: statedTotal, total: statedTotal,
  }];
}

export function invoiceTotals(facture, mission) {
  const lines = invoiceLines(facture, mission);
  const totalHT = lines.reduce((sum, line) => sum + Number(line.total || 0), 0);
  const vatRate = Number(facture?.tva_taux ?? store.settings.facturation?.tva_taux ?? 0);
  const vatAmount = Math.round(totalHT * vatRate) / 100;
  return { lines, totalHT, vatRate, vatAmount, totalTTC: totalHT + vatAmount };
}

export function validateInvoice(facture, mission) {
  const errors = [];
  const settings = store.settings || {};
  const customer = resolveInvoiceCustomer(facture, mission);
  const sellerSiret = digits(settings.siret);
  const buyerSiret = digits(customer?.siret);
  const duplicate = store.factures.some(f => f.id !== facture?.id && String(f.numero || '').trim() === String(facture?.numero || '').trim());

  if (!facture?.numero?.trim()) errors.push('Numéro de facture manquant.');
  if (duplicate) errors.push(`Le numéro ${facture.numero} est déjà utilisé par une autre facture.`);
  if (!facture?.date_emission) errors.push("Date d'émission manquante.");
  if (!facture?.date_echeance) errors.push("Date d'échéance manquante.");
  if (!mission?.sessions?.length) errors.push('Date de réalisation de la prestation manquante dans la mission.');
  if (!(Number(facture?.montant_ht) > 0)) errors.push('Le montant HT doit être supérieur à zéro.');

  if (!settings.dirigeant?.trim()) errors.push("Nom et prénom de l'entrepreneur manquants dans Paramètres.");
  if (!settings.nom_commercial?.trim()) errors.push('Nom commercial manquant dans Paramètres.');
  if (!settings.adresse?.trim() || !settings.cp?.trim() || !settings.ville?.trim()) errors.push("Adresse complète de l'émetteur manquante dans Paramètres.");
  if (sellerSiret.length !== 14) errors.push("Le SIRET de l'émetteur doit contenir 14 chiffres.");
  if (!customer?.nom?.trim()) errors.push('Client facturé introuvable.');
  if (!customer?.adresse?.trim() || !customer?.cp?.trim() || !customer?.ville?.trim()) errors.push('Adresse complète du client facturé manquante.');
  if (buyerSiret.length !== 14) errors.push('Le SIRET du client facturé doit contenir 14 chiffres (le SIREN sera repris sur la facture).');
  if (!settings.facturation?.penalites_taux?.trim()) errors.push('Conditions de pénalités de retard manquantes.');
  if (!settings.facturation?.escompte?.trim()) errors.push("Conditions d'escompte pour paiement anticipé manquantes.");
  if (!(Number(settings.facturation?.indemnite_recouvrement) >= 0)) errors.push("Indemnité forfaitaire de recouvrement manquante.");

  return { valid: errors.length === 0, errors, customer };
}

export function complianceMessage(errors) {
  return `Facture incomplète :\n\n${errors.map(e => `• ${e}`).join('\n')}\n\nCorrigez ces informations avant de générer ou transmettre la facture.`;
}
