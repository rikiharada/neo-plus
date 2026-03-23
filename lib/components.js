/**
 * Neo+ Shared UI Component Library (v1.0 - Trinity Architecture)
 * 
 * Provides pure JS functional components to guarantee standard Neo aesthetics:
 * - 12px Floating Elements
 * - Day Mode only
 * - Unified Tag Colors & Spacing
 */

// 1. Unified Neo Button Factory
export function createNeoButton(id, text, iconName, type = 'secondary', onClick) {
    const btn = document.createElement('button');
    btn.id = id;
    
    // Aesthetic Enforcement
    if (type === 'primary') {
        btn.className = 'btn-primary';
        btn.style.cssText = 'background: #000; color: #fff; border: none; border-radius: 10px; padding: 12px; font-weight: 600; display: grid; place-items: center; gap: 8px; width: 100%; transition: opacity 0.2s;';
    } else if (type === 'electric') {
        btn.className = 'btn-electric';
        btn.style.cssText = 'background: #000; color: #fff; border: none; border-radius: 10px; padding: 12px; font-weight: 600; display: grid; place-items: center; gap: 8px; width: 100%; box-shadow: 0 0 15px rgba(29, 155, 240, 0.4); border: 1px solid rgba(29, 155, 240, 0.5);';
    } else {
        // Outline / Secondary
        btn.className = 'btn-secondary';
        btn.style.cssText = 'background: var(--btn-secondary-bg); color: var(--text-main); border: 1px solid var(--btn-secondary-border); border-radius: 10px; padding: 12px; font-weight: 600; display: grid; place-items: center; gap: 8px; width: 100%;';
    }

    let innerHTML = '';
    if (iconName) {
        innerHTML += `<i data-lucide="${iconName}" style="width: 18px; height: 18px; ${type==='primary' || type==='electric' ? 'color:#fff;' : 'color:var(--text-main);'}"></i> `;
    }
    innerHTML += text;
    
    btn.innerHTML = innerHTML;

    if (onClick) {
        btn.addEventListener('click', onClick);
    }

    return btn;
}

