/**
 * Neo+ Brain Engine (neo-brain.js)
 * Isolates all Artificial Intelligence, Chat Context, and API communication.
 * Protects core application from context bleeding and asynchronous AI side-effects.
 */

window.saveNeoFeedback = window.saveNeoFeedback || function(topicUrlEncoded, liked) {
    try {
        const topic = decodeURIComponent(topicUrlEncoded);
        let memory = JSON.parse(sessionStorage.getItem('neo_volatile_feedback') || '[]');
        memory.push({topic, liked, date: new Date().toISOString()});
        
        if (memory.length > 10) memory = memory.slice(memory.length - 10);
        sessionStorage.setItem('neo_volatile_feedback', JSON.stringify(memory));
        console.log("[Neo Learning] Volatile feedback saved:", topic, liked ? "👍" : "👎");

        if (window.neoIntellectualMetabolism) window.neoIntellectualMetabolism();
    } catch(e) { console.error("Failed to save feedback", e); }
};

window.neoIntellectualMetabolism = window.neoIntellectualMetabolism || async function() {
    try {
        const chatContainer = document.getElementById('chat-messages');
        if (!chatContainer) return;

        const messages = chatContainer.querySelectorAll('.message-bubble');
        
        if (messages.length > 15) {
            console.log("[Neo Core] Conversation cache limit reached. Initiating AI Soul Compression...");
            
            let volatileFeedback = JSON.parse(sessionStorage.getItem('neo_volatile_feedback') || '[]');
            let longTermSoul = JSON.parse(localStorage.getItem('neo_long_term_soul') || '{"likes":[], "dislikes":[]}');
            
            volatileFeedback.forEach(fb => {
                if (fb.liked) {
                    if (!longTermSoul.likes.includes(fb.topic)) longTermSoul.likes.push(fb.topic);
                } else {
                    if (!longTermSoul.dislikes.includes(fb.topic)) longTermSoul.dislikes.push(fb.topic);
                }
            });

            if (longTermSoul.likes.length > 20) longTermSoul.likes = longTermSoul.likes.slice(-20);
            if (longTermSoul.dislikes.length > 20) longTermSoul.dislikes = longTermSoul.dislikes.slice(-20);
            
            localStorage.setItem('neo_long_term_soul', JSON.stringify(longTermSoul));
            sessionStorage.removeItem('neo_volatile_feedback'); 

            if (window.extractNeoCoreSoul) {
                try {
                    const rawHistoryObj = JSON.parse(sessionStorage.getItem('neo_chat_history') || '[]');
                    const rawHistoryStr = rawHistoryObj.map(h => (h.role === 'user' ? 'CEO: ' : 'Neo: ') + h.parts[0].text).join('\\n');
                    
                    if (rawHistoryStr.length > 100) {
                        console.log("[Neo Core] Calling Gemini for Soul Extraction...");
                        const extractedSoul = await window.extractNeoCoreSoul(rawHistoryStr);
                        
                        if (extractedSoul && extractedSoul.length > 10) {
                            localStorage.setItem('neo_long_term_soul_extracted', extractedSoul);
                            console.log("[Neo Core] Soul Extraction Complete. Wiping volatile history.");
                            
                            sessionStorage.removeItem('neo_chat_history');
                            sessionStorage.removeItem('neo_chat_summary');
                        }
                    }
                } catch(apiErr) {
                    console.error("Soul compression API call failed:", apiErr);
                }
            }

            const firstMsg = messages[0];
            const lastMsg1 = messages[messages.length - 2];
            const lastMsg2 = messages[messages.length - 1];

            chatContainer.innerHTML = '';
            if (firstMsg) chatContainer.appendChild(firstMsg);
            
            const wipeNotice = document.createElement('div');
            wipeNotice.className = 'message-bubble neo'; // Uses Neo style for system 
            wipeNotice.style.alignSelf = 'center'; // Override
            wipeNotice.innerHTML = `<span style="font-size: 11px; display: inline-block; color: #10b981; font-weight: bold; letter-spacing: 0.05em;">[SYSTEM] 揮発性メモリの洗浄と『魂』の圧縮が完了しました。</span>`;
            chatContainer.appendChild(wipeNotice);

            if (lastMsg1) chatContainer.appendChild(lastMsg1);
            if (lastMsg2) chatContainer.appendChild(lastMsg2);

            sessionStorage.setItem('neo_chat_dom', chatContainer.innerHTML);
        }
    } catch(e) { console.error("Metabolism failed", e); }
};

