/**
 * Neo+ Global Registry & Event Bus (Loose Coupling Layer)
 * 
 * Replaces hardcoded UI function calls with a decoupled Pub/Sub architecture.
 * Ensures the Data Layer does not need to know about the View Layer.
 */

window.NeoBus = {
    events: {},
    
    /**
     * Subscribe to an event
     * @param {string} event Name of the event
     * @param {function} listener Callback block
     */
    on(event, listener) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(listener);
    },
    
    /**
     * Unsubscribe from an event
     */
    off(event, listener) {
        if (!this.events[event]) return;
        this.events[event] = this.events[event].filter(l => l !== listener);
    },
    
    /**
     * Broadcast an event to all subscribers asynchronously
     * @param {string} event Name of the event
     * @param {object} payload Associated payload data
     */
    emit(event, payload = {}) {
        if (!this.events[event]) return;
        // Schedule listeners in the microtask queue to allow current execution to finish cleanly
        queueMicrotask(() => {
            this.events[event].forEach(listener => {
                try {
                    listener(payload);
                } catch (e) {
                    console.error(`[NeoBus] Listener crashed on event '${event}':`, e);
                }
            });
        });
    }
};

/** 
 * Safe global dependency dictionary for components that still need dynamic service resolution 
 */
window.NeoRegistry = {};