// 2. Project Card Factory
export function createProjectCard(proj) {
    let unreadBadge = '';
    if (proj.hasUnpaid) {
        unreadBadge = '<span style="display:inline-block; width:8px; height:8px; background-color:#FF3B30; border-radius:50%; margin-left:8px;"></span>';
    }

    const card = document.createElement('div');
    card.className = 'project-card';
    card.dataset.id = proj.id;
    card.style.cssText = 'background: var(--bg-color); border: 1px solid var(--btn-secondary-border); border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.02); display: grid; gap: 8px; position: relative; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;';
    card.onclick = () => { if (window.openProjectDetail) window.openProjectDetail(proj.id); };

    // Standard Neo Date Tag logic (relative time)
    let dateStr = proj.startDate || "-";
    let isToday = false;
    let isPast = false;
    let isAlert = false;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    if (proj.startDate) {
        const cleanDate = proj.startDate.replace(/\//g, '-');
        if (cleanDate === todayStr) isToday = true;
        if (cleanDate < todayStr) isPast = true;
    }

    let statusDisplay = `<div class="tag tag-blue"><i data-lucide="calendar" style="width:12px; height:12px; margin-right:4px;"></i>${dateStr}</div>`;
    if (isToday) {
        statusDisplay = `<div class="tag tag-alert"><i data-lucide="alert-circle" style="width:12px; height:12px; margin-right:4px;"></i>本日</div>`;
        isAlert = true;
    } else if (isPast) {
        statusDisplay = `<div class="tag" style="background:var(--bg-color); color:var(--text-muted);"><i data-lucide="check-circle" style="width:12px; height:12px; margin-right:4px;"></i>完了</div>`;
    }

    card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <div style="width: 12px; height: 12px; border-radius: 50%; background-color: ${proj.color || '#1D9BF0'};"></div>
                <h3 style="font-size: 16px; font-weight: 700; color: var(--text-main); line-height: 1.3; margin: 0; padding-right: 24px;">${proj.name}</h3>
                ${unreadBadge}
            </div>
            ${isAlert ? '<i data-lucide="zap" style="width: 16px; height: 16px; color: #1D9BF0; flex-shrink: 0; fill: rgba(29, 155, 240, 0.2);"></i>' : ''}
        </div>
        
        <div style="display: flex; gap: 6px; margin-top: 4px; flex-wrap: wrap;">
            ${statusDisplay}
            <div class="tag" style="background: var(--bg-color); color: var(--text-main);"><i data-lucide="map-pin" style="width: 12px; height: 12px; margin-right: 4px; color: var(--accent-neo-blue);"></i>${proj.location || '-'}</div>
        </div>
        
        <div style="position: absolute; bottom: 16px; right: 16px; display: flex; align-items: center; gap: 4px;">
            <span style="font-size: 13px; font-weight: 700; color: var(--text-main);">¥${(proj.revenue || 0).toLocaleString()}</span>
            <i data-lucide="chevron-right" style="width: 16px; height: 16px; color: var(--text-muted);"></i>
        </div>
    `;

    return card;
}

// 3. Receipt/Transaction Row Factory
export function createTransactionRow(tx, isProjectContext = false, onEdit) {
    const row = document.createElement('div');
    row.className = 'transaction-item';
    row.dataset.id = tx.id;
    row.style.cssText = 'padding: 16px; background: var(--bg-color); border-bottom: 1px solid var(--btn-secondary-border); display: grid; grid-template-columns: 40px 1fr auto; gap: 12px; align-items: center;';

    const isExpense = tx.type === 'expense';
    const amountColor = isExpense ? 'var(--text-main)' : '#10b981';
    const sign = isExpense ? '-' : '+';
    
    // Strict Icon mapping based on Standard Dictionary
    let iconName = 'receipt';
    if (tx.category === '旅費交通費') iconName = 'train';
    else if (tx.category === '接待交際費') iconName = 'coffee';
    else if (tx.category === '外注工賃') iconName = 'users';
    else if (tx.category === '通信費') iconName = 'wifi';
    else if (tx.type === 'income') iconName = 'arrow-down-left';

    const iconBg = isExpense ? 'var(--bg-color)' : 'rgba(16, 185, 129, 0.1)';
    const iconColor = isExpense ? 'var(--text-muted)' : '#10b981';

    // Meta display string
    let metaStr = `<span style="display: inline-flex; align-items: center; gap: 4px; color: var(--text-muted); font-size: 12px;">`;
    if (!isProjectContext && tx.projectId && tx.projectId !== 'global' && window.mockDB) {
        const p = window.mockDB.projects.find(p => p.id === tx.projectId);
        if (p) metaStr += `<i data-lucide="folder" style="width:10px; height:10px;"></i> ${p.name} `;
    }
    metaStr += `<span>${tx.date.substring(5)}</span>`; // Show MM/DD
    metaStr += `</span>`;

    // AI correction badge
    let aiBadge = '';
    if (tx.is_user_corrected) {
        aiBadge = `<span style="margin-left:6px; font-size:9px; background: rgba(29,155,240,0.1); color: var(--accent-neo-blue); padding: 2px 4px; border-radius: 4px;">学習済</span>`;
    }

    row.innerHTML = `
        <div style="width: 40px; height: 40px; background: ${iconBg}; border-radius: 10px; display: grid; place-items: center;">
            <i data-lucide="${iconName}" style="width: 20px; height: 20px; color: ${iconColor};"></i>
        </div>
        <div style="display: grid; gap: 2px;">
            <div style="font-size: 14px; font-weight: 600; color: var(--text-main); display: flex; align-items: center;">
                ${tx.title} ${aiBadge}
            </div>
            ${metaStr}
        </div>
        <div style="text-align: right; display: grid; gap: 2px;">
            <span style="font-size: 15px; font-weight: 700; color: ${amountColor}; font-variant-numeric: tabular-nums;">${sign}¥${tx.amount.toLocaleString()}</span>
            <span style="font-size: 11px; color: var(--text-muted);">${tx.category || '未分類'}</span>
        </div>
    `;

    if (onEdit) {
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => onEdit(tx));
    }

    return row;
}

// 4. Modal Base Factory
export function createModalContainer(id, title, contentHTML, actionsHTML) {
    const modal = document.createElement('div');
    modal.id = id;
    modal.className = 'modal-overlay hidden';
    
    modal.innerHTML = `
        <div class="modal-content">
            <h2 class="modal-title">${title}</h2>
            <div class="modal-body">
                ${contentHTML}
            </div>
            <div class="modal-actions">
                ${actionsHTML}
            </div>
        </div>
    `;
    
    return modal;
}

/**
 * Neo+ Navigation System
 * Role: Global UI Controller
 */
export const renderGlobalHeader = () => {
    // 重複防止 (Duplicate Check)
    if (document.getElementById('global-header')) return;

    const headerHTML = `
        <header id="global-header" class="header-area" style="position: sticky; top: 0; z-index: 1000; background: var(--bg-color); border-bottom: 1px solid var(--btn-secondary-border); display: flex; align-items: center; justify-content: space-between; padding: 12px 16px;">
            <h1 class="title" style="font-size: 18px; font-weight: 700; color: var(--text-main); margin: 0;">Neo<sup class="title-plus" style="font-size: 10px; color: var(--accent-neo-blue);">+</sup></h1>
            <div class="header-actions">
                <div style="display: grid; grid-auto-flow: column; justify-content: start; align-items: center; gap: var(--spacing-sm); color: var(--text-muted);">
                    <div class="system-health-indicator" style="width: 8px; height: 8px; border-radius: 50%; background-color: #10b981; box-shadow: 0 0 8px rgba(16, 185, 129, 0.6); margin-right: 4px; transition: background-color 0.3s ease, box-shadow 0.3s ease;" title="System Health: Online"></div>
                    <div style="position: relative;">
                        <i data-lucide="cloud-check" style="width: 18px; height: 18px; stroke-width: 1.5px; color: #10b981;" title="iCloud同期中"></i>
                        <div class="scan-pulse"></div>
                    </div>
                    <button class="theme-toggle" aria-label="Toggle Theme" style="background: transparent; color: var(--text-muted); border: none; cursor: pointer; padding: 0;"><i data-lucide="sun" class="icon-sun"></i><i data-lucide="moon" class="icon-moon" style="display: none;"></i></button>
                    <div class="user-info-avatar" style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, var(--accent-neo-blue), var(--accent-purple)); display: grid; place-items: center; color: white; font-weight: 700; font-size: 14px; cursor: pointer;">
                        <span class="user-info-avatar-text" id="global-header-avatar">A</span>
                    </div>
                </div>
            </div>
        </header>
    `;

    const appContainer = document.getElementById('app-container');
    if (appContainer) {
        appContainer.insertAdjacentHTML('afterbegin', headerHTML);
        if (window.lucide) window.lucide.createIcons();
    }
};

export const renderBottomNav = (currentView = 'home') => {
  // 重複防止
  if (document.querySelector('.neo-bottom-nav')) {
    updateActiveNav(currentView);
    return;
  }

  const navHTML = `
    <nav class="neo-bottom-nav">
      <div class="nav-item ${currentView === 'home' ? 'active' : ''}" data-view="home">
        <i data-lucide="home" class="neon-icon"></i>
      </div>
      <div class="nav-item ${currentView === 'projects' ? 'active' : ''}" data-view="projects">
        <i data-lucide="folder" class="neon-icon"></i>
      </div>
      <div class="nav-item-nplus main-btn" data-view="chat">
        <span class="neo-logo">N<span style="font-size: 16px; transform: translateY(-1px); display: inline-block;">+</span></span>
      </div>
      <div class="nav-item ${currentView === 'wallet' ? 'active' : ''}" data-view="wallet">
        <i data-lucide="wallet" class="neon-icon"></i>
      </div>
      <div class="nav-item ${currentView === 'desk' ? 'active' : ''}" data-view="desk">
        <i data-lucide="inbox" class="neon-icon"></i>
      </div>
      <div class="nav-item ${currentView === 'settings' ? 'active' : ''}" data-view="settings">
        <i data-lucide="user" class="neon-icon"></i>
      </div>
    </nav>
  `;

  document.body.insertAdjacentHTML('beforeend', navHTML);
  if (window.lucide) window.lucide.createIcons();

  // イベント委譲による効率的なクリック処理
  document.querySelector('.neo-bottom-nav').addEventListener('click', (e) => {
    const item = e.target.closest('.nav-item, .nav-item-nplus');
    if (!item) return;

    const view = item.dataset.view;
    if (view) {
      updateActiveNav(view);
      const routeMap = {
        'home': 'view-dash',
        'projects': 'view-sites',
        'chat': 'view-chat',
        'wallet': 'view-wallet',
        'desk': 'view-desk',
        'settings': 'view-settings'
      };
      
      const targetId = routeMap[view];
      if (targetId && typeof window.switchView === 'function') {
        window.switchView(targetId);
      }
    }
  });
};

const updateActiveNav = (view) => {
  document.querySelectorAll('.neo-bottom-nav .nav-item, .neo-bottom-nav .nav-item-nplus').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });
  // デスクトップサイドバーも同期
  document.querySelectorAll('.neo-desktop-sidebar .sidebar-item, .neo-desktop-sidebar .sidebar-main-btn').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });
};

/**
 * PC/タブレット用: 左サイドバーナビゲーション (≥768px で表示)
 * CSS `display: none` により モバイルでは非表示。
 */
export const renderDesktopSidebar = (currentView = 'home') => {
  if (document.querySelector('.neo-desktop-sidebar')) {
    updateActiveNav(currentView);
    return;
  }

  const nav = [
    { view: 'home',     icon: 'home',           label: 'ホーム' },
    { view: 'projects', icon: 'folder',          label: 'プロジェクト' },
    { view: 'wallet',   icon: 'wallet',          label: 'ウォレット' },
    { view: 'desk',     icon: 'inbox',           label: 'Desk' },
    { view: 'settings', icon: 'user',            label: 'アカウント' },
  ];

  const itemsHTML = nav.map(({ view, icon, label }) => `
    <div class="sidebar-item ${currentView === view ? 'active' : ''}" data-view="${view}">
      <i data-lucide="${icon}"></i>
      <span>${label}</span>
    </div>
  `).join('');

  const sidebarHTML = `
    <aside class="neo-desktop-sidebar">
      <div class="sidebar-logo">Neo<sup style="font-size:13px;vertical-align:super;">+</sup></div>
      <div class="sidebar-main-btn" data-view="chat">
        <i data-lucide="message-circle"></i>
        <span>Neo AI</span>
      </div>
      ${itemsHTML}
    </aside>
  `;

  document.body.insertAdjacentHTML('afterbegin', sidebarHTML);
  if (window.lucide) window.lucide.createIcons();

  document.querySelector('.neo-desktop-sidebar').addEventListener('click', (e) => {
    const item = e.target.closest('.sidebar-item, .sidebar-main-btn');
    if (!item) return;
    const view = item.dataset.view;
    if (!view) return;
    const routeMap = {
      home: 'view-dash',
      projects: 'view-sites',
      chat: 'view-chat',
      wallet: 'view-wallet',
      desk: 'view-desk',
      settings: 'view-settings'
    };
    const targetId = routeMap[view];
    if (targetId && typeof window.switchView === 'function') {
      window.switchView(targetId);
    }
  });
};
