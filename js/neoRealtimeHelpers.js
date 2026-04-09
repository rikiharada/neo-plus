/**
 * Supabase Realtime: ユニークチャンネル名・インジケーター・removeChannel の共通処理
 * CHANNEL_ERROR / WebSocket 失敗時は 5s 基準の指数バックオフで「待機 → セッション再取得 → 再接続」
 * （React の useEffect 相当は pagehide / beforeunload + init 前の teardown で代替）
 */
(function (w) {
    'use strict';

    var INDICATOR_ID = 'neo-realtime-indicator';

    /** 指数バックオフの最大試行（scheduleChannelErrorReconnect） */
    var MAX_CHANNEL_ERROR_RECONNECT = 5;

    function getUniqueRealtimeChannelName(prefix) {
        var p = prefix || 'table-db-changes';
        return p + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    }

    function ensureIndicatorEl() {
        var el = document.getElementById(INDICATOR_ID);
        if (!el) {
            el = document.createElement('div');
            el.id = INDICATOR_ID;
            el.setAttribute('role', 'status');
            el.setAttribute('aria-live', 'polite');
            document.body.appendChild(el);
        }
        return el;
    }

    /**
     * @param {string} status - Supabase Realtime subscribe status
     * @param {unknown} [err]
     */
    function setRealtimeConnectionUi(status, err) {
        var el = ensureIndicatorEl();
        var core = document.getElementById('neo-core-status');

        if (status === 'CLOSED') {
            el.textContent = '';
            el.className = 'neo-realtime-indicator';
            el.hidden = true;
            return;
        }

        if (status === 'SUBSCRIBED') {
            el.textContent = '';
            el.className = 'neo-realtime-indicator neo-realtime-indicator--live';
            el.hidden = true;
            if (core) {
                core.textContent = 'AI Core Active';
                core.style.color = 'var(--text-muted)';
            }
            return;
        }

        el.hidden = false;
        el.className = 'neo-realtime-indicator neo-realtime-indicator--pending';

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || err) {
            el.textContent = 'リアルタイム再接続中…';
            console.warn('[NeoRealtime] status=', status, err || '');
            if (core) {
                core.textContent = 'オフライン中';
                core.style.color = '#ef4444';
            }
            return;
        }

        /* CONNECTING, SUBSCRIBING, その他 SUBSCRIBED 以外 */
        el.textContent = '接続中…';
        if (core) {
            core.textContent = '接続中…';
            core.style.color = 'var(--text-muted)';
        }
    }

    function removeChannelSafe(client, channel) {
        if (!client || !channel) return Promise.resolve();
        return client.removeChannel(channel).catch(function (e) {
            console.warn('[NeoRealtime] removeChannel failed:', e && e.message ? e.message : e);
        });
    }

    /**
     * 既存チャンネル参照があれば必ず remove（二重購読・WS 競合の防止）
     * @param {import('@supabase/supabase-js').SupabaseClient} client
     * @param {{ current: unknown } | null} channelRef - { current: RealtimeChannel } 形式でも生チャンネルでも可
     */
    function ensureChannelRemoved(client, channelRef) {
        var ch = channelRef;
        if (channelRef && typeof channelRef === 'object' && 'current' in channelRef) {
            ch = channelRef.current;
        }
        return removeChannelSafe(client, ch);
    }

    /**
     * subscribe() より前に必ず呼ぶ: セッション確立 + Realtime JWT（RLS 用）
     * @returns {Promise<import('@supabase/supabase-js').Session | null>}
     */
    function awaitSessionAndRealtimeAuth(client) {
        if (!client || !client.auth) return Promise.resolve(null);
        return client.auth.getSession().then(function (res) {
            var session = res && res.data && res.data.session ? res.data.session : null;
            if (client.realtime && typeof client.realtime.setAuth === 'function') {
                var token = session && session.access_token ? session.access_token : null;
                return client.realtime.setAuth(token).then(function () {
                    return session;
                });
            }
            return session;
        }).catch(function (e) {
            console.warn('[NeoRealtime] awaitSessionAndRealtimeAuth failed:', e && e.message ? e.message : e);
            return null;
        });
    }

    function clearChannelErrorReconnectTimer() {
        if (w._neoRealtimeReconnectTimer) {
            clearTimeout(w._neoRealtimeReconnectTimer);
            w._neoRealtimeReconnectTimer = null;
        }
    }

    /**
     * CHANNEL_ERROR / TIMED_OUT 後: 5秒 × 2^attempt 待機 → onReconnect（中で remove + getSession + 再購読）
     * @param {object} config
     * @param {import('@supabase/supabase-js').SupabaseClient} config.client
     * @param {number} [config.attempt] 0 始まり
     * @param {number} [config.maxAttempts]
     * @param {() => Promise<void>} config.onReconnect
     * @param {() => void} [config.onExhausted]
     */
    function scheduleChannelErrorReconnect(config) {
        var client = config.client;
        var onReconnect = config.onReconnect;
        var attempt = typeof config.attempt === 'number' ? config.attempt : 0;
        var maxAttempts = typeof config.maxAttempts === 'number' ? config.maxAttempts : MAX_CHANNEL_ERROR_RECONNECT;
        if (!client || typeof onReconnect !== 'function') {
            console.warn('[NeoRealtime] scheduleChannelErrorReconnect: invalid config');
            return;
        }
        if (attempt >= maxAttempts) {
            console.warn('[NeoRealtime] CHANNEL_ERROR/TIMED_OUT reconnect exhausted (' + maxAttempts + ' attempts)');
            if (typeof config.onExhausted === 'function') config.onExhausted();
            return;
        }
        clearChannelErrorReconnectTimer();
        var baseMs = 5000;
        var delayMs = Math.round(baseMs * Math.pow(2, attempt));
        console.warn(
            '[NeoRealtime] Reconnect scheduled in ' + delayMs + 'ms (attempt ' + (attempt + 1) + '/' + maxAttempts + ') — session refresh + resubscribe'
        );
        w._neoRealtimeReconnectTimer = setTimeout(function () {
            w._neoRealtimeReconnectTimer = null;
            Promise.resolve(onReconnect())
                .then(function () {
                    console.log('[NeoRealtime] Reconnect handler completed');
                })
                .catch(function (e) {
                    console.warn('[NeoRealtime] onReconnect failed:', e && e.message ? e.message : e);
                });
        }, delayMs);
    }

    function registerPageTeardown() {
        if (w._neoRealtimeUnloadBound) return;
        w._neoRealtimeUnloadBound = true;
        var run = function () {
            clearChannelErrorReconnectTimer();
            if (w.GlobalStore && typeof w.GlobalStore.teardownRealtimeSync === 'function') {
                void w.GlobalStore.teardownRealtimeSync();
            }
        };
        w.addEventListener('pagehide', run);
        w.addEventListener('beforeunload', run);
    }

    w.NeoRealtimeHelpers = {
        getUniqueRealtimeChannelName: getUniqueRealtimeChannelName,
        setRealtimeConnectionUi: setRealtimeConnectionUi,
        removeChannelSafe: removeChannelSafe,
        ensureChannelRemoved: ensureChannelRemoved,
        awaitSessionAndRealtimeAuth: awaitSessionAndRealtimeAuth,
        clearChannelErrorReconnectTimer: clearChannelErrorReconnectTimer,
        scheduleChannelErrorReconnect: scheduleChannelErrorReconnect,
        registerPageTeardown: registerPageTeardown,
        MAX_CHANNEL_ERROR_RECONNECT: MAX_CHANNEL_ERROR_RECONNECT
    };

    registerPageTeardown();
})(window);
