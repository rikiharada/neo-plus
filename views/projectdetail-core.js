/**
 * Neo+ isolated Project Detail Engine
 */

// app.js が公開する前のフォールバック（モジュール評価時点で未定義の場合に備える）
const _parseActivityAmount = window._parseActivityAmount
    ?? ((v) => { if (!v) return 0; const n = parseFloat(String(v).replace(/,/g, '').trim()); return Number.isFinite(n) ? n : 0; });

        window.openProjectDetail = async (projectId, opts = {}) => {
            const pidStr = projectId == null ? '' : String(projectId);
            if (
                projectId == null ||
                projectId === '' ||
                pidStr === 'undefined' ||
                pidStr === 'null' ||
                pidStr === '[object Object]'
            ) {
                console.warn('[openProjectDetail] invalid projectId, abort');
                return;
            }

            const navigate = opts.navigate !== false;
            window.currentOpenProjectId = projectId;
            const proj = mockDB.projects.find((p) => String(p.id) === String(projectId));
            if (!proj) return;

            // DOM が未注入のときは遷移後、子の openProjectDetail が完了するまで await（fetch＋描画が確実に走る）
            if (!document.getElementById('view-project-detail')) {
                if (navigate) {
                    window.switchView('view-project-detail');
                    const deadline = Date.now() + 3000;
                    await new Promise((resolve) => {
                        const wait = () => {
                            if (document.getElementById('view-project-detail')) {
                                window.openProjectDetail(projectId, { navigate: false, skipFetch: opts.skipFetch })
                                    .then(resolve)
                                    .catch(resolve);
                            } else if (Date.now() < deadline) {
                                requestAnimationFrame(wait);
                            } else {
                                console.warn('[openProjectDetail] detail view DOM not ready in time');
                                resolve();
                            }
                        };
                        wait();
                    });
                }
                return;
            }

            /** Supabase の project_id と mock の projectId（数値ローカル / UUID）の候補を揃える */
            let dbProjectIdForQuery = projectId;
            window._attachDbSafeIdIfNeeded(proj);
            {
                const cid = String(proj.id ?? '').trim();
                if (/^\d+$/.test(cid)) {
                    dbProjectIdForQuery =
                        proj._dbSafeId != null
                            ? proj._dbSafeId
                            : window._toDbSafeId
                              ? window._toDbSafeId(proj.id)
                              : proj.id;
                } else {
                    dbProjectIdForQuery = proj.id;
                }
            }

            /** 同一プロジェクトの行を mock から落とす／Supabase の eq.in に使う（表記ゆれ対策） */
            const projectIdCandidates = [
                ...new Map(
                    [projectId, proj.id, dbProjectIdForQuery]
                        .filter((x) => x != null && x !== '')
                        .map((x) => [String(x), x])
                ).values()
            ];

            const _mockActivityMatchesProjectCandidates = (a) => {
                const ap = String(a.projectId ?? '');
                return projectIdCandidates.some((c) => String(c) === ap);
            };

            /** Supabase 取得成功時のみセット（経費はこの配列だけで計算。失敗時は null のまま mock にフォールバック） */
            let actSourceFromSupabase = null;
            /** actSourceFromSupabase が null のときデバッグ用（空配列 [] は「取得成功だが0件」と区別） */
            let actSourceFromSupabaseNullReason = null;

            if (!window.supabaseClient) {
                actSourceFromSupabaseNullReason = 'no supabaseClient';
            } else if (opts.skipFetch === true) {
                actSourceFromSupabaseNullReason = 'opts.skipFetch=true (activities fetch skipped)';
            }

            if (window.supabaseClient && opts.skipFetch !== true) {
                try {
                    let data = null;
                    let error = null;
                    let usedFallbackEq = false;
                    let lastCount = null;

                    const { data: sessWrap } = await window.supabaseClient.auth.getSession();
                    let uidForActivities = sessWrap?.session?.user?.id ?? null;
                    if (!uidForActivities) {
                        const { data: gu } = await window.supabaseClient.auth.getUser();
                        uidForActivities = gu?.user?.id ?? null;
                    }
                    if (!uidForActivities) {
                        console.warn(
                            '[openProjectDetail] No auth uid; cannot filter activities by user_id — expect 0 rows if RLS requires user_id = auth.uid().'
                        );
                    } else if (projectIdCandidates.length) {
                        await window._backfillActivitiesNullUserIdForProjects(
                            window.supabaseClient,
                            uidForActivities,
                            projectIdCandidates
                        );
                    }

                    const _activitiesBase = () => {
                        let q = window.supabaseClient.from('activities').select('*', { count: 'exact' });
                        if (uidForActivities) {
                            q = q.eq('user_id', uidForActivities);
                        }
                        return q;
                    };

                    console.log(
                        `[Query] user_id filter = ${uidForActivities ?? '(none)'} | project_id candidates = ${JSON.stringify(projectIdCandidates)}`
                    );

                    const q1res = await _activitiesBase()
                        .in('project_id', projectIdCandidates)
                        .order('date', { ascending: true });

                    if (q1res.error && projectIdCandidates.length > 1) {
                        usedFallbackEq = true;
                        const q2res = await _activitiesBase()
                            .eq('project_id', dbProjectIdForQuery)
                            .order('date', { ascending: true });
                        data = q2res.data;
                        error = q2res.error;
                        lastCount = q2res.count;
                    } else {
                        data = q1res.data;
                        error = q1res.error;
                        lastCount = q1res.count;
                    }

                    const rows = Array.isArray(data) ? data : [];

                    console.log(
                        '[openProjectDetail] Supabase raw response:',
                        _neoJsonStringifyForLog({
                            data,
                            error,
                            count: lastCount,
                            query: usedFallbackEq ? 'eq(project_id, dbProjectIdForQuery)' : 'in(project_id, projectIdCandidates)',
                            user_idFilter: uidForActivities ?? '(omitted — no auth uid)',
                            projectIdCandidates
                        })
                    );
                    if (!error && rows.length === 0) {
                        console.warn('[openProjectDetail] raw response is empty array (0 rows for this filter)');
                        console.warn(
                            'Supabase returned 0 rows despite INSERT success. Possible RLS or project_id mismatch.'
                        );
                        console.warn(
                            '[openProjectDetail] 可能性が高い原因: RLS で行が見えない、または DB の project_id が projectIdCandidates と一致しない、または activities.user_id が auth.uid() と一致しない。'
                        );
                        if (uidForActivities) {
                            console.warn(
                                '[openProjectDetail] Diagnosis: 0 rows with project_id + user_id = auth.uid(). If rows exist in SQL with user_id IS NULL, backfill user_id or INSERT will stay invisible under RLS.'
                            );
                        }
                    }
                    if (!error && rows.some((r) => r == null || r.user_id == null)) {
                        console.warn(
                            '[openProjectDetail] Some activity rows have user_id NULL in the payload — RLS/SELECT may still return them in edge cases; new INSERTs should always set user_id.'
                        );
                    }

                    console.log(
                        `[openProjectDetail] Supabase activities raw row count: ${rows.length}` +
                            (usedFallbackEq ? ' (query: eq fallback after .in error)' : ' (query: .in)')
                    );
                    console.log(
                        '[openProjectDetail] projectIdCandidates used in query (all values):',
                        projectIdCandidates.map((c) => ({
                            value: c,
                            valueType: typeof c,
                            asString: String(c)
                        }))
                    );

                    if (rows.length > 0) {
                        const sample = rows.slice(0, 2).map((r) => ({
                            project_id: r.project_id ?? r.projectId,
                            amount: r.amount
                        }));
                        console.log('[openProjectDetail] Supabase activities sample (first 1–2 rows):', sample);
                    }

                    if (!error && rows.length === 0) {
                        console.warn(
                            '[openProjectDetail] activities query returned 0 rows — projectIdCandidates (typed):',
                            projectIdCandidates.map((c) => ({
                                value: c,
                                valueType: typeof c,
                                asString: String(c)
                            })),
                            '| dbProjectIdForQuery =',
                            dbProjectIdForQuery,
                            '(valueType:',
                            typeof dbProjectIdForQuery,
                            ')',
                            '| UI projectId =',
                            projectId,
                            '(valueType:',
                            typeof projectId,
                            ')'
                        );
                        console.warn(
                            '[openProjectDetail] Possibility: rows may be filtered by RLS (no activities visible for current session / auth.uid()), or project_id does not match stored rows, or table is empty.'
                        );
                        try {
                            const { data: sessionWrap } = await window.supabaseClient.auth.getSession();
                            const sess = sessionWrap?.session;
                            console.warn('[openProjectDetail] ZERO ROWS — auth / RLS hint:', {
                                hasSession: !!sess,
                                userId: sess?.user?.id ?? null,
                                note:
                                    'If hasSession is false or userId is null, policies on activities often return 0 visible rows.'
                            });
                        } catch (authErr) {
                            console.warn('[openProjectDetail] ZERO ROWS — auth.getSession failed:', authErr);
                        }
                        console.warn('[openProjectDetail] ZERO ROWS — exact string match (candidates vs UI vs db query id):', {
                            uiProjectId: String(projectId),
                            dbProjectIdForQuery: String(dbProjectIdForQuery),
                            candidatesAsStrings: projectIdCandidates.map((c) => String(c)),
                            perCandidate: projectIdCandidates.map((c) => ({
                                value: c,
                                valueType: typeof c,
                                equalsUiString: String(c) === String(projectId),
                                equalsDbQueryString: String(c) === String(dbProjectIdForQuery),
                                strictTripleEqualUi: c === projectId,
                                strictTripleEqualDb: c === dbProjectIdForQuery
                            })),
                            interpretation:
                                'If no DB rows exist for these ids, INSERT may have used a different project_id. If rows exist in SQL but 0 here, suspect RLS or type coercion (uuid vs int).'
                        });
                        console.warn('[openProjectDetail] ZERO ROWS — PostgREST-style filters (client request shape):', {
                            table: 'activities',
                            operation: 'select',
                            filter: usedFallbackEq ? 'eq' : 'in',
                            column: 'project_id',
                            values: usedFallbackEq ? [dbProjectIdForQuery] : [...projectIdCandidates]
                        });
                        console.warn(
                            '[openProjectDetail] RLS policy may be filtering rows. Check if activities.user_id matches auth.uid(), and that INSERT used the same user_id as the current session.'
                        );
                        try {
                            const { data: authUserData } = await window.supabaseClient.auth.getUser();
                            console.warn(
                                '[openProjectDetail] ZERO ROWS — auth.uid() (JWT user id for RLS):',
                                authUserData?.user?.id ?? null
                            );
                        } catch (authUserErr) {
                            console.warn('[openProjectDetail] ZERO ROWS — auth.getUser failed:', authUserErr);
                        }
                        console.warn(
                            '[openProjectDetail] RLS is likely hiding rows: confirm activities.user_id == auth.uid() in the database for these project_ids, and that your SELECT policy allows SELECT for matching user_id.'
                        );
                    }

                    if (error) {
                        actSourceFromSupabaseNullReason = `Supabase select error: ${error.message || JSON.stringify(error)}`;
                        console.warn('[openProjectDetail] activities select error:', error);
                    } else if (typeof window.mapActivityRowToMock !== 'function') {
                        actSourceFromSupabaseNullReason = 'mapActivityRowToMock is not a function (cannot map rows)';
                        console.warn(actSourceFromSupabaseNullReason);
                    } else if (rows.length > 0) {
                        window.mockDB.activities = window.mockDB.activities.filter(
                            (a) => !window._mockActivityMatchesProjectCandidates(a)
                        );
                        const freshRows = rows.map((dbAct) => ({
                            ...window.mapActivityRowToMock(dbAct),
                            projectId
                        }));
                        if (freshRows.length === 1) {
                            const r0 = rows[0];
                            console.log('[openProjectDetail] freshRows snapshot (proof, row 1):', {
                                projectId: freshRows[0].projectId,
                                amount: freshRows[0].amount,
                                type: freshRows[0].type,
                                dbRowProjectId: r0?.project_id ?? r0?.projectId,
                                dbRowAmount: r0?.amount
                            });
                        } else {
                            console.log('[openProjectDetail] freshRows snapshot (proof, first 2 rows):', [
                                {
                                    projectId: freshRows[0].projectId,
                                    amount: freshRows[0].amount,
                                    type: freshRows[0].type,
                                    dbRowProjectId: rows[0]?.project_id ?? rows[0]?.projectId,
                                    dbRowAmount: rows[0]?.amount
                                },
                                {
                                    projectId: freshRows[1].projectId,
                                    amount: freshRows[1].amount,
                                    type: freshRows[1].type,
                                    dbRowProjectId: rows[1]?.project_id ?? rows[1]?.projectId,
                                    dbRowAmount: rows[1]?.amount
                                }
                            ]);
                        }
                        window.mockDB.activities.push(...freshRows);
                        window.persistLocalBody?.();
                        actSourceFromSupabase = freshRows;
                        actSourceFromSupabaseNullReason = null;
                        console.log(`Activities refresh: ${rows.length} row(s) from Supabase`);
                    } else {
                        /** Supabase 0 件: ローカル mock を消さない（RLS で見えないが INSERT 済みの可能性の診断用） */
                        actSourceFromSupabase = [];
                        actSourceFromSupabaseNullReason = null;
                        console.log(
                            '[openProjectDetail] freshRows snapshot: empty array (0 rows merged from Supabase)'
                        );
                        console.warn(
                            '[openProjectDetail] SUPABASE 0 rows — kept local mockDB activities for this project (not wiping) for diagnosis. Compare with SQL editor.'
                        );
                        console.log(`Activities refresh: ${rows.length} row(s) from Supabase`);
                    }
                } catch (e) {
                    actSourceFromSupabaseNullReason = `exception: ${e && e.message ? e.message : String(e)}`;
                    console.warn('[openProjectDetail] Supabase activities fetch failed, using local body', e);
                }
            }

            if (actSourceFromSupabase === null && actSourceFromSupabaseNullReason) {
                console.warn(
                    '[openProjectDetail] actSourceFromSupabase is null because:',
                    actSourceFromSupabaseNullReason
                );
            }

            const actSource =
                actSourceFromSupabase != null
                    ? actSourceFromSupabase.length > 0
                        ? actSourceFromSupabase
                        : mockDB.activities.filter(
                              (t) => window._mockActivityMatchesProjectCandidates(t) && !t.is_deleted
                          )
                    : mockDB.activities.filter(
                          (t) => window._mockActivityMatchesProjectCandidates(t) && !t.is_deleted
                      );

            // Update Color Bar
            const catColors = {
                it: '#3b82f6',
                transportation: '#f59e0b',
                accounting: '#8b5cf6',
                construction: '#10b981',
                design: '#ec4899',
                other: '#6b7280'
            };
            const cColor = proj.color || catColors[proj.category] || '#9ca3af';
            const colorBar = document.getElementById('detail-color-bar');
            if (colorBar) colorBar.style.backgroundColor = cColor;

            // Calc financials：Supabase に行があるときはリモート優先。0 件のときは診断用に mock を表示合計に使う
            let expenses;
            let incomesFromTx;
            let usedMockDiagnosisForSupabaseZero = false;
            if (actSourceFromSupabase != null) {
                const supabaseExpenseSum = actSourceFromSupabase
                    .filter((t) => !t.is_deleted && t.type !== 'income')
                    .reduce((acc, curr) => acc + _parseActivityAmount(curr.amount), 0);
                const supabaseIncomeSum = actSourceFromSupabase
                    .filter((t) => !t.is_deleted && t.type === 'income')
                    .reduce((acc, curr) => acc + _parseActivityAmount(curr.amount), 0);
                const mockExpenseSum = mockDB.activities
                    .filter(
                        (t) =>
                            window._mockActivityMatchesProjectCandidates(t) &&
                            !t.is_deleted &&
                            t.type !== 'income'
                    )
                    .reduce((acc, curr) => acc + _parseActivityAmount(curr.amount), 0);
                const mockIncomeSum = mockDB.activities
                    .filter(
                        (t) =>
                            window._mockActivityMatchesProjectCandidates(t) &&
                            !t.is_deleted &&
                            t.type === 'income'
                    )
                    .reduce((acc, curr) => acc + _parseActivityAmount(curr.amount), 0);

                if (actSourceFromSupabase.length === 0) {
                    expenses = mockExpenseSum;
                    incomesFromTx = mockIncomeSum;
                    usedMockDiagnosisForSupabaseZero = true;
                    console.warn(
                        '[openProjectDetail] SUPABASE 0 rows → using mock fallback for diagnosis (display totals use local mockDB for this project)',
                        {
                            supabaseExpenseSum,
                            mockLocalExpenseSum: mockExpenseSum,
                            mockLocalRowCount: mockDB.activities.filter(
                                (t) => window._mockActivityMatchesProjectCandidates(t) && !t.is_deleted
                            ).length
                        }
                    );
                } else {
                    expenses = supabaseExpenseSum;
                    incomesFromTx = supabaseIncomeSum;
                }
                console.log(
                    `Using actSourceFromSupabase for totals: ${actSourceFromSupabase.length} remote rows, expense sum (from Supabase rows) = ${supabaseExpenseSum}` +
                        (actSourceFromSupabase.length === 0 ? ` | mock expense sum (diagnosis) = ${mockExpenseSum}` : '')
                );
            } else {
                expenses = actSource
                    .filter((t) => !t.is_deleted && t.type !== 'income')
                    .reduce((acc, curr) => acc + _parseActivityAmount(curr.amount), 0);
                incomesFromTx = actSource
                    .filter((t) => !t.is_deleted && t.type === 'income')
                    .reduce((acc, curr) => acc + _parseActivityAmount(curr.amount), 0);
                console.log(
                    `[openProjectDetail] totals from mock fallback: ${actSource.length} rows, expense total = ${expenses}`
                );
            }

            if (actSourceFromSupabase === null) {
                console.warn(
                    '[openProjectDetail] expense context before final total: actSourceFromSupabase is null — reason:',
                    actSourceFromSupabaseNullReason || 'unknown (fetch not run or no reason recorded)'
                );
            } else if (actSourceFromSupabase.length === 0) {
                console.warn(
                    '[openProjectDetail] expense context: Supabase returned 0 rows — display uses mock diagnosis if local rows exist; see raw response + auth.uid() above'
                );
            }

            const _expenseSourceTag =
                actSourceFromSupabase != null
                    ? `Supabase actSourceFromSupabase (${actSourceFromSupabase.length} rows)`
                    : `mock fallback (${actSource.length} rows)`;
            const _calculationSource =
                actSourceFromSupabase === null
                    ? 'MOCK'
                    : usedMockDiagnosisForSupabaseZero
                      ? 'MOCK_DIAGNOSIS_SUPABASE_EMPTY'
                      : 'SUPABASE';
            console.log(
                `final expense total (display) = ${expenses} [source: ${_expenseSourceTag}] [calculationSource: ${_calculationSource}]`
            );
            if (actSourceFromSupabase === null) {
                console.warn(
                    '[openProjectDetail] Calculation fell back to MOCK because actSourceFromSupabase is null (Supabase fetch skipped, failed, or map missing).'
                );
            } else if (usedMockDiagnosisForSupabaseZero) {
                console.warn(
                    '[openProjectDetail] Display expense uses MOCK while Supabase SELECT returned 0 rows — if mock > 0, data exists locally or RLS blocked remote read; verify activities.user_id == auth.uid() in DB.'
                );
            }
            if (typeof window.renderProjects === 'function') {
                try {
                    window.renderProjects(window.mockDB.projects);
                } catch {
                    /* ignore */
                }
            }
            const invoices = mockDB.documents.filter(d => String(d.projectId) === String(projectId) && d.type === 'invoice');
            const invoiceSum = invoices.length > 0 ? invoices.reduce((acc, curr) => acc + curr.amount, 0) : 0;

            const revenue = (incomesFromTx + invoiceSum) > 0 ? (incomesFromTx + invoiceSum) : (proj.revenue || 0);
            const profit = revenue - expenses;
            const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;

            // Target gauge logic (mock target of 1,000,000 or dynamic based on project if we had it)
            const targetProfit = 1000000;
            const progressPercent = Math.min(100, Math.max(0, (profit / targetProfit) * 100));

            // Update UI
            const nameEl = document.getElementById('detail-project-name');
            if (nameEl) nameEl.textContent = proj.name;
            const tagsCont = document.getElementById('detail-project-tags');
            if (tagsCont) {
                let tagsHtml = '';
                if (proj.startDate) tagsHtml += `<span class="tag tag-blue" style="font-size:10px; padding:2px 6px; border-radius:4px;"><i data-lucide="calendar" style="width:10px;height:10px;margin-right:2px;"></i>${proj.startDate}</span>`;
                if (proj.location)  tagsHtml += `<span class="tag" style="background:var(--bg-color); color:var(--text-main); font-size:10px; padding:2px 6px; border-radius:4px;"><i data-lucide="map-pin" style="width:10px;height:10px;margin-right:2px;color:var(--accent-neo-blue);"></i>${proj.location}</span>`;
                if (proj.category && proj.category !== 'other') tagsHtml += `<span class="tag" style="background:var(--btn-secondary-bg); color:var(--text-muted); font-size:10px; padding:2px 6px; border-radius:4px;">${proj.category}</span>`;
                tagsCont.innerHTML = tagsHtml;
                if (window.lucide) window.lucide.createIcons();
            }
            const revEl = document.getElementById('detail-revenue');
            if (revEl) revEl.textContent = `¥${revenue.toLocaleString()}`;
            const expEl = document.getElementById('detail-expense');
            if (expEl) expEl.textContent = `¥${expenses.toLocaleString()}`;

            // Formula mini-indicators
            const revMiniEl = document.getElementById('detail-revenue-mini');
            if (revMiniEl) revMiniEl.textContent = `¥${revenue.toLocaleString()}`;
            const expMiniEl = document.getElementById('detail-expense-mini');
            if (expMiniEl) expMiniEl.textContent = `¥${expenses.toLocaleString()}`;

            const profEl = document.getElementById('detail-profit');
            if (profEl) profEl.textContent = `¥${profit.toLocaleString()}`;

            // Update Dashboard Note
            const noteEl = document.getElementById('detail-project-note');
            if (noteEl) {
                noteEl.value = proj.note || '';
                // Auto-resize textarea height
                setTimeout(() => {
                    noteEl.style.height = '';
                    noteEl.style.height = noteEl.scrollHeight + 'px';
                }, 10);
            }

            // --- Update PDF Document Count & Empty States ---
            const docCountEl = document.getElementById('detail-doc-count');
            const galleryEl = document.getElementById('detail-photo-gallery');
            
            // Safe initialize mock files
            if (!window.mockDB.files) window.mockDB.files = [];
            const projectFiles = window.mockDB.files.filter((f) => String(f.projectId) === String(projectId));
            
            // 1. Render PDFs
            const pdfFiles = projectFiles.filter(f => f.type === 'Documents');
            if (docCountEl) {
                if (pdfFiles.length > 0) {
                    let pdfHtml = `<div style="display:flex; flex-direction:column; gap:8px;">`;
                    pdfFiles.forEach(f => {
                        pdfHtml += `<a href="${f.webViewLink}" target="_blank" style="display:flex; align-items:center; gap:8px; padding:8px; background:var(--btn-secondary-bg); border-radius:8px; text-decoration:none; color:var(--text-main); border:1px solid var(--btn-secondary-border); font-size:12px;">
                            <i data-lucide="file-text" style="width:14px;height:14px;color:#ef4444;"></i>
                            <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${f.name}</span>
                        </a>`;
                    });
                    pdfHtml += `</div>`;
                    docCountEl.innerHTML = pdfHtml;
                } else {
                    docCountEl.innerHTML = `<div style="font-size: 11px; font-weight: 400; color: var(--text-muted); margin-top: 4px;">データなし</div>`;
                }
            }

            // 2. Render Photos
            const photoFiles = projectFiles.filter(f => f.type === 'Photos');
            if (galleryEl) {
                if (photoFiles.length > 0) {
                    let photoHtml = '';
                    photoFiles.forEach(f => {
                        const thumb = f.thumbnailLink || 'https://via.placeholder.com/80';
                        photoHtml += `<a href="${f.webViewLink}" target="_blank" style="display:block; width:48px; height:48px; border-radius:8px; overflow:hidden; border:1px solid rgba(0,0,0,0.1); flex-shrink:0;">
                            <img src="${thumb}" style="width:100%; height:100%; object-fit:cover;" title="${f.name}">
                        </a>`;
                    });
                    galleryEl.innerHTML = `<div style="display:flex; gap:8px; overflow-x:auto; padding-bottom:4px;">${photoHtml}</div>`;
                } else {
                    galleryEl.innerHTML = `<div style="font-size: 11px; font-weight: 400; color: var(--text-muted); margin-top: 4px;">データなし</div>`;
                }
            }

            // Update Margin Gauge & Percent
            const marginPercentEl = document.getElementById('detail-margin-percent');
            if (marginPercentEl) marginPercentEl.textContent = `${margin}%`;
            const marginGaugeEl = document.getElementById('detail-margin-gauge');
            // Animate gauge width
            if (marginGaugeEl) {
                // Reset to 0 briefly to trigger CSS transition every open
                marginGaugeEl.style.width = '0%';
                setTimeout(() => {
                    marginGaugeEl.style.width = `${progressPercent}%`;
                }, 50);
            }

            // Build timeline (Combined documents and transactions)
            const tlContainer = document.getElementById('activity-list-container');
            let combined = [];
            if (tlContainer) {
                tlContainer.innerHTML = '';

                // Unpaid Alert
                if (proj.hasUnpaid) {
                    const alertHtml = `
                        <div class="alert-banner" style="margin-bottom: var(--spacing-sm);">
                            <i data-lucide="alert-circle" style="width: 16px; height: 16px;"></i>
                            <span>未入金の請求があります</span>
                        </div>
                    `;
                    tlContainer.insertAdjacentHTML('beforeend', alertHtml);
                }

                combined = [
                    ...actSource.filter((t) => !t.is_deleted),
                    ...mockDB.documents.filter((d) => String(d.projectId) === String(projectId))
                ];
                // Sort descending (basic string comparison for mock dates)
                combined.sort((a, b) => new Date(b.date) - new Date(a.date));

                if (combined.length === 0) {
                    tlContainer.innerHTML += '<div style="width: 100%; text-align: center;"><p style="color: var(--text-muted); font-size: 13px; padding: 20px 0; margin: 0;">履歴はありません。</p></div>';
                } else {
                    combined.forEach(item => {
                        // Use unified Transaction Row factory
                        // Documents use a generic form, Transactions use the full form
                        if (!item.amount && !item.category) {
                           // It's a document. For now, keep a simple item or map it to the row factory
                           // Mocking a document shape for the generic row factory
                           const docTx = {
                               id: item.id,
                               title: item.title,
                               date: item.date,
                               amount: 0,
                               type: 'document',
                               category: '書類'
                           };
                           const row = window.createTransactionRow(docTx, true);
                           tlContainer.appendChild(row);
                        } else {
                           // It's a standard transaction
                           const row = window.createTransactionRow(item, true, (tx) => {
                               // Ensure we only open the modal for editables
                               if (tx.type === 'expense' || tx.type === 'income' || tx.type === 'labor') {
                                   window.openEditExpenseModal(tx.id);
                               }
                           });
                           // To match the original timeline CSS hook used for filtering
                           row.classList.add('activity-list-item'); 
                           tlContainer.appendChild(row);
                        }
                    });
                }
            }

            // Inline search listener setup
            const searchInput = document.getElementById('passbook-search');
            if (searchInput) {
                searchInput.value = ''; // clear on open
                searchInput.oninput = (e) => {
                    const term = e.target.value.toLowerCase();
                    const items = tlContainer.querySelectorAll('.activity-list-item');
                    items.forEach(item => {
                        const text = item.textContent.toLowerCase();
                        item.style.display = text.includes(term) ? 'grid' : 'none';
                    });
                };
            }

            // Custom Expense Edit Modal Logic
// ---- NEO CONFIRMATION GATE LOGIC ----
            window.aiCorrectionLog = JSON.parse(localStorage.getItem('neo_ai_corrections') || '[]');

// ---- GLOBAL LEXICON CONTRIBUTION ENGINE ----
// ------------------------------------

            // Populate Profit AI Hints
            const aiHintsContainer = document.getElementById('profit-ai-hints');
            if (aiHintsContainer) {
                aiHintsContainer.innerHTML = '';
                const hints = [];

                // Hint 1: Based on margin
                if (margin > 30) {
                    hints.push(`<li style="font-size: 13px; color: var(--text-main); display: grid; grid-auto-flow: column; justify-content: start; align-items: start; gap: 8px;"><i data-lucide="check-circle-2" style="width: 16px; height: 16px; color: #10b981;  margin-top: 2px;"></i><span>大変優秀な利益率（${margin}％）です。この人員配置パターンを別の現場でも横展開しましょう。</span></li>`);
                } else if (margin > 0) {
                    hints.push(`<li style="font-size: 13px; color: var(--text-main); display: grid; grid-auto-flow: column; justify-content: start; align-items: start; gap: 8px;"><i data-lucide="trending-up" style="width: 16px; height: 16px; color: var(--accent-neo-blue);  margin-top: 2px;"></i><span>資材（経費）の仕入れ先を1社にまとめると、あと3%〜5%の利益改善が見込めます。</span></li>`);
                } else {
                    hints.push(`<li style="font-size: 13px; color: var(--text-main); display: grid; grid-auto-flow: column; justify-content: start; align-items: start; gap: 8px;"><i data-lucide="alert-triangle" style="width: 16px; height: 16px; color: #f59e0b;  margin-top: 2px;"></i><span>現在赤字ペースです。追加請求の交渉か、直近の人工（稼働）の削減を推奨します。</span></li>`);
                }

                // Hint 2: Unpaid check
                if (proj.hasUnpaid) {
                    hints.push(`<li style="font-size: 13px; color: var(--text-main); display: grid; grid-auto-flow: column; justify-content: start; align-items: start; gap: 8px;"><i data-lucide="clock" style="width: 16px; height: 16px; color: #f43f5e;  margin-top: 2px;"></i><span>未入金の請求書が1件あります。キャッシュフロー悪化を防ぐため、本日中にリマインド連絡を。</span></li>`);
                } else {
                    hints.push(`<li style="font-size: 13px; color: var(--text-main); display: grid; grid-auto-flow: column; justify-content: start; align-items: start; gap: 8px;"><i data-lucide="shield-check" style="width: 16px; height: 16px; color: var(--accent-neo-blue);  margin-top: 2px;"></i><span>過去の請求はすべて入金済みです（iCloudデータ同期確認済）。健全な資金繰りです。</span></li>`);
                }

                // Hint 3: Generic AI insight
                hints.push(`<li style="font-size: 13px; color: var(--text-main); display: grid; grid-auto-flow: column; justify-content: start; align-items: start; gap: 8px;"><i data-lucide="lightbulb" style="width: 16px; height: 16px; color: #f59e0b;  margin-top: 2px;"></i><span>類似規模の過去プロジェクトと比較して、発注書の作成タイミングが平均2日遅れています。</span></li>`);

                aiHintsContainer.innerHTML = hints.join('');
            }

            // Neo Suggestion
            const neoBubble = document.getElementById('neo-fab-bubble');
            if (neoBubble) {
                let msg = `現在の利益率は${margin}％。次は資材の一括発注でさらに＋3%を目指そう！`;
                if (proj.hasUnpaid) {
                    msg = '未入金の請求書があります！すぐリマインド連絡（＋アクション）をしよう！';
                } else if (combined.length === 0) {
                    msg = 'まずは見積書を作成して、プロジェクトを前に進めよう（＋）！';
                }
                const originalText = neoBubble.textContent;
                neoBubble.textContent = msg;
                neoBubble.classList.add('show');
                setTimeout(() => {
                    neoBubble.classList.remove('show');
                    setTimeout(() => { neoBubble.textContent = originalText; }, 300);
                }, 4000);
            }

            if (window.lucide) {
                window.lucide.createIcons();
            }

            if (navigate) window.switchView('view-project-detail');
        };