window.sendChatMessage = async function() {
    const inputField = document.getElementById('chat-input-field');
    if (!inputField) return;
    const text = inputField.value.trim();
    if (!text) return;

    inputField.value = '';
    inputField.style.height = 'auto';

    const messagesContainer = document.getElementById('chat-messages');

    // User message bubble
    const userRow = document.createElement('div');
    userRow.className = 'message-bubble ceo';
    userRow.textContent = text;
    messagesContainer.appendChild(userRow);

    setTimeout(() => {
        userRow.scrollIntoView({ behavior: 'smooth', block: 'end' });
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 50);

    // AI placeholder bubble
    const neoRow = document.createElement('div');
    neoRow.className = 'message-bubble neo';
    neoRow.innerHTML = `<span class="typing-indicator" style="animation: neoDeepThought 2.5s ease-in-out infinite; opacity: 0.6; display: inline-block;">Thinking...</span>`;
    messagesContainer.appendChild(neoRow);
    setTimeout(() => {
        neoRow.scrollIntoView({ behavior: 'smooth', block: 'end' });
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 50);

    const neoBubbleText = neoRow;

    if (window.isNeoSpeaking) return;
    window.isNeoSpeaking = true;
    window.GlobalStore.setLoading(true); // Phase 11: Chat Pulse Integration

    try {
        let history = JSON.parse(sessionStorage.getItem('neo_chat_history') || '[]');
        history.push({role: "user", parts: [{text: text}]});
        
        let fullResponseText = "";
        let apiResult = null;
        let retryCount = 0;
        const maxRetries = 2;
        
        do {
            sessionStorage.setItem('neo_chat_history', JSON.stringify(history));
            
            let promptToSend = (retryCount === 0) ? text : "（Neoのシステムノート：先程の続きから、そのまま文章を続けてください）";
            apiResult = await window.generateGeminiResponse(promptToSend, 'chat_room');
            
            if (retryCount > 0) {
                 fullResponseText += "\\n\\n[SYSTEM: 息継ぎ復旧中...]\\nごめん、ちょっと息切れしちゃった。続きを話すね：\\n" + apiResult.text;
            } else {
                 fullResponseText = apiResult.text;
            }

            if (apiResult.finishReason === 'MAX_TOKENS') {
                history.push({role: "model", parts: [{text: fullResponseText}]});
                retryCount++;
                console.log("[Neo Core] Auto-Recovery Triggered. Fetching continuation...", retryCount);
            } else {
                break;
            }
        } while (retryCount < maxRetries && apiResult.finishReason === 'MAX_TOKENS');

        history.push({role: "model", parts: [{text: fullResponseText}]});
        
        if (history.length > 10) {
            history = history.filter((msg, idx) => {
                if (idx >= history.length - 4) return true;
                const t = msg.parts[0].text;
                if (t.length > 30) return true;
                if (/\d/.test(t)) return true;
                if (/予算|売上|費用|経費|利益|税|申告|期日|月|年/.test(t)) return true;
                return false;
            });
        }
        if (history.length > 20) history = history.slice(-20);
        sessionStorage.setItem('neo_chat_history', JSON.stringify(history));
        
        neoBubbleText.innerHTML = '';
        
        let i = 0;
        const streamInterval = setInterval(() => {
            neoBubbleText.textContent += fullResponseText.charAt(i);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            
            i++;
            if (i >= fullResponseText.length) {
                clearInterval(streamInterval);
                window.isNeoSpeaking = false;
                window.GlobalStore.setLoading(false); // End Chat Pulse
                if (window.showNeoToast) window.showNeoToast('success', 'Neoからの回答が完了しました');

                neoBubbleText.innerHTML = fullResponseText.replace(/\\n/g, '<br>').replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>');
                
                const safeTopic = encodeURIComponent(text.substring(0, 40));
                const feedbackHtml = `
                    <div class="neo-feedback-ui" style="margin-top: 12px; display: flex; gap: 8px; justify-content: flex-end; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">
                        <button onclick="window.saveNeoFeedback('${safeTopic}', true); this.parentElement.innerHTML='<span style=\\'font-size:12px; color:#10b981; font-weight:bold;\\'>Neo: Learning Synced 👍</span>';" style="background: none; border: 1px solid rgba(255,255,255,0.2); color: var(--text-muted); border-radius: 12px; padding: 4px 12px; font-size: 12px; cursor: pointer; transition: background-color 0.2s;">👍 イイね</button>
                        <button onclick="window.saveNeoFeedback('${safeTopic}', false); this.parentElement.innerHTML='<span style=\\'font-size:12px; color:#ef4444; font-weight:bold;\\'>Neo: Parameter Adjusted 👎</span>';" style="background: none; border: 1px solid rgba(255,255,255,0.2); color: var(--text-muted); border-radius: 12px; padding: 4px 12px; font-size: 12px; cursor: pointer; transition: background-color 0.2s;">👎 イマイチ</button>
                    </div>
                `;
                neoBubbleText.insertAdjacentHTML('beforeend', feedbackHtml);

                setTimeout(() => updateScroll(), 50);
            }
        }, 10);

        function updateScroll() {
            neoRow.scrollIntoView({ behavior: 'smooth', block: 'end' });
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            sessionStorage.setItem('neo_chat_dom', messagesContainer.innerHTML);
            if (window.neoIntellectualMetabolism) window.neoIntellectualMetabolism();
        }

    } catch (error) {
        neoBubbleText.innerHTML = `<span style="color: #f87171;">エラーが発生しました。接続を確認してください。</span>`;
        console.error("Chat Error:", error);
        if (window.showNeoToast) window.showNeoToast('error', 'AIモデルへの接続に失敗しました');
        window.isNeoSpeaking = false;
        window.GlobalStore.setLoading(false);
    }
};

window.updateChatCharCounter = function(inputElement) {
    const counter = document.getElementById('chat-char-counter');
    if (!counter) return;
    
    const len = inputElement.value.length;
    const max = inputElement.getAttribute('maxlength') || 400;
    counter.textContent = `${len} / ${max}`;
    
    if (len >= 380) {
        counter.style.color = '#ef4444'; // Red
    } else if (len >= 300) {
        counter.style.color = '#f59e0b'; // Orange
    } else {
        counter.style.color = 'var(--text-muted)';
    }
};

// Initialize Greetings upon injection
(function initNeoChat() {
    const neoGreetings = [
        "お疲れ様。会計のことは全部私に投げて。今は何から始める？",
        "システムチェック完了。複雑な数字の整理、いつでも手伝えるよ。",
        "今日もいい集中力だね。経費の仕訳、パパッと終わらせちゃおうか。",
        "書類の準備？それとも相談？Neoがあなたの隣でスキャン中だよ。",
        "どんな小さな領収書でも見逃さない。さあ、一緒に片付けよう。"
    ];

    const greetingEl = document.getElementById('neo-initial-chat-greeting');
    if (greetingEl) {
        const randomGreeting = neoGreetings[Math.floor(Math.random() * neoGreetings.length)];
        greetingEl.textContent = randomGreeting;
    }
})();
