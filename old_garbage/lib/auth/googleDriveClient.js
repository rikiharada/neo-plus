// lib/auth/googleDriveClient.js
const CLIENT_ID = 'your-client-id.apps.googleusercontent.com'; // Requires build-time injection for production
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let tokenClient, gapiInited = false, gisInited = false;

export async function initDrive() {
  if (typeof window === 'undefined') return;

  // gapiロード
  await new Promise(resolve => {
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => gapi.load('client', async () => {
      await gapi.client.init({ discoveryDocs: [DISCOVERY_DOC] });
      gapiInited = true; resolve();
    });
    document.head.appendChild(script);
  });

  // GISロード
  await new Promise(resolve => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = () => {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: () => {}, // 後で上書き
      });
      gisInited = true; resolve();
    };
    document.head.appendChild(script);
  });
}

export async function getAccessToken() {
  if (!gisInited) await initDrive();
  return new Promise((resolve, reject) => {
    tokenClient.callback = async (resp) => {
      if (resp.error) return reject(resp);
      gapi.client.setToken(resp);
      resolve(resp.access_token);
    };
    if (gapi.client.getToken() == null) {
      tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
      tokenClient.requestAccessToken({ prompt: '' });
    }
  });
}

export async function uploadPdfToDrive(pdfBlob, filename = 'neo-transactions.pdf') {
  const token = await getAccessToken();
  const boundary = '-------' + Math.random().toString(36);
  const metadata = { name: filename, mimeType: 'application/pdf' };

  const bodyParts = [
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`
  ];

  const body = new Blob([...bodyParts.map(p => new TextEncoder().encode(p)), pdfBlob], {
    type: `multipart/related; boundary=${boundary}`
  });

  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=webViewLink`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!res.ok) throw new Error('Drive upload失敗');
  const data = await res.json();
  return data.webViewLink;
}
