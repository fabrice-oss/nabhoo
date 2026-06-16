import { getToken } from '../auth.js';

const BASE = 'https://www.googleapis.com';
let folderId = null;
let facturesFolderId = null;
let contratsFolderId = null;
let fileIds = {};

async function req(path, options = {}) {
  const token = getToken();
  if (!token) throw new Error('Non authentifié');
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive API ${res.status}: ${err}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

async function findFolder(name, parentId = null) {
  let q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  if (parentId) q += ` and '${parentId}' in parents`;
  const data = await req(`/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`);
  return data.files?.[0]?.id || null;
}

async function createFolder(name, parentId = null) {
  const meta = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) meta.parents = [parentId];
  const data = await req('/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(meta),
  });
  return data.id;
}

export async function initDriveFolder(folderName) {
  folderId = await findFolder(folderName) || await createFolder(folderName);
  facturesFolderId = await findFolder('factures', folderId) || await createFolder('factures', folderId);
  contratsFolderId = await findFolder('contrats', folderId) || await createFolder('contrats', folderId);
  const dataFolderId = await findFolder('data', folderId) || await createFolder('data', folderId);
  fileIds._dataFolder = dataFolderId;
  return folderId;
}

async function findFile(name, parentId) {
  const q = `name='${name}' and '${parentId}' in parents and trashed=false`;
  const data = await req(`/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`);
  return data.files?.[0]?.id || null;
}

async function readFile(fileId) {
  const token = getToken();
  const res = await fetch(`${BASE}/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive read ${res.status}`);
  return res.json();
}

async function writeFile(fileId, data) {
  const body = JSON.stringify(data, null, 2);
  await req(`/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

async function createFile(name, data, parentId) {
  const meta = { name, mimeType: 'application/json', parents: [parentId] };
  const boundary = 'boundary_avrila_' + Date.now();
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(meta),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    JSON.stringify(data, null, 2),
    `--${boundary}--`,
  ].join('\r\n');

  const res = await req(
    '/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    }
  );
  return res.id;
}

export async function loadJSON(name) {
  const parentId = fileIds._dataFolder;
  let id = fileIds[name] || await findFile(`${name}.json`, parentId);
  if (!id) return null;
  fileIds[name] = id;
  return readFile(id);
}

export async function saveJSON(name, data) {
  const parentId = fileIds._dataFolder;
  let id = fileIds[name] || await findFile(`${name}.json`, parentId);
  if (id) {
    fileIds[name] = id;
    await writeFile(id, data);
  } else {
    id = await createFile(`${name}.json`, data, parentId);
    fileIds[name] = id;
  }
}

async function uploadFile(filename, fileBlob, mimeType, parentId) {
  const meta = { name: filename, mimeType, parents: [parentId] };
  const boundary = 'boundary_upload_' + Date.now();
  const metaStr = JSON.stringify(meta);

  const arrayBuffer = await fileBlob.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);

  const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaStr}\r\n`;
  const filePart = `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const ending = `\r\n--${boundary}--`;

  const metaBytes = new TextEncoder().encode(metaPart);
  const filePartBytes = new TextEncoder().encode(filePart);
  const endingBytes = new TextEncoder().encode(ending);

  const combined = new Uint8Array(
    metaBytes.length + filePartBytes.length + uint8.length + endingBytes.length
  );
  let offset = 0;
  for (const chunk of [metaBytes, filePartBytes, uint8, endingBytes]) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  const token = getToken();
  const res = await fetch(`${BASE}/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: combined,
  });
  const data = await res.json();
  if (!res.ok || !data.webViewLink) {
    throw new Error(`Échec de l'upload Drive (${res.status}): ${data?.error?.message || 'webViewLink manquant'}`);
  }
  return data;
}

export async function uploadPDF(filename, pdfBlob) {
  return uploadFile(filename, pdfBlob, 'application/pdf', facturesFolderId);
}

export async function uploadContrat(filename, fileBlob, mimeType) {
  return uploadFile(filename, fileBlob, mimeType, contratsFolderId);
}

export async function deleteDriveFile(fileId) {
  await req(`/drive/v3/files/${fileId}`, { method: 'DELETE' });
}
