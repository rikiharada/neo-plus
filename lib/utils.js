/**
 * Neo+ Global Utilities (Phase 8: Autonomous Mode)
 * Core optimizations for SWR, Debouncing, and Formatting.
 */

/**
 * Creates a debounced function that delays invoking `func` until after `wait` milliseconds
 * have elapsed since the last time the debounced function was invoked.
 * 
 * @param {Function} func The function to debounce.
 * @param {number} wait The number of milliseconds to delay.
 * @returns {Function} Returns the new debounced function.
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Formats a number to JPY currency string cleanly.
 * @param {number} amount 
 * @returns {string} e.g. "¥1,000"
 */
export function formatCurrency(amount) {
    if (isNaN(amount)) return '¥0';
    return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(amount);
}

/**
 * Formats an ISO Date string to simple YYYY/MM/DD format.
 * @param {string} isoString 
 * @returns {string} e.g. "2026/03/17"
 */
export function formatDate(isoString) {
    if (!isoString) return '指定なし';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '指定なし';
    
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
}

// Make globally available
window.debounce = debounce;
window.formatCurrency = formatCurrency;
window.formatDate = formatDate;

/**
 * Phase 10: Elegant Toast Notification (Neo-Sync v2.0)
 * @param {'success' | 'error'} type 
 * @param {string} message Optional custom override message
 */
export function showNeoToast(type = 'success', message = null) {
    let text = message;
    let icon = 'check-circle';
    
    if (type === 'success') {
        text = text || "完了しました";
        icon = 'check-circle';
    } else if (type === 'error') {
        text = text || "おっと、少し修正が必要なようです";
        icon = 'alert-circle';
    }

    // Ensure container exists
    let container = document.querySelector('.neo-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'neo-toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `neo-toast ${type}`;
    toast.innerHTML = `
        <div class="toast-icon">
            <i data-lucide="${icon}" style="width: 18px; height: 18px;"></i>
        </div>
        <div class="neo-toast-content">${text}</div>
    `;

    container.appendChild(toast);
    if (window.lucide) window.lucide.createIcons({ root: toast });

    // Animate in
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });
    });

    // Animate out and remove
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        });
    }, 3000);
}

window.showNeoToast = showNeoToast;
