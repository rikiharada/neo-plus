/** Project Detail Modals */
            window.openEditExpenseModal = (txId) => {
                const tx = mockDB.activities.find(t => t.id == txId);
                if (!tx || (tx.type !== 'expense' && tx.type !== 'income' && tx.type !== 'labor')) return; // Limit to editables

                const idEl = document.getElementById('edit-tx-id');
                const titleEl = document.getElementById('edit-tx-title');
                const amountEl = document.getElementById('edit-tx-amount');
                const catSelect = document.getElementById('edit-tx-category');
                const modal = document.getElementById('modal-edit-expense');

                if (!modal || !idEl || !titleEl || !amountEl) {
                    console.error('DOM Error: Edit Expense Modal elements not found.');
                    return;
                }

                idEl.value = tx.id;
                titleEl.value = tx.title || '';
                amountEl.value = tx.amount || 0;

                if (catSelect) catSelect.value = tx.category || '雑費';

                modal.classList.remove('hidden');
                modal.classList.add('show');
            };

            
window.closeEditExpenseModal = () => {
                const modal = document.getElementById('modal-edit-expense');
                if (!modal) return;

                modal.classList.remove('show');

                setTimeout(() => {
                    modal.classList.add('hidden');
                }, 300);
            };

            
window.deleteTransaction = async () => {
                const idEl = document.getElementById('edit-tx-id');
                if (!idEl || !idEl.value) return;
                const txId = idEl.value;

                const tx = mockDB.activities.find(t => t.id == txId);
                if (tx) {
                    tx.is_deleted = true; // Local Logical Delete

                    // Persistent Supabase Delete Sync
                    if (window.supabaseClient) {
                        try {
                            const query = window.supabaseClient.from('activities').update({
                                is_deleted: true
                            }).match({
                                title: tx.title,
                                amount: tx.amount,
                                date: tx.date
                            });
                            await query;
                            console.log("[Neo AI] Supabase DELETE sync success:", tx.title);
                        } catch (e) { console.error('Supabase Delete Error:', e); }
                    }
                }

                window.closeEditExpenseModal();

                // Recalculate all totals and re-render UI exactly as requested
                window.renderProjects(mockDB.projects);
                if (window.currentOpenProjectId) {
                    window.openProjectDetail(window.currentOpenProjectId);
                }

                const neoFabBubble = document.getElementById('neo-fab-bubble');
                if (neoFabBubble) {
                    neoFabBubble.textContent = `⚡️ 項目を削除して、合計値を再計算したよ。`;
                    neoFabBubble.classList.add('show');
                    setTimeout(() => neoFabBubble.classList.remove('show'), 3000);
                }
            };

            
window.saveEditedExpense = async () => {
                const txId = document.getElementById('edit-tx-id').value;
                const newTitle = document.getElementById('edit-tx-title').value.trim();
                const newAmount = document.getElementById('edit-tx-amount').value;
                const newCategory = document.getElementById('edit-tx-category').value;

                if (!newTitle) {
                    alert('内容を入力してください');
                    return;
                }

                await window.updateTransaction(Number(txId), {
                    title: newTitle,
                    amount: newAmount,
                    category: newCategory
                });

                window.closeEditExpenseModal();

                // Re-render the detail view to reflect changes and potentially update Neo's hints
                window.openProjectDetail(window.currentOpenProjectId);
            };

            