/**
 * Neo+ isolated Voice Engine
 */

window.setupNeoCockpitSpeechRecognition = function() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!window.__neoCockpitSpeechState) {
            window.__neoCockpitSpeechState = {
                rec: null,
                listening: false,
                voicePrefix: '',
                voiceAccum: ''
            };
        }
        const state = window.__neoCockpitSpeechState;

        const showVoiceStartHint = () => {
            const b = document.getElementById('neo-fab-bubble');
            if (b) {
                b.textContent = '音声入力開始';
                b.classList.add('show');
                setTimeout(() => b.classList.remove('show'), 3500);
            }
        };

        const setMicsRecording = (on) => {
            document.querySelectorAll('#btn-voice').forEach((mic) => {
                mic.classList.toggle('recording', on);
                if (on) mic.style.color = '#FF3B30';
                else mic.style.color = '';
            });
        };

        const onMicClick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!state.rec) return;
            const input = window.neoGetCockpitInput();
            if (state.listening) {
                try { state.rec.stop(); } catch (_) { /* already stopped */ }
                return;
            }
            showVoiceStartHint();
            const base = input ? input.value : '';
            state.voicePrefix = base && !/\s$/.test(base) ? `${base} ` : base;
            state.voiceAccum = '';
            try {
                state.rec.start();
            } catch (err) {
                console.warn('[Neo Speech]', err);
                state.listening = false;
                setMicsRecording(false);
            }
        };

        document.querySelectorAll('#btn-voice:not([data-neo-voice-bound])').forEach((mic) => {
            mic.dataset.neoVoiceBound = '1';
            if (!SR) {
                mic.disabled = true;
                mic.setAttribute('aria-disabled', 'true');
                mic.title = 'このブラウザでは音声入力を利用できません';
                return;
            }
            mic.disabled = false;
            mic.removeAttribute('aria-disabled');
            mic.title = '音声入力（タップで開始・停止）';
            mic.addEventListener('click', onMicClick);
        });

        if (!SR || state.rec) return;

        state.rec = new SR();
        state.rec.lang = 'ja-JP';
        state.rec.continuous = true;
        state.rec.interimResults = true;

        state.rec.onstart = () => {
            state.listening = true;
            setMicsRecording(true);
        };

        state.rec.onresult = (event) => {
            const input = window.neoGetCockpitInput();
            if (!input) return;
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const chunk = event.results[i][0].transcript;
                if (event.results[i].isFinal) state.voiceAccum += chunk;
                else interim += chunk;
            }
            input.value = state.voicePrefix + state.voiceAccum + interim;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.style.height = 'auto';
            input.style.height = `${Math.min(input.scrollHeight, 220)}px`;
        };

        state.rec.onerror = (event) => {
            console.warn('[Neo Speech]', event.error);
            state.listening = false;
            setMicsRecording(false);
            if (event.error === 'not-allowed') {
                const b = document.getElementById('neo-fab-bubble');
                if (b) {
                    b.textContent = 'マイクの許可が必要です。ブラウザの設定から許可してください。';
                    b.classList.add('show');
                    setTimeout(() => b.classList.remove('show'), 5000);
                }
            }
        };

        state.rec.onend = () => {
            state.listening = false;
            setMicsRecording(false);
            const input = window.neoGetCockpitInput();
            if (input) {
                input.style.height = 'auto';
                input.style.height = `${Math.min(input.scrollHeight, 220)}px`;
            }
        };
    }

