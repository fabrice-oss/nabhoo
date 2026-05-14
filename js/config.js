// ⚠️ Remplacez CLIENT_ID par votre Client ID Google Cloud Console
// URL de production : https://fabrice-oss.github.io/avrila-formation
export const CONFIG = {
  CLIENT_ID: '764252678223-iceihojnhqqrjhij62l69davmh82jopb.apps.googleusercontent.com',
  SCOPES: [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/userinfo.profile',
  ].join(' '),
  DRIVE_FOLDER_NAME: 'AVRILA FORMATION',
  CALENDAR_ID: 'primary', // Sera remplacé par l'ID du calendrier formations dans Paramètres

  ORGANISME: {
    nom_commercial: '',
    dirigeant: '',
    adresse: '',
    cp: '',
    ville: '',
    tel: '',
    email: '',
    siret: '',
    naf: '',
    nda: '',
    forme_juridique: '',
    iban: '',
    bic: '',
    banque: '',
  },

  FACTURATION: {
    prefixe: '',
    delai_paiement_jours: 30,
    penalites_taux: 'taux directeur de la BCE majoré de 10 points',
    indemnite_recouvrement: 40,
    mention_tva: 'TVA non applicable, art. 293 B du CGI',
  },
};

