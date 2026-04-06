/** Extracted Chat Intents Core Logic */
window.resolveProjectIdForExpenseIntent = function resolveProjectIdForExpenseIntent(intent, userText = '') {
    if (typeof window.resolveExpenseProjectId === 'function') {
        return window.resolveExpenseProjectId(intent, userText || '');
    }
    const projects = window.mockDB?.projects || [];
    if (!projects.length) return null;
    const matches = (id) => id != null && id !== '' && projects.some((p) => String(p.id) === String(id));
    if (intent.project_id != null && matches(intent.project_id)) {
        return projects.find((p) => String(p.id) === String(intent.project_id)).id;
    }
    const byName = (intent.project_name || intent.projectName || '').trim();
    if (byName && typeof window.findProjectIdByName === 'function') {
        const pid = window.findProjectIdByName(byName);
        if (pid != null && matches(pid)) return pid;
    }
    if (window.currentOpenProjectId != null && matches(window.currentOpenProjectId)) {
        return projects.find((p) => String(p.id) === String(window.currentOpenProjectId)).id;
    }
    if (projects.length === 1) return projects[0].id;
    return null;
}


        const isCompoundRemoteUuid = (pid) =>
            typeof pid === 'string' && pid.length >= 20 && pid !== 'undefined' && pid !== 'null';

        window.__compoundDbProjectId = null;
        window.__compoundLocalMode = false;

        // Action Execution Layer (Phase 2 Layer 2)
        for (const intent of intents) {
            const action = intent.action;
            const isSilentWorkflow = intent.is_silent;
            
            console.log(`[Neo Intent Execution] Executing action: ${action}, is_silent: ${!!isSilentWorkflow}`);

            if (action === "COMPLIANCE_VIOLATION") {
                if(window.handleComplianceViolation) window.handleComplianceViolation(`Physical Blacklist Match (${intent.text})`, text);
                break;
            } else if (action === "NAVIGATE") {
                const neoBubble = document.getElementById('neo-fab-bubble');
                if (neoBubble) {
                    neoBubble.textContent = `了解、移動するよ⚡️`;
                    neoBubble.classList.add('show');
                    setTimeout(() => { neoBubble.classList.remove('show'); }, 3000);
                }
                window.switchView(intent.target_view);
            } else if (action === "NAVIGATE_PROJECT") {
                 window.currentOpenProjectId = intent.project_id;
            } else if (action === "CREATE_PROJECT") {
                console.log('Compound: Creating project...');
                const newProjectName = (intent.project_name || '名称未設定プロジェクト').trim();
                const loc = (intent.location && String(intent.location).trim()) || '-';
                const sessionWrap = window.supabaseClient ? await window.supabaseClient.auth.getSession() : null;
                let uid = sessionWrap?.data?.session?.user?.id || null;
                if (!uid && window.supabaseClient) {
                    const { data: gu } = await window.supabaseClient.auth.getUser();
                    uid = gu?.user?.id ?? null;
                }

                const createdAtIso = (() => {
                    try {
                        if (intent.date && typeof intent.date === 'string') {
                            const d = new Date(intent.date.replace(/\//g, '-'));
                            if (!Number.isNaN(d.getTime())) return d.toISOString();
                        }
                    } catch {
                        /* ignore */
                    }
                    return new Date().toISOString();
                })();

                let savedProj = null;

                if (window.supabaseClient && uid) {
                    const newProjRaw = {
                        name: newProjectName,
                        category: 'other',
                        color: '#007AFF',
                        status: 'active',
                        location: loc,
                        user_id: uid,
                        created_at: createdAtIso
                    };
                    const { data, error } = await window.supabaseClient.from('projects').insert([newProjRaw]).select();
                    if (error || !data || data.length === 0) {
                        console.error('[Neo] CREATE_PROJECT Supabase insert failed:', error);
                        showCompoundFail('プロジェクト作成に失敗しました。ログイン状態を確認して、もう一度お試しください。');
                        return;
                    }
                    const row = data[0];
                    if (!isCompoundRemoteUuid(String(row.id))) {
                        console.error('Compound failed: invalid project_id from DB, staying on dashboard', row.id);
                        showCompoundFail();
                        return;
                    }
                    console.log(`Compound: Got real project_id = ${row.id}`);

                    savedProj = {
                        id: row.id,
                        name: row.name,
                        customerName: '-',
                        location: row.location || loc,
                        note: row.note || '',
                        category: row.category || 'other',
                        color: row.color || '#007AFF',
                        unit: '-',
                        hasUnpaid: false,
                        revenue: 0,
                        status: row.status || 'active',
                        clientName: row.client_name || '',
                        paymentDeadline: row.payment_deadline || '',
                        bankInfo: row.bank_info || '',
                        lastUpdated: row.last_updated || null,
                        startDate: row.created_at ? row.created_at.split('T')[0].replace(/-/g, '/') : null
                    };
                    window.mockDB.projects.unshift(savedProj);
                    window.__compoundDbProjectId = row.id;
                    window.__compoundLocalMode = false;
                    window.persistLocalBody?.();
                } else if (typeof window.insertProject === 'function') {
                    console.log('Compound: no Supabase session — local insertProject fallback');
                    const localProj = {
                        id: Date.now(),
                        name: newProjectName,
                        customerName: '-',
                        location: loc,
                        note: '',
                        category: 'other',
                        color: '#007AFF',
                        unit: '-',
                        hasUnpaid: false,
                        revenue: 0,
                        status: 'active',
                        clientName: '',
                        paymentDeadline: '',
                        bankInfo: '',
                        lastUpdated: new Date().toLocaleDateString('ja-JP').replace(/\//g, '/')
                    };
                    savedProj = await window.insertProject(localProj);
                    if (!savedProj || savedProj.id == null || String(savedProj.id) === 'undefined') {
                        showCompoundFail('プロジェクトをローカルに作成できませんでした。');
                        return;
                    }
                    window.__compoundDbProjectId = savedProj.id;
                    window.__compoundLocalMode = true;
                    window.persistLocalBody?.();
                    console.log('Compound: local project created (numeric id), no auto-navigation');
                } else {
                    showCompoundFail('ログインが必要です。アカウントからサインインしてから、もう一度お試しください。');
                    return;
                }

                window.currentOpenProjectId = savedProj.id;
                window.dispatchEvent(new CustomEvent('neo-render-projects', { detail: { projects: window.mockDB.projects } }));

                const isPartiallyCompound = intents.length > 1 || intent.is_compound;
                if (isSilentWorkflow || isPartiallyCompound) {
                    _resolveNeoReply(`プロジェクト「${savedProj.name}」を作成しました🔥`);
                } else if (window.openProjectDetail && !window.__compoundLocalMode) {
                    window.openProjectDetail(savedProj.id, { navigate: true, skipFetch: false });
                } else if (window.switchView) {
                    window.switchView('view-dash');
                }
            } else if (action === "ADD_EXPENSE") {
                const projId = window.__compoundDbProjectId ?? resolveProjectIdForExpenseIntent(intent, text);
                if (
                    projId == null ||
                    projId === '' ||
                    String(projId) === 'undefined' ||
                    String(projId) === 'null'
                ) {
                    console.error('Compound failed: invalid project_id, staying on dashboard', projId);
                    showCompoundFail();
                    return;
                }

                const pObj = window.mockDB.projects.find((p) => String(p.id) === String(projId));
                const projName = pObj ? pObj.name : '未分類';

                const sourceAmounts = Array.isArray(intent.amounts) && intent.amounts.length > 0 ? intent.amounts : [];
                const amtList = sourceAmounts.filter((a) => a && Number(a.value) > 0);
                const multi = amtList.length > 1;
                const lineItems =
                    amtList.length > 0
                        ? amtList.map((a) => ({
                              title: (a.label && String(a.label).trim()) || intent.category || '経費',
                              amount: Number(a.value)
                          }))
                        : [
                              {
                                  title: (intent.title || text || '').trim() || '経費',
                                  amount: Number(intent.amount) || 0
                              }
                          ];

                const today = new Date().toLocaleDateString('ja-JP').replace(/\//g, '/');
                const baseMeta = {
                    type: intent.type || 'expense',
                    category: intent.category || 'その他',
                    isBookkeeping: intent.is_bookkeeping !== false
                };
                const cleanTitle = (raw) => {
                    let t = (raw || '').trim() || '無題の経費';
                    if (projName !== '未分類') t = t.split(projName).join('').trim();
                    return t || '無題の経費';
                };

                const primaryTitle = multi ? lineItems.map((x) => x.title).join('・') : cleanTitle(lineItems[0]?.title || '');
                const primaryCat = baseMeta.category;

                const silentLike = isSilentWorkflow || intent.is_compound || multi;

                const finishCompoundState = () => {
                    window.__compoundDbProjectId = null;
                    window.__compoundLocalMode = false;
                };

                if (silentLike) {
                    try {
                        const sessionWrap = window.supabaseClient ? await window.supabaseClient.auth.getSession() : null;
                        let uid = sessionWrap?.data?.session?.user?.id || null;
                        if (!uid && window.supabaseClient) {
                            const { data: gu } = await window.supabaseClient.auth.getUser();
                            uid = gu?.user?.id ?? null;
                        }

                        const rowsToSave = [];
                        for (let i = 0; i < lineItems.length; i++) {
                            const { title: liTitle, amount: liAmt } = lineItems[i];
                            const ft = multi ? liTitle : cleanTitle(liTitle);
                            if (!liAmt || liAmt <= 0) continue;
                            rowsToSave.push({ title: ft, amount: liAmt });
                        }

                        if (rowsToSave.length === 0) {
                            if (isChatViewActive()) {
                                _resolveNeoReply('金額を読み取れませんでした。金額をはっきり書いて、もう一度お試しください。', { isError: true });
                            }
                            if (window.switchView) window.switchView('view-dash');
                            return;
                        }

                        const txPayload = (row) => ({
                            projectId: projId,
                            projectName: projName,
                            type: baseMeta.type,
                            category: baseMeta.category,
                            title: row.title,
                            amount: row.amount,
                            date: today,
                            isBookkeeping: baseMeta.isBookkeeping,
                            originalInput: text
                        });

                        /** 未ログイン or 直前の CREATE がローカル専用 → 即飛ばし禁止 */
                        const forceLocalNoNavigate = window.__compoundLocalMode === true || !uid;

                        if (forceLocalNoNavigate) {
                            console.log('Compound: local path — insertTransaction (staying on dashboard)');
                            for (const row of rowsToSave) {
                                await window.insertTransaction(txPayload(row));
                            }
                            window.dispatchEvent(new CustomEvent('neo-render-projects', { detail: { projects: window.mockDB.projects } }));
                            if (window.switchView) window.switchView('view-dash');
                            const nb = document.getElementById('neo-fab-bubble');
                            if (nb) {
                                nb.textContent = multi
                                    ? `【記録完了】${rowsToSave.length}件を「${projName}」に保存しました。プロジェクト一覧から開いて確認できます。`
                                    : `【記録完了】「${primaryTitle}」を保存しました。`;
                                nb.classList.add('show');
                                setTimeout(() => nb.classList.remove('show'), 5000);
                            }
                            if (isChatViewActive()) {
                                _resolveNeoReply(
                                    multi
                                        ? `${rowsToSave.length}件を「${projName}」に計上したよ🔥`
                                        : `「${primaryTitle}」を記帳したよ🔥`
                                );
                            }
                            finishCompoundState();
                        } else if (isCompoundRemoteUuid(String(projId))) {
                            if (!uid) {
                                console.error('[Neo] ADD_EXPENSE bulk: no auth uid — cannot set user_id on activities');
                                showCompoundFail('セッションを確認してください（経費の user_id を保存できません）。');
                                finishCompoundState();
                                return;
                            }
                            /** id は activities の自動採番（int4 等）— フィールドを付けない */
                            const bulkActivities = rowsToSave.map((row) => ({
                                project_id: projId,
                                user_id: uid,
                                type: baseMeta.type,
                                category: baseMeta.category,
                                title: row.title,
                                amount: row.amount,
                                date: new Date().toISOString(),
                                is_bookkeeping: baseMeta.isBookkeeping,
                                is_deleted: false
                            }));

                            console.log(
                                '[Neo] Compound bulk insert — Inserting with user_id:',
                                uid,
                                '| project_id:',
                                projId,
                                '| rowCount:',
                                bulkActivities.length
                            );

                            const { data: insertedRows, error: insErr } = await window.supabaseClient
                                .from('activities')
                                .insert(bulkActivities)
                                .select();
                            if (insErr) {
                                console.error('[Neo] activities bulk insert failed:', insErr);
                                showCompoundFail();
                                finishCompoundState();
                                return;
                            }

                            const insN = Array.isArray(insertedRows) ? insertedRows.length : 0;
                            console.log(
                                `[Insert Success] user_id = ${uid} | project_id = ${projId} | rows inserted = ${insN}`
                            );
                            console.log(`Compound: Bulk inserted ${bulkActivities.length} expenses`);

                            /** 複合経費は最低 2 行を要求（1 行のみのときは rowsToSave に合わせる） */
                            const minNeeded = Math.max(rowsToSave.length, multi ? 2 : 1);
                            let verifyData = null;
                            let verified = false;

                            for (let attempt = 1; attempt <= 15; attempt++) {
                                if (attempt === 1) {
                                    await new Promise((resolve) => setTimeout(resolve, 150));
                                } else {
                                    await new Promise((resolve) => setTimeout(resolve, 50));
                                }

                                const { data: vd, error: selErr } = await window.supabaseClient
                                    .from('activities')
                                    .select('*')
                                    .eq('project_id', projId)
                                    .eq('user_id', uid);

                                if (selErr) {
                                    console.warn(`Compound: verify SELECT error (attempt ${attempt})`, selErr);
                                }

                                verifyData = vd;
                                const got = vd ? vd.length : 0;
                                console.log(`Compound: verify attempt ${attempt}/15 — need ${minNeeded}, got ${got}`);

                                if (vd && got >= minNeeded) {
                                    verified = true;
                                    console.log(`Compound: Verified ${got} activities in DB`);
                                    break;
                                }
                            }

                            if (!verified) {
                                const got = verifyData ? verifyData.length : 0;
                                console.error(
                                    `Compound: verification failed (need ${minNeeded}, got ${got}), staying on dashboard — no navigation`
                                );
                                showCompoundFail('保存の確認が間に合いませんでした。一覧を更新して確認してください。');
                                finishCompoundState();
                                return;
                            }

                            if (typeof window.mapActivityRowToMock === 'function' && verifyData) {
                                for (const row of verifyData) {
                                    const norm = window.mapActivityRowToMock(row);
                                    const dup = window.mockDB.activities.some(
                                        (a) =>
                                            String(a.projectId) === String(projId) &&
                                            String(a.id) === String(norm.id)
                                    );
                                    if (!dup) window.mockDB.activities.push(norm);
                                }
                                window.persistLocalBody?.();
                            }

                            window.dispatchEvent(new CustomEvent('neo-render-projects', { detail: { projects: window.mockDB.projects } }));

                            await new Promise((resolve) => setTimeout(resolve, 50));

                            console.log('Compound: All good, opening project detail');
                            if (typeof window.openProjectDetail === 'function') {
                                await window.openProjectDetail(projId, { navigate: true, skipFetch: false });
                            }

                            const neoBubble = document.getElementById('neo-fab-bubble');
                            if (neoBubble) {
                                neoBubble.textContent = multi
                                    ? `【記録完了】${rowsToSave.length}件の経費を「${projName}」に保存しました⚡️`
                                    : `【記録完了】「${primaryTitle}」を ${primaryCat} で保存しました⚡️`;
                                neoBubble.classList.add('show');
                                setTimeout(() => neoBubble.classList.remove('show'), 4000);
                            }
                            if (isChatViewActive()) {
                                _resolveNeoReply(
                                    multi
                                        ? `${rowsToSave.length}件を「${projName}」に計上したよ🔥`
                                        : `「${primaryTitle}」を ${primaryCat} で記帳したよ🔥`
                                );
                            }

                            finishCompoundState();
                        } else {
                            console.log('Compound: non-UUID project_id — insertTransaction fallback');
                            for (const row of rowsToSave) {
                                await window.insertTransaction(txPayload(row));
                            }
                            window.dispatchEvent(new CustomEvent('neo-render-projects', { detail: { projects: window.mockDB.projects } }));
                            if (typeof window.openProjectDetail === 'function') {
                                await window.openProjectDetail(projId, { navigate: true, skipFetch: false });
                            }
                            const neoBubble = document.getElementById('neo-fab-bubble');
                            if (neoBubble) {
                                neoBubble.textContent = multi
                                    ? `【記録完了】${rowsToSave.length}件の経費を「${projName}」に保存しました⚡️`
                                    : `【記録完了】「${primaryTitle}」を ${primaryCat} で保存しました⚡️`;
                                neoBubble.classList.add('show');
                                setTimeout(() => neoBubble.classList.remove('show'), 4000);
                            }
                            if (isChatViewActive()) {
                                _resolveNeoReply(
                                    multi
                                        ? `${rowsToSave.length}件を「${projName}」に計上したよ🔥`
                                        : `「${primaryTitle}」を ${primaryCat} で記帳したよ🔥`
                                );
                            }
                            finishCompoundState();
                        }
                    } catch (e) {
                        console.error('Compound failed:', e);
                        showCompoundFail();
                        window.__compoundDbProjectId = null;
                        window.__compoundLocalMode = false;
                    }
                } else {
                    const confirmModal = document.getElementById('modal-neo-confirm');
                    if (confirmModal) confirmModal.classList.remove('hidden');
                }
            } else if (action === "AGGREGATE_EXPENSES") {
                const targetProjectName = intent.project_name;
                const targetProjId = window.findProjectIdByName ? window.findProjectIdByName(targetProjectName) : null;
                if (targetProjId) {
                    const targetProj = window.mockDB.projects.find(p => p.id === targetProjId);
                    const expenses = window.mockDB.transactions
                        .filter(t => t.projectId === targetProjId && (t.type === 'expense' || t.type === 'labor'))
                        .reduce((acc, curr) => acc + curr.amount, 0);

                    const neoBubble = document.getElementById('neo-fab-bubble');
                    if (neoBubble) {
                        neoBubble.textContent = `了解。「${targetProj.name}」の現在の経費合計は ¥${expenses.toLocaleString()} だよ📊`;
                        neoBubble.classList.add('show');
                        setTimeout(() => { neoBubble.classList.remove('show'); }, 5000);
                    }
                    alert(`【集計結果】\nプロジェクト: ${targetProj.name}\n経費合計: ¥${expenses.toLocaleString()}`);
                } else {
                    const neoBubble = document.getElementById('neo-fab-bubble');
                    if (neoBubble) {
                        neoBubble.textContent = `ごめん、「${targetProjectName}」が見つからなかった。`;
                        neoBubble.classList.add('show');
                        setTimeout(() => { neoBubble.classList.remove('show'); }, 4000);
                    }
                }
            } else if (action === "GENERATE_DOCUMENT") {
                await _runOneTouchDocumentFlow(text, intent.document_type, intent.project_name);
            } else if (action === "QUERY_KNOWLEDGE") {
                const answerText = intent.answer;
                if (answerText) {
                    const neoBubble = document.getElementById('neo-fab-bubble');
                    if (neoBubble) {
                        neoBubble.innerHTML = `<span>${answerText}</span>`;
                        neoBubble.classList.add('show');
                        setTimeout(() => { neoBubble.classList.remove('show'); }, 6000); 
                    }
                    _resolveNeoReply(answerText);
                } else {
                    const offlineReply = _buildOfflineFallbackReply(text);
                    if (offlineReply) _resolveNeoReply(offlineReply);
                }
            } else if (action === "UNKNOWN" || action === "UNKNOWN_ERROR" || !action) {
                // ── Step 0: Intent側が返した answer を最優先（APIキー有無に依存させない） ──────────
                if (typeof intent.answer === 'string' && intent.answer.trim()) {
                    _resolveNeoReply(intent.answer.trim());
                    continue;
                }

                // ── Step 1: Neoの自己紹介 → APIキー未設定時のみオフライン応答 ──────────
                if (_SELF_REF_PATTERN.test(text)) {
                    _resolveNeoReply(_NEO_SELF_INTRO);
                    continue;
                }

                // ── Step 2a: 無効・期限切れ・漏洩扱いの API キー ─────────────────────
                if (intent.errorType === "INVALID_API_KEY") {
                    const offlineReply = _buildOfflineFallbackReply(text);
                    if (offlineReply) {
                        _resolveNeoReply(offlineReply);
                        continue;
                    }
                    _resolveNeoReply('ごめんね、ちょっと調子悪いみたい… しばらくしてからもう一度試してね。', { isError: true });
                    continue;
                }

                // ── Step 2b: APIキー未設定 ─────────────────────────────────────────
                if (!_hasValidApiKey() || intent.errorType === "NO_API_KEY") {
                    const offlineReply = _buildOfflineFallbackReply(text);
                    if (offlineReply) {
                        _resolveNeoReply(offlineReply);
                        continue;
                    }
                    _resolveNeoReply('ごめんね、ちょっと調子悪いみたい… 後でもう一度試してね。', { isError: true });
                    continue;
                }

                // ── Step 3: APIキーあり → ストリーミングでリアルタイム応答 ──────────
                try {
                    if (isChatViewActive()) {
                        const streamRow = pendingNeoRow || appendChatMessage('neo', '<span class="neo-stream-text" style="white-space:pre-wrap;"></span>');
                        const streamBubble = streamRow?.querySelector('.message-bubble.neo');
                        if (streamBubble) {
                            streamBubble.classList.remove('neo-thinking-bubble', 'neo-error-bubble');
                            streamBubble.innerHTML = '<span class="neo-stream-text" style="white-space:pre-wrap;"></span>';
                        }
                        const streamSpan = streamRow?.querySelector('.neo-stream-text');
                        const chatMessages = document.getElementById('chat-messages');

                        let finalText = '';
                        try {
                            finalText = await getNeoResponseStream(text, (_chunk, fullText) => {
                                if (streamSpan) streamSpan.textContent = fullText;
                                if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
                            });
                        } catch (streamErr) {
                            const isKeyErr =
                                streamErr?.message?.includes('INVALID_API_KEY') ||
                                streamErr?.message?.includes('NO_API_KEY') ||
                                streamErr?.message?.includes('quota') ||
                                /expired|API_KEY_INVALID|leaked/i.test(String(streamErr?.message || ''));
                            if (isKeyErr) {
                                if (streamRow) streamRow.remove();
                                pendingNeoRow = null;
                                _resolveNeoReply('ごめんね、ちょっと調子悪いみたい… しばらくしてからもう一度試してね。', { isError: true });
                                continue;
                            }
                            // その他のエラー → 非ストリーミングにフォールバック
                            console.warn('[Neo] Stream failed, falling back to non-stream:', streamErr);
                            try {
                                finalText = await getNeoResponse(text);
                                if (streamSpan) streamSpan.textContent = finalText;
                            } catch (fallback2) {
                                if (streamRow) streamRow.remove();
                                pendingNeoRow = null;
                                _resolveNeoReply('ごめんね、ちょっと調子悪いみたい… ネット接続を確認してもう一度試してね。', { isError: true });
                                continue;
                            }
                        }
                        pendingNeoRow = null;
                        neoResponded = true;

                        // FABバブルにも最終テキストを反映
                        if (finalText) {
                            const neoBubble = document.getElementById('neo-fab-bubble');
                            if (neoBubble) {
                                neoBubble.innerHTML = `<span>${finalText}</span>`;
                                neoBubble.classList.add('show');
                                setTimeout(() => { neoBubble.classList.remove('show'); }, 6000);
                            }
                        }
                    } else {
                        // チャット非表示時はFABバブルに非ストリーミングで表示
                        const replyText = await getNeoResponse(text);
                        const neoBubble = document.getElementById('neo-fab-bubble');
                        if (neoBubble) {
                            neoBubble.innerHTML = `<span>${replyText}</span>`;
                            neoBubble.classList.add('show');
                            setTimeout(() => { neoBubble.classList.remove('show'); }, 6000);
                        }
                    }
                } catch (fallbackError) {
                    _resolveNeoReply('ごめんね、ちょっと調子悪いみたい… 後でもう一度試してね。', { isError: true });
                }
            }
        }

        