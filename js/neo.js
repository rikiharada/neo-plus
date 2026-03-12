class NeoConcierge {
    constructor(elementId) {
        this.container = document.getElementById(elementId);
        this.messageElement = this.container.querySelector('.neo-message');
        // For MVP, we use text placeholder, later replace with image
        this.isSpeaking = false;
    }

    // Soft, short logging tone
    async speak(textKey, style = 'normal') {
        if (this.isSpeaking) return;
        this.isSpeaking = true;

        // Simple typewriter effect for MVP
        const text = window.i18n.t(textKey);
        this.messageElement.innerHTML = '';

        // Add glow effect based on style
        if (style === 'alert') {
            this.container.classList.add('glow-yellow');
        } else {
            this.container.classList.add('glow-blue');
        }

        let i = 0;
        const typeWriter = setInterval(() => {
            if (i < text.length) {
                this.messageElement.innerHTML += text.charAt(i);
                i++;
            } else {
                clearInterval(typeWriter);
                setTimeout(() => {
                    this.container.classList.remove('glow-blue');
                    this.container.classList.remove('glow-yellow');
                    this.isSpeaking = false;
                }, 1000); // Glow lingers after talking
            }
        }, 40); // Fast but readable
    }
}

window.Neo = NeoConcierge;
