/**
 * Neo+ Dashboard Projects Component
 */
import { createProjectCard } from '../lib/components.js';

// app.js が公開する前のフォールバック（モジュール評価時点で未定義の場合に備える）
const _parseActivityAmount = window._parseActivityAmount
    ?? ((v) => { if (!v) return 0; const n = parseFloat(String(v).replace(/,/g, '').trim()); return Number.isFinite(n) ? n : 0; });

function _sumNonIncomeActivityAmountForProject(projId) {
    const list = window.mockDB?.activities || [];
    return list
        .filter(
            (t) =>
                String(t.projectId) === String(projId) &&
                !t.is_deleted &&
                t.type !== 'income'
        )
        .reduce((acc, curr) => acc + _parseActivityAmount(curr.amount), 0);
}

window.applyProjectFilter = (filterType, resetPage = true) => {
        let sortedFiltered = [...window.mockDB.projects];

        if (resetPage) {
            window.currentProjectPage = 1;
        }

        if (!filterType) {
            const activeSortOpt = document.querySelector('#filter-dropdown .filter-option.active');
            filterType = activeSortOpt ? activeSortOpt.getAttribute('data-filter') : 'newest';
        }

        // Apply Text Search Filter (Name or Location)
        const searchInput = document.getElementById('filter-search-input');
        let isFilteredBySearch = false;
        if (searchInput && searchInput.value.trim()) {
            const query = searchInput.value.trim().toLowerCase();
            sortedFiltered = sortedFiltered.filter(p => {
                const nameMatch = (p.name || '').toLowerCase().includes(query);
                const locMatch = (p.location || '').toLowerCase().includes(query);
                return nameMatch || locMatch;
            });
            isFilteredBySearch = true;
        }

        // Apply Time Period Filter
        const periodInput = document.getElementById('filter-period');
        let isFilteredByDate = false;
        if (periodInput && periodInput.value) {
            const [yearStr, monthStr] = periodInput.value.split('-');
            const fYear = parseInt(yearStr, 10);
            const fMonth = parseInt(monthStr, 10);

            sortedFiltered = sortedFiltered.filter(p => {
                const pDate = new Date(p.lastUpdated || p.id);
                return pDate.getFullYear() === fYear && (pDate.getMonth() + 1) === fMonth;
            });
            isFilteredByDate = true;
        }

        // Highlight the filter button if any filter is applied
        const btnFilterProjects = document.getElementById('btn-filter-projects');
        if (btnFilterProjects) {
            if (filterType !== 'newest' || isFilteredByDate || isFilteredBySearch) {
                btnFilterProjects.classList.add('filter-active');
            } else {
                btnFilterProjects.classList.remove('filter-active');
            }
        }

        // Apply Sorting Logic
        if (filterType === 'newest') {
            sortedFiltered.sort((a, b) => b.id - a.id);
        } else if (filterType === 'date-desc') {
            sortedFiltered.sort((a, b) => new Date(b.lastUpdated || b.id) - new Date(a.lastUpdated || a.id));
        } else if (filterType === 'cost-desc') {
            sortedFiltered.sort((a, b) => {
                const costA = _sumNonIncomeActivityAmountForProject(a.id);
                const costB = _sumNonIncomeActivityAmountForProject(b.id);
                return costB - costA;
            });
        }

        // Re-render the list
        renderProjects(sortedFiltered, false);
    };

