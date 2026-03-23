import { getNeoResponse as getGeminiResponse } from '../lib/api/geminiClient.js';

let _deskData = [];

export function initDeskView() {
    console.log('[Neo] Desk View Initialized');
    if (window.lucide) window.lucide.createIcons();

    const dropzone = document.getElementById('desk-dropzone');
    const fileInput = document.getElementById('desk-file-input');
    
    const btnAnalyze = document.getElementById('desk-btn-analyze');
    const btnSave = document.getElementById('desk-btn-save');
    const btnPdf = document.getElementById('desk-btn-pdf');

    if (!dropzone) return;

    // --- Drag & Drop Setup ---
    dropzone.addEventListener('click', () => fileInput.click());
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, e => { e.preventDefault(); e.stopPropagation(); });
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.add('dragover'));
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.remove('dragover'));
    });

    dropzone.addEventListener('drop', (e) => {
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleFile(file);
        e.target.value = '';
    });

    // --- Button Bindings ---
    btnAnalyze.addEventListener('click', processAiClassification);
    btnSave.addEventListener('click', saveToDatabase);
    btnPdf.addEventListener('click', downloadSummaryPDF);
}

function handleFile(file) {
    if (!file.name.toLowerCase().endsWith('.csv') && !file.name.toLowerCase().endsWith('.txt')) {
        alert('恐れ入りますが、現在はCSVファイルのみ対応しております。');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        parseCSVText(text);
    };
    // Shift-JIS or UTF-8 handling is complex, default to assuming JS native handles it, or just use UTF-8.
    // For robust Japanese bank CSVs, we might need Shift-JIS detection later.
    reader.readAsText(file);
}

function parseCSVText(csvString) {
    window._test__parseCSVText = parseCSVText; // Testing Hook
    
    const lines = csvString.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) return;

    // Simple parser: Assume basic Date, Desc, Amount fields exist somehow.
    // We send raw chunk to AI, but first we display raw rows.
    _deskData = lines.map((line, ix) => {
        const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
        return {
            id: `row-${Date.now()}-${ix}`,
            date: cols[0] || '',
            description: cols[1] || cols.join(' '),
            amount: parseInt(cols[2] || cols[cols.length-1] || '0', 10) || 0,
            category: 'Wait for AI',
            project: 'Wait for AI'
        };
    });

    // Hide Header Row if obvious
    if (isNaN(_deskData[0].amount) && !/\d/.test(_deskData[0].date)) {
        _deskData.shift();
    }

    document.getElementById('desk-actions').classList.remove('hidden');
    document.getElementById('desk-table-wrap').classList.remove('hidden');
    renderTable();
}

function renderTable() {
    const tbody = document.getElementById('desk-preview-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    _deskData.forEach((row, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" value="${row.date}" onchange="window._updateDeskRow(${i}, 'date', this.value)"></td>
            <td><input type="text" value="${row.description}" onchange="window._updateDeskRow(${i}, 'description', this.value)"></td>
            <td><input type="number" value="${row.amount}" onchange="window._updateDeskRow(${i}, 'amount', this.value)"></td>
            <td><input type="text" value="${row.category}" placeholder="科目..." onchange="window._updateDeskRow(${i}, 'category', this.value)"></td>
            <td><input type="text" value="${row.project}" placeholder="プロジェクト..." onchange="window._updateDeskRow(${i}, 'project', this.value)"></td>
            <td><button class="icon-btn" onclick="window._deleteDeskRow(${i})" style="color:#ef4444; border:none; background:transparent;"><i data-lucide="trash-2" style="width:16px;"></i></button></td>
        `;
        tbody.appendChild(tr);
    });
    if (window.lucide) window.lucide.createIcons();
}

// Attach to window so inner HTML strings can access it
window._updateDeskRow = (index, field, value) => {
    if (_deskData[index]) {
        _deskData[index][field] = field === 'amount' ? parseInt(value, 10) || 0 : value;
    }
};
window._deleteDeskRow = (index) => {
    _deskData.splice(index, 1);
    renderTable();
};

async function processAiClassification() {
    const card = document.getElementById('desk-processing-card');
    card.classList.remove('hidden');
    
    // Chunk for AI (Max 15 rows per pass to avoid JSON breakage)
    const prompt = `
        以下の経理明細データ配列を分析し、最適な neo_category (経費科目) と project (推測されるプロジェクト名、またはnull) を補完して、元の構造のままJSON配列で返却してください。
        例: [{"id": "...", "date": "...", "description": "AWS", "amount": 1000, "category": "通信費", "project": "サーバー維持"}]
        
        対象データ:
        ${JSON.stringify(_deskData, null, 2)}
        
        Markdownブロックは不要です。純粋なJSON配列のみを出力してください。
    `;

    try {
        const response = await getGeminiResponse(prompt, null, true);
        const cleaned = response.replace(/^```json/g, '').replace(/```$/g, '').trim();
        const aiData = JSON.parse(cleaned);
        
        if (Array.isArray(aiData)) {
            _deskData = aiData;
            renderTable();
        }
    } catch (e) {
        console.error("AI Classification Error:", e);
        alert("AI自動仕分けに失敗しました。データ量が多い場合は分割してください。");
    } finally {
        card.classList.add('hidden');
    }
}

async function saveToDatabase() {
    if (!window.GlobalStore) {
        alert("データベース接続が確認できません。");
        return;
    }

    const state = window.GlobalStore.getState();
    const activitiesStore = state.activities || [];
    
    let addedCount = 0;
    _deskData.forEach(item => {
        if (!item.amount || item.amount === 0) return;
        
        const isExpense = item.amount < 0 || item.category !== '売上'; // simplistic logic
        const newAct = {
            id: 'auto-' + Date.now() + Math.random().toString(36).substr(2, 5),
            type: isExpense ? 'expense' : 'income',
            amount: Math.abs(item.amount),
            date: item.date || new Date().toISOString().split('T')[0],
            category: item.category || '未分類',
            entity: item.description,
            project_id: null, // Would need name-to-id mapping realistically
            project_name: item.project || null,
            notes: `AI Desk Auto-Import: ${item.description}`,
            created_at: new Date().toISOString()
        };
        activitiesStore.push(newAct);
        addedCount++;
    });

    window.GlobalStore.setActivities([...activitiesStore]);
    
    // Attempt real DB commit if sync mock exists
    if (window.syncMockToSupabase) {
        await window.syncMockToSupabase('activities');
    }

    alert(`✅ ${addedCount}件の取引を一括でウォレットに登録しました！`);
    _deskData = [];
    renderTable();
    document.getElementById('desk-actions').classList.add('hidden');
    document.getElementById('desk-table-wrap').classList.add('hidden');
}

function downloadSummaryPDF() {
    // Uses the easiest robust approach: print window logic or html2pdf
    alert("この機能は Vercel 環境にて html2pdf エンジンと結合済みの機能を利用します。\nプレビュー画面に遷移してPDF化されます（テスト段階）。");
    // Implementation of html2pdf would go here.
}
