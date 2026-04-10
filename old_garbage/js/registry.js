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
 * NeoBus Command Queue (NSCQ) for Sequential Compound Intents
 * Ensures async operations (like DB inserts) finish fully before the next step starts.
 */
window.NeoCommandQueue = {
    items: [],
    isProcessing: false,
    context: {
        lastCreatedProjectId: null
    },

    init() {
        if (!window.NeoBus) return;
        window.NeoBus.on('QUEUE_ENQUEUE', this.enqueue.bind(this));
        window.NeoBus.on('QUEUE_PROCESS_NEXT', this.processNext.bind(this));
        window.NeoBus.on('QUEUE_ITEM_COMPLETED', this.onItemCompleted.bind(this));
    },

    enqueue(payload) {
        this.items.push(payload);
        if (!this.isProcessing) {
            window.NeoBus.emit('QUEUE_PROCESS_NEXT');
        }
    },

    async processNext() {
        if (this.items.length === 0) {
            this.isProcessing = false;
            return;
        }
        this.isProcessing = true;
        const task = this.items.shift();

        try {
            if (task.type === 'CREATE_PROJECT') {
                const projName = task.payload.name;
                const projDate = task.payload.date;
                const projLoc = task.payload.location;
                
                let newProj = null;
                if (window.createProject) {
                    newProj = window.createProject(projName, projDate, projLoc);
                    if (newProj && projLoc) newProj.location = projLoc;

                    // Sync to UI early if needed
                    if (window.pushFeedMessage) {
                        window.pushFeedMessage('project', {
                            id: newProj.id,
                            title: newProj.name,
                            sub: projLoc ? `📍 ${projLoc}` : '',
                            date: projDate || newProj.startDate
                        });
                    }
                }

                // Wait explicitly for Supabase propagation to avoid FK constraint errors 
                if (window.insertProject && newProj) {
                    await window.insertProject(newProj);
                }

                this.context.lastCreatedProjectId = newProj ? newProj.id : null;
                window.NeoBus.emit('QUEUE_ITEM_COMPLETED', { type: task.type, result: newProj });
            }
            else if (task.type === 'ADD_EXPENSE') {
                let tx = { ...task.payload };
                if (task.waitForPreviousContext && task.waitForPreviousContext.includes('lastCreatedProjectId')) {
                    if (this.context.lastCreatedProjectId) {
                        tx.projectId = this.context.lastCreatedProjectId;
                    } else {
                        throw new Error("[NSCQ] Missing dependent project ID for sequential expense insert.");
                    }
                }
                
                if (window.insertTransaction) {
                    await window.insertTransaction(tx);
                    if (window.pushFeedMessage) {
                        window.pushFeedMessage('expense', {
                            id: tx.id,
                            title: tx.title,
                            amount: tx.amount,
                            category: tx.category,
                            projectName: tx.projectName,
                            date: tx.date
                        });
                    }
                }
                
                window.NeoBus.emit('QUEUE_ITEM_COMPLETED', { type: task.type, result: tx });
            }
            else {
                window.NeoBus.emit('QUEUE_ITEM_COMPLETED', { type: task.type, result: null });
            }
        } catch (e) {
            console.error(`[NSCQ] Task failed: ${task.type}`, e);
            window.NeoBus.emit('QUEUE_ITEM_FAILED', { type: task.type, error: e });
            // Safety abort on fail
            this.items = [];
            this.isProcessing = false;
        }
    },

    onItemCompleted() {
        setTimeout(() => {
            if (window.NeoBus) window.NeoBus.emit('QUEUE_PROCESS_NEXT');
        }, 50);
    }
};

window.NeoCommandQueue.init();

/** 
 * Safe global dependency dictionary for components that still need dynamic service resolution 
 */
window.NeoRegistry = {};
