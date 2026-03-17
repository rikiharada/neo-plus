/**
 * Neo+ Cloud Sync Module: Google Drive (GIS version)
 * Identity: Zero-Server, Privacy-First, Vanilla JS
 * 
 * Securely handles OAuth2 (drive.file scope only) and file uploads from the client.
 */

let tokenClient;
let accessToken = null;

// The drive.file scope restricts access ONLY to files created by this app
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const CLIENT_ID = 'your-client-id.apps.googleusercontent.com'; // Injected via build step or config in production

/**
 * 1. GIS (Google Identity Services) Initialization
 */
export const initGIS = (onTokenReceived) => {
    if (!window.google || !window.google.accounts) {
        console.error("GIS Script not loaded yet.");
        return;
    }

    tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (resp) => {
            if (resp.error) return console.error("GIS Auth Error:", resp.error);
            accessToken = resp.access_token;
            
            // Secure Short-term Memory (Tokens never hit the server)
            localStorage.setItem('neo_cloud_token', accessToken);
            localStorage.setItem('neo_token_expiry', Date.now() + (resp.expires_in * 1000));
            
            if (onTokenReceived) onTokenReceived(accessToken);
        },
    });
};

/**
 * Manually trigger the OAuth popup if token is expired or missing.
 */
export const requestDriveAccess = () => {
    if (tokenClient) {
        tokenClient.requestAccessToken();
    } else {
        console.error("Token client not initialized. Call initGIS first.");
    }
};

/**
 * 2. Resolve Folder Hierarchy (Neo+ / Documents / YYYY)
 * Recursively creates missing folders and returns the target parent ID.
 */
async function getOrCreateFolderStructure() {
    const year = new Date().getFullYear().toString();
    const path = ['Neo+', 'Documents', year];
    let parentId = 'root';

    for (const folderName of path) {
        const query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        
        if (!res.ok) throw new Error("Failed to search folder: " + res.statusText);
        
        const data = await res.json();

        if (data.files && data.files.length > 0) {
            parentId = data.files[0].id; // Found existing
        } else {
            // Create New Folder
            const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
                method: 'POST',
                headers: { 
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: folderName,
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: [parentId]
                })
            });
            const newFolder = await createRes.json();
            parentId = newFolder.id;
        }
    }
    return parentId;
}

/**
 * 3. File Upload (Zero-Server binary bypass)
 * Supports Blob attachments from the browser. Emits real-time hooks for CSS animations.
 */
export const uploadPdfToDrive = async (pdfBlob, fileName, hooks = {}) => {
    const { onStart, onSuccess, onError } = hooks;
    if (onStart) onStart();

    // Check token validity
    const expiry = localStorage.getItem('neo_token_expiry');
    accessToken = localStorage.getItem('neo_cloud_token');
    
    if (!accessToken || (expiry && Date.now() > parseInt(expiry, 10))) {
        // Automatically request token if expired when attempting upload
        if (tokenClient) {
            tokenClient.requestAccessToken();
        }
        if (onError) onError(new Error("Token Expired. Please reconnect."));
        return null; 
    }

    try {
        const parentId = await getOrCreateFolderStructure();

        const metadata = {
            name: fileName,
            mimeType: 'application/pdf',
            parents: [parentId]
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', pdfBlob);

        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` },
            body: form
        });

        if (response.status === 401) throw new Error("UNAUTHORIZED");
        if (!response.ok) throw new Error("Upload Failed: " + response.statusText);
        
        const result = await response.json();
        
        if (onSuccess) onSuccess(result.webViewLink);
        return result;

    } catch (error) {
        console.error("Neo Cloud Sync Error:", error);
        if (onError) onError(error);
        if (error.message === "UNAUTHORIZED" && tokenClient) {
            tokenClient.requestAccessToken();
        }
    }
};

// Global Exposure for UI Bindings
window.NeoCloudSync = {
    initGIS,
    requestDriveAccess,
    uploadPdfToDrive
};