window.renderProjects = (projectsToRender, resetPage = true) => {
        const container = document.getElementById('project-list-container');
        const paginationContainer = document.getElementById('project-pagination-container');
        if (!container) return;

        if (resetPage) {
            window.currentProjectPage = 1;
        }

        // CEO Fix: Default sort should ALWAYS be Created At (newest) first.
        // If the raw window.mockDB.projects array is passed, we clone and sort it desc by ID.
        if (projectsToRender === window.mockDB.projects) {
            projectsToRender = [...window.mockDB.projects].sort((a, b) => b.id - a.id);
        }

        container.innerHTML = '';
        if (paginationContainer) paginationContainer.innerHTML = '';

        window.totalAgencyProfit = 0;

        if (projectsToRender.length === 0) {
            container.innerHTML = '<p style="padding: var(--spacing-lg); color: var(--text-muted); text-align: center;">プロジェクトはありません</p>';
            const totalWealthEl = document.getElementById('total-wealth-balance');
            if (totalWealthEl) totalWealthEl.textContent = '¥0';
            return;
        }

        // --- Pagination Logic (Max 10 per page) ---
        window.ITEMS_PER_PAGE = 10;
        const totalPages = Math.ceil(projectsToRender.length / window.ITEMS_PER_PAGE);

        // Safety check if window.currentProjectPage exceeds new totalPages
        if (window.currentProjectPage > totalPages) {
            window.currentProjectPage = Math.max(1, totalPages);
        }

        const startIndex = (window.currentProjectPage - 1) * window.ITEMS_PER_PAGE;
        const endIndex = startIndex + window.ITEMS_PER_PAGE;
        const pagedProjects = projectsToRender.slice(startIndex, endIndex);

        pagedProjects.forEach(proj => {
            // Calculate Profit Balance（明細 openProjectDetail の経費定義と一致: income 以外を合算）
            const mockRevenue = proj.revenue || 1000000;
            const totalCost = _sumNonIncomeActivityAmountForProject(proj.id);
            const projectProfit = mockRevenue - totalCost;

            window.totalAgencyProfit += projectProfit;

            // Componentized Neo-Sync v2.0 Project Card Generation
            const card = createProjectCard(proj);

            // Inherit the Total Cost display logic to keep Dashboard metrics intact
            const displayCost = `コスト: ¥${totalCost.toLocaleString()}`;
            const costBadge = document.createElement('div');
            costBadge.style.cssText = 'position: absolute; top: 16px; right: 16px; font-size: 11px; padding: 4px 8px; font-weight: 500; background: rgba(0,0,0,0.05); color: var(--text-muted); border-radius: 12px;';
            costBadge.textContent = displayCost;
            card.appendChild(costBadge);

            container.appendChild(card);
        });

        // --- Render Pagination Controls ---
        if (paginationContainer && totalPages > 1) {
            const btnPrev = document.createElement('button');
            btnPrev.innerHTML = '<i data-lucide="chevron-left" style="width: 16px; height: 16px;"></i> 前へ';
            btnPrev.style.cssText = `background: var(--btn-secondary-bg); border: 1.2px solid var(--btn-secondary-border); color: var(--text-main); padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; font-family: inherit; cursor: pointer; display: grid; grid-auto-flow: column; justify-content: start; align-items: center; gap: 4px; opacity: ${window.currentProjectPage === 1 ? '0.3' : '1'}; pointer-events: ${window.currentProjectPage === 1 ? 'none' : 'auto'}; transition: transform 0.1s;`;
            btnPrev.onmousedown = () => btnPrev.style.transform = 'scale(0.95)';
            btnPrev.onmouseup = () => btnPrev.style.transform = 'scale(1)';
            btnPrev.onmouseleave = () => btnPrev.style.transform = 'scale(1)';
            btnPrev.onclick = () => {
                if (window.currentProjectPage > 1) {
                    window.currentProjectPage--;
                    renderProjects(projectsToRender, false);
                    document.querySelector('.content-area').scrollTo({ top: 0, behavior: 'smooth' });
                }
            };

            const pageIndicator = document.createElement('span');
            pageIndicator.style.cssText = 'font-size: 14px; font-weight: 600; color: var(--text-main); min-width: 50px; text-align: center; letter-spacing: 0.05em;';
            pageIndicator.textContent = `${window.currentProjectPage} / ${totalPages}`;

            const btnNext = document.createElement('button');
            btnNext.innerHTML = '次へ <i data-lucide="chevron-right" style="width: 16px; height: 16px;"></i>';
            btnNext.style.cssText = `background: var(--btn-secondary-bg); border: 1.2px solid var(--btn-secondary-border); color: var(--text-main); padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; font-family: inherit; cursor: pointer; display: grid; grid-auto-flow: column; justify-content: start; align-items: center; gap: 4px; opacity: ${window.currentProjectPage === totalPages ? '0.3' : '1'}; pointer-events: ${window.currentProjectPage === totalPages ? 'none' : 'auto'}; transition: transform 0.1s;`;
            btnNext.onmousedown = () => btnNext.style.transform = 'scale(0.95)';
            btnNext.onmouseup = () => btnNext.style.transform = 'scale(1)';
            btnNext.onmouseleave = () => btnNext.style.transform = 'scale(1)';
            btnNext.onclick = () => {
                if (window.currentProjectPage < totalPages) {
                    window.currentProjectPage++;
                    renderProjects(projectsToRender, false);
                    document.querySelector('.content-area').scrollTo({ top: 0, behavior: 'smooth' });
                }
            };

            paginationContainer.appendChild(btnPrev);
            paginationContainer.appendChild(pageIndicator);
            paginationContainer.appendChild(btnNext);
        }

        // Update Total Wealth Header
        const totalWealthEl = document.getElementById('total-wealth-balance');
        if (totalWealthEl) {
            totalWealthEl.textContent = `¥${window.totalAgencyProfit.toLocaleString()}`;
        }

        // --- NEW: Update Wallet Dashboard (Healthcare UI + Tax Hub) --
        if (typeof window.updateWalletDashboard === 'function') {
            window.updateWalletDashboard(window.totalAgencyProfit);
        }


        if (window.lucide) {
            window.lucide.createIcons();
        }
    };

