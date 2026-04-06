/**
 * Neo+ Global Constants & Immutable Design Tokens
 * 
 * Centralizing invariant design constraints to guarantee consistency and memory safety.
 * This configures the visual "Neo" aesthetics globally.
 */

export const NEO_CONSTANTS = {
    UI: {
        // Core cockpit floating shadow metric per design spec
        COCKPIT_HOVER_SHADOW: "0 12px 24px rgba(0,0,0,0.15)",
        COCKPIT_BORDER_RADIUS: "12px",
        
        // Locked theme identifier for daylight environments
        THEME_LOCKED: "day_time"
    },
    
    LIMITS: {
        // Cockpit text constraints
        INPUT_WARNING_LENGTH: 300,
        INPUT_MAX_LENGTH: 400,
        NEO_REPLY_TIMEOUT_MS: 4000
    },

    COLORS: {
        // Unified Hex Dictionary for Tag Mappings (Water, Navy, Red, Gold, Purple, Green)
        TAG_WATER: '#3b82f6',     // it
        TAG_GOLD: '#f59e0b',      // transportation
        TAG_PURPLE: '#8b5cf6',    // accounting
        TAG_GREEN: '#10b981',     // construction
        TAG_RED: '#ec4899',       // design
        TAG_NAVY: '#6b7280',      // other
        
        // Base brand
        NEO_BLUE: 'var(--accent-neo-blue)',
        ERROR_RED: '#FF3B30'
    }
};

// Global mount for legacy scripts relying on window access
if (typeof window !== 'undefined') {
    window.NEO_CONSTANTS = NEO_CONSTANTS;
}
