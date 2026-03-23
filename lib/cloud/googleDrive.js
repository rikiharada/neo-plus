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

/** CLIENT_ID is set by the user in Account Settings and persisted to localStorage, or injected via Bundler ENV */
function _getClientId() {
    try {
        // Support for Vercel/Next/Vite injected environment variables
        if (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
            return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
        }
    } catch (e) {
        // Vanilla JS graceful degradation
    }
    // Static Fallback for Neo+ Production without a build step
    return localStorage.getItem('neo_gdrive_client_id') || '1062392267391-52r08qjucqgckdghi96bchtcmjsnb6ko.apps.googleusercontent.com';
}

/**
 * 1. GIS (Google Identity Services) Initialization
 */
export const initGIS = (onTokenReceived) => {
    if (!window.google || !window.google.accounts) {
        console.error("[GIS] Script not loaded yet.");
        return;
    }
    const clientId = _getClientId();
    if (!clientId) {
        console.warn("[GIS] No CLIENT_ID set. Go to Account Settings → Google Drive and enter your OAuth Client ID.");
        return;
    }

    tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: (resp) => {
            if (resp.error) {
                console.error("GIS Auth Error:", resp.error);
                if (window.NeoCloudSync.updateUIConnectionState) window.NeoCloudSync.updateUIConnectionState(false);
                return;
            }
            accessToken = resp.access_token;
            
            // Auto-provision Neo+ Master Folder upon connection silently
            _initBaseFolder();
            
            // Secure Short-term Memory (Tokens never hit the server)
            localStorage.setItem('neo_cloud_token', accessToken);
            localStorage.setItem('neo_token_expiry', Date.now() + (resp.expires_in * 1000));
            
            // Update UI
            if (window.NeoCloudSync.updateUIConnectionState) {
                window.NeoCloudSync.updateUIConnectionState(true);
            }

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
 * Disconnect Drive and wipe local tokens securely.
 */
export const disconnect = () => {
    localStorage.removeItem('neo_cloud_token');
    localStorage.removeItem('neo_token_expiry');
    accessToken = null;
    updateUIConnectionState(false);
};

export const updateUIConnectionState = (isConnected) => {
    const pnl = document.getElementById('gdrive-connection-panel');
    const on = document.getElementById('gdrive-status-connected');
    const off = document.getElementById('gdrive-status-disconnected');
    
    // Auto-reveal panel if user selects radio
    const radio = document.getElementById('radio-gdrive-sync');
    if (radio && radio.checked && pnl) pnl.style.display = 'block';

    if (on && off) {
        on.style.display = isConnected ? 'flex' : 'none';
        off.style.display = isConnected ? 'none' : 'block';
    }
};

/**
 * 2. Resolve Folder Hierarchy (Neo+ / Documents / YYYY)
 * Recursively creates missing folders and returns the target parent ID.
 */
async function getOrCreateFolderStructure() {
    const year = new Date().getFullYear().toString();
    const cacheKey = 'neo_drive_folder_' + year;
    const cachedId = localStorage.getItem(cacheKey);
    if (cachedId) return cachedId;

    const path = ['Neo+', 'Documents', year];
    let parentId = 'root';

    for (const folderName of path) {
        let foundId = null;
        try {
            const query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
            const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            
            if (res.ok) {
                const data = await res.json();
                if (data.files && data.files.length > 0) {
                    foundId = data.files[0].id; // Found existing
                }
            } else {
                console.warn(`[Drive Sync] Failed to search folder ${folderName} (403/404). Proceeding to create blindly.`, res.status);
            }
        } catch(e) {
            console.warn(`[Drive Sync] Search exception for ${folderName}:`, e);
        }

        if (foundId) {
            parentId = foundId;
        } else {
            // Create New Folder
            console.log(`[Drive Sync] Creating missing folder: ${folderName}`);
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
            if (!createRes.ok) throw new Error("API FOLDER CREATE FAILED: " + createRes.statusText);
            const newFolder = await createRes.json();
            parentId = newFolder.id;
        }
    }
    
    localStorage.setItem(cacheKey, parentId);
    return parentId;
}

/**
 * 2.5 Resolve Dynamic Project Folders (Neo+ / Type / ProjectName)
 */
async function getOrCreateProjectFolderStructure(folderType, projectName) {
    const safeProjectName = projectName ? projectName.replace(/[^a-zA-Z0-9_\-]/g, '_') : 'General';
    const cacheKey = `neo_drive_folder_${folderType}_${safeProjectName}`;
    const cachedId = localStorage.getItem(cacheKey);
    if (cachedId) return cachedId;

    const path = ['Neo+', folderType, projectName || 'General'];
    let parentId = 'root';

    for (const folderName of path) {
        let foundId = null;
        try {
            const safeName = folderName.replace(/'/g, "\\'");
            const query = `name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
            const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            
            if (res.ok) {
                const data = await res.json();
                if (data.files && data.files.length > 0) {
                    foundId = data.files[0].id;
                }
            } else {
                console.warn(`[Drive Sync] Failed to search project folder ${folderName} (403/404). Proceeding to create blindly.`, res.status);
            }
        } catch(e) {
            console.warn(`[Drive Sync] Search exception for ${folderName}:`, e);
        }

        if (foundId) {
            parentId = foundId;
        } else {
            console.log(`[Drive Sync] Creating missing folder: ${folderName}`);
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
            if (!createRes.ok) throw new Error("API PROJECT FOLDER CREATE FAILED: " + createRes.statusText);
            const newFolder = await createRes.json();
            parentId = newFolder.id;
        }
    }
    
    localStorage.setItem(cacheKey, parentId);
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

/**
 * 4. Client-side Download Streaming
 * Fetches the raw Blob from Drive directly to the browser memory.
 */
export const downloadFile = async (fileId) => {
    const token = localStorage.getItem('neo_cloud_token');
    if (!token) throw new Error("No Drive Token. User must connect.");
    
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);
    return await res.blob();
};

/**
 * 5. Direct-to-Gemini Invocation Pipeline
 * Given a fileId on Google Drive, downloads it directly in-memory and invokes Gemini.
 */
export const parseReceiptFromDrive = async (fileId, userOccupation = "general") => {
    console.log(`[Zero-Server Sync] Streaming file ${fileId} from Drive...`);
    const blob = await downloadFile(fileId);
    
    console.log(`[Zero-Server Sync] File downloaded (${blob.size} bytes). Preparing Base64 for Gemini...`);
    
    // Convert Blob to Base64
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = async () => {
            try {
                const base64data = reader.result.split(',')[1];
                const mimeType = blob.type;
                
                // Assuming processInvoiceFromImage endpoint exists in gemini.js
                if (window.processInvoiceFromImage) {
                    const result = await window.processInvoiceFromImage(base64data, mimeType);
                    resolve(result);
                } else {
                    console.warn("[Zero-Server Sync] window.processInvoiceFromImage is not available globally.");
                    resolve(null);
                }
            } catch (e) {
                reject(e);
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

/**
 * 6. Zero-Server Citation (listFilesInFolder)
 * Fetches files matching mimeType prefix within the specific Project Folder.
 */
export const listFilesInFolder = async (folderType, projectName, mimeTypePrefix = '') => {
    const token = localStorage.getItem('neo_cloud_token');
    if (!token) throw new Error("No Drive Token. User must connect.");
    accessToken = token; // ensure global token is set for getOrCreate

    const parentId = await getOrCreateProjectFolderStructure(folderType, projectName);
    
    // Build query
    let query = `'${parentId}' in parents and trashed = false`;
    if (mimeTypePrefix) {
        query += ` and mimeType contains '${mimeTypePrefix}'`;
    }

    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,webViewLink,thumbnailLink,hasThumbnail)&orderBy=createdTime desc`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!res.ok) throw new Error(`List files failed: ${res.statusText}`);
    const data = await res.json();
    return data.files || [];
};

/**
 * Silently seed the Base 'Neo+' folder in Drive the moment we get a token.
 */
async function _initBaseFolder() {
    try {
        const query = `name = 'Neo+' and mimeType = 'application/vnd.google-apps.folder' and 'root' in parents and trashed = false`;
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.files || data.files.length === 0) {
            await fetch('https://www.googleapis.com/drive/v3/files', {
                method: 'POST',
                headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Neo+', mimeType: 'application/vnd.google-apps.folder', parents: ['root'] })
            });
            console.log("[GIS] Created base 'Neo+' folder.");
        } else {
            console.log("[GIS] 'Neo+' folder already exists.");
        }
    } catch (e) {
        console.error("[GIS] Base folder init failed", e);
    }
}

// Global Exposure for UI Bindings
window.NeoCloudSync = {
    initGIS,
    requestDriveAccess,
    uploadPdfToDrive,
    disconnect,
    updateUIConnectionState,
    downloadFile,
    parseReceiptFromDrive,
    listFilesInFolder // Exposed for UI Picker
};
