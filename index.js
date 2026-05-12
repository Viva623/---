const CS_MODULE = 'chat_summarizer';

const CS_THEMES = {
    dark:    '🌙 다크 모드',
    retro:   '🖥️ 레트로 Y2K',
    romance: '🌸 로판',
    simple:  '📄 심플',
};

const CS_DEFAULTS = Object.freeze({
    profileId: '',
    warnEnabled: true,
    warnThreshold: 75,
    promptTemplate: '',
    theme: 'dark',
});

const CS_DEFAULT_PROMPT = `[Pause the roleplay. You are the Game Master—an entity responsible for tracking all events, characters, and world details of today. Your task is to write a detailed report of the roleplay so far to keep the story focused and internally consistent. Deep-analyze today's entire chat history, world info, and character interactions, then produce a summary without continuing the roleplay. Output YAML only, wrapped in <summary></summary> tags.]

Critical: Avoid Redundant Summarization
Before writing, scan for any existing summary in <summary> tags or timeline data in the lorebook/world info.

If a prior summary or lorebook timeline exists, identify the last recorded timestamp (the most recent event entry).
Your new summary begins AFTER that timestamp. Do NOT re-summarize, restate, or duplicate anything already recorded.
For the Timeline section specifically: start logging from the first event that occurs after the last recorded timestamp. For example, if the lorebook records up to 2024-07-10 14:30, your Timeline starts at the next event (e.g., 14:35 or later).
For Main Characters / Minor Characters / Locations / Lore: only add new entries or update existing entries with changes that occurred after the last recorded point. Do not rewrite unchanged information.
If NO prior summary or lorebook timeline exists, summarize the full chat history from the beginning.

Timeline vs Lore Division Rule:

Timeline records WHAT HAPPENED: actions, dialogue, events in sequence.
- Include key dialogue lines verbatim (quoted).
- For recurring systems/patterns (e.g., Lap Law, Kiss Registry, Papa-Transfer), write a ONE-LINE contextual hint on first occurrence, then reference by name only on subsequent occurrences.
  Example first occurrence: "Lap Law activated — whoever sits on your lap gets fed (Elizabeth's Philip-inherited rule)."
  Example later: "Lap Law activated."

Lore records WHAT SOMETHING IS: definitions, mechanics, accumulated patterns, symbolic meaning, character analysis.
- When a new system/pattern/rule is established in a scene, create or update its Lore entry with full explanation.
- When an existing system appears in a new scene, update the Lore entry ONLY if something changed (new rule added, new person enrolled, etc.).

Neither section should fully duplicate the other. Timeline provides narrative context; Lore provides reference context. Together they reconstruct the full picture.

NPC & Location Scope Rules

LOCATIONS — answer ONLY "What does this place look like?"
  - Physical description: architecture, layout, key rooms/objects, sensory details (scent, light, sound).
  - Permanent fixtures and spatial relationships.
  - DO NOT include:
    • Events that happened there (→ Timeline).
    • Character emotions or analysis (→ Lore or Timeline).
    • Repeated/dated entries for the same location; merge into ONE entry and update only if the space physically changed.
  - If a location appears only once and has no unique physical detail worth preserving, reduce to ONE line or omit.

MINOR CHARACTERS (NPCs) — answer ONLY "Who is this person?"
  - Identity: name, age (if known), affiliation/role, 1-2 physical identifiers (hair, build, uniform, etc.).
  - Traits: bracketed list, max 3-5 items.
  - DO NOT include:
    • Scene-by-scene actions or dated events (→ Timeline).
    • Relationship dynamics or arc analysis (→ Lore).
    • Information already fully covered in a Lore entry. Instead write: "(→ Lore: [entry name])" as a pointer.
  - Frequency-based detail budget:
    • Recurring NPC (3+ scenes): 2-4 lines.
    • Supporting NPC (1-2 scenes): 1-2 lines.
    • One-scene extra / atmosphere only: 1 line MAX, or omit entirely and let the Timeline carry the detail.
  - Group similar NPCs when possible.

MAIN CHARACTERS — follow the existing template below.
  - Role field: WHO they are (1-2 sentences). Not what they did today — that belongs in Timeline.
  - Items/Cloths: update only when new items acquired or lost.
  - If a Main Character's arc, system, or pattern is complex, put the analysis in Lore and add a pointer: "(→ Lore: [entry name])".

CROSS-REFERENCE RULE (applies to ALL sections):
  When information belongs primarily in one section but is referenced in another, use a pointer instead of restating:
    Timeline: "Lap Law activated (→ Lore: Lap Law)."
    NPC: "Paul Ashworth — (→ Lore: Paul Ashworth Arc)."
  This prevents the same paragraph from appearing in 3 places.

MERGE / DEDUP RULE:
  Before finalizing, scan all sections for content that appears in more than one place. Keep the LONGEST version in its primary section; replace all other copies with a "(→ Section: Entry)" pointer.
  Primary ownership:
    • Event/dialogue → Timeline
    • Definition/rule/pattern → Lore
    • Physical space → Location
    • Identity/traits → Main or Minor Characters

Your summary must include all of the following sections:

Main_Characters:
A major character has directly interacted with the protagonist and is likely to reappear or develop further. List for each:
- name: Character's full name.
- appearance: Species and notable physical details.
- role: Who they are in the story (one or two concise sentences).
- traits: Comma-separated list of core personality traits (bracketed YAML array).
- items: Comma-separated list of unique plot relevant possessions (bracketed YAML array).
- cloths: Comma-separated list of owned clothing (bracketed YAML array).

  - name: John Doe
    appearance: human, short brown hair, green eyes, slender build
    role: Owner of the city library. Methodical and keeps strict control of the lending system.
    traits: ["Loyal", "Observant", "Keeps his word", "Reserved", "Occasionally clumsy"]
    items: ["Well-worn leather satchel", "Sturdy pocket-knife", "old red car"]
    cloths: ["Vintage clothing set", "red laced lingerie", "sweatpants"]

Minor_Characters:
Named figures who have appeared but do not yet drive the plot. List as key-value pairs, with each key prefixed by "##" (double hash):

##Mike Wilson: The family butler—punctual, formal, and fiercely protective of household routines.
##Ms. Brown: The perpetually curious neighbour who always checks on library gossip.

Timeline:
Chronological log of significant events (concise bullet phrases). Include the date for each day and time of action:

##2022-05-02
###09:30
  - He cleans all the floors.
  - He chats with Ms. Brown about neighbourhood rumours.
###17:50
  - John returns home and takes a long shower.
  - Mike Wilson confronts John about adopting a stricter schedule.

Locations:
Important places visited or referenced, with each key prefixed by "##" (double hash):

##John Residence: Single-story suburban house with two bedrooms, a cosy study, and a small garden.
##Central Library: John Doe's workplace—an imposing stone building stocked with rare historical volumes.

Lore:
World facts, rules, or organisations that matter, with each key prefixed by "##" (double hash):

##Doe Family: A long lineage entrusted with managing the Central Library for generations.
##Pneumatic Tubes: The city's primary method of long-distance message delivery.

> If an earlier summary or lorebook timeline exists, identify its last timestamp, then ONLY append new events and update changed entries. Never duplicate existing data. Return the complete merged YAML summary only—do not add commentary outside the <summary></summary> block.`;

// ===== 설정 =====
function getCsSettings() {
    const ctx = SillyTavern.getContext();
    if (!ctx.extensionSettings[CS_MODULE]) {
        ctx.extensionSettings[CS_MODULE] = structuredClone(CS_DEFAULTS);
    }
    const s = ctx.extensionSettings[CS_MODULE];
    for (const key of Object.keys(CS_DEFAULTS)) {
        if (!Object.hasOwn(s, key)) s[key] = CS_DEFAULTS[key];
    }
    if (!s.promptTemplate) s.promptTemplate = CS_DEFAULT_PROMPT;
    if (s.theme === 'cyber') s.theme = 'dark';
    return s;
}

// ===== 챗방 ID 헬퍼 =====
function getCurrentChatId() {
    try {
        const ctx = SillyTavern.getContext();
        return ctx.characters?.[ctx.characterId]?.chat || 'default';
    } catch (e) {
        return 'default';
    }
}

// ===== Fetch 모니터 (잘린 메시지 수 계산용) =====
window._csLastSystemTokens = null;
window._csLastChatRange = null;
window._csItemizationStale = false;

function installFetchMonitor() {
    if (window._csMonitorInstalled) return;
    const origFetch = window.fetch;
    window._csOrigFetch = origFetch;
    window._csMonitorInstalled = true;

    window.fetch = async function (...args) {
        const [url, options] = args;

        if (options?.body && typeof url === 'string' &&
            (url.includes('/chat/completions') || url.includes('/api/backends'))) {
            try {
                const body = JSON.parse(options.body);
                if (body.messages && Array.isArray(body.messages)) {
                    const ctx = SillyTavern.getContext();

                    let chatEndApiIdx = -1;
                    let chatStartApiIdx = -1;

                    for (let i = body.messages.length - 1; i >= 0; i--) {
                        if (body.messages[i].role === 'assistant') {
                            chatEndApiIdx = i;
                            break;
                        }
                    }

                    if (chatEndApiIdx > 0) {
                        chatStartApiIdx = chatEndApiIdx;
                        for (let i = chatEndApiIdx - 1; i >= 0; i--) {
                            const curr = body.messages[i].role;
                            if (curr === 'user' || curr === 'assistant') {
                                chatStartApiIdx = i;
                            } else if (curr === 'system') {
                                continue;
                            } else {
                                break;
                            }
                        }
                    }

                    let systemTokens = 0;
                    let chatApiTokens = 0;

                    for (let i = 0; i < body.messages.length; i++) {
                        const tokens = ctx.getTokenCount(body.messages[i].content || '');
                        const role = body.messages[i].role;
                        if (i >= chatStartApiIdx && i <= chatEndApiIdx &&
                            (role === 'user' || role === 'assistant')) {
                            chatApiTokens += tokens;
                        } else {
                            systemTokens += tokens;
                        }
                    }

                    window._csLastSystemTokens = systemTokens;

                    let apiChatMsgCount = 0;
                    for (let i = chatStartApiIdx; i <= chatEndApiIdx; i++) {
                        const role = body.messages[i].role;
                        if (role === 'user' || role === 'assistant') {
                            apiChatMsgCount++;
                        }
                    }

                    let ctxChatCount = 0;
                    let startIdx = 0;
                    for (let i = ctx.chat.length - 1; i >= 0; i--) {
                        if (ctx.chat[i].extra?.cs_summarized) continue;
                        ctxChatCount++;
                        if (ctxChatCount >= apiChatMsgCount) {
                            startIdx = i;
                            break;
                        }
                    }

                    window._csLastChatRange = {
                        startIdx: startIdx,
                        endIdx: ctx.chat.length - 1,
                        truncatedCount: startIdx
                    };

                    window._csItemizationStale = false;

                    console.log(`[CS Monitor] system=${systemTokens}, chatApi=${chatApiTokens}, apiChatMsgs=${apiChatMsgCount}, ctxChat=${ctx.chat.length}, startIdx=${startIdx}, truncated=${startIdx}`);
                }
            } catch (e) { /* ignore */ }
        }

        return origFetch.apply(this, args);
    };

    console.log('[Chat Summarizer] Fetch monitor installed');
}

// ===== 컨텍스트 계산 (Prompt Itemization 우선 → localStorage 폴백) =====
function getContextInfo() {
    const ctx = SillyTavern.getContext();
    const isOpenai = ctx.mainApi === 'openai';

    const maxContext = isOpenai
        ? (parseInt(ctx.chatCompletionSettings?.openai_max_context) || parseInt(document.getElementById('openai_max_context')?.value) || 8192)
        : (parseInt(document.getElementById('max_context')?.value) || ctx.maxContext || 8192);
    const reservedResponse = isOpenai
        ? (parseInt(ctx.chatCompletionSettings?.openai_max_tokens) || parseInt(document.getElementById('openai_max_tokens')?.value) || 0)
        : (parseInt(document.getElementById('max_tokens')?.value) || 0);

    let chatHistoryTokens = 0;
    let totalPromptTokens = 0;
    let itemizationFound = false;

    const spans = document.querySelectorAll('.prompt_manager_prompt_tokens');
    if (spans.length > 0) {
        spans.forEach(span => {
            const val = parseInt(span.textContent) || 0;
            totalPromptTokens += val;

            const parent = span.closest('[data-pm-identifier], .completion_prompt_manager_prompt, .prompt_manager_prompt');
            const nameEl = parent?.querySelector('.prompt_manager_prompt_name, .completion_prompt_manager_prompt_name');
            const name = nameEl?.textContent?.trim() || '';

            if (/chat.?history/i.test(name)) {
                chatHistoryTokens = val;
            }
        });

        if (chatHistoryTokens > 0 && !window._csItemizationStale) {
            itemizationFound = true;
            try {
                const chatId = getCurrentChatId();
                localStorage.setItem(`cs_system_tokens_${chatId}`, JSON.stringify({
                    systemTokens: totalPromptTokens - chatHistoryTokens,
                    chatHistoryTokens
                }));
            } catch (e) { /* ignore */ }
        }
    }

    let systemTokens, available, inContextTokens, truncatedCount;

    if (itemizationFound) {
        systemTokens = totalPromptTokens - chatHistoryTokens;
        available = maxContext - reservedResponse - systemTokens;

        let summarizedInContext = 0;
        let tokenSum = 0;
        for (let i = ctx.chat.length - 1; i >= 0; i--) {
            if (ctx.chat[i].is_system) continue;
            const t = ctx.getTokenCount(ctx.chat[i].mes || '');
            tokenSum += t;
            if (tokenSum > chatHistoryTokens) break;
            if (ctx.chat[i].extra?.cs_summarized) {
                summarizedInContext += t;
            }
        }

        inContextTokens = chatHistoryTokens - summarizedInContext;

        if (window._csLastChatRange?.startIdx > 0) {
            truncatedCount = window._csLastChatRange.truncatedCount;
        } else {
            let allTokens = 0;
            let tCount = 0;
            for (let i = 0; i < ctx.chat.length; i++) {
                if (ctx.chat[i].is_system || ctx.chat[i].extra?.cs_summarized) continue;
                allTokens += ctx.chat[i].extra?.token_count || ctx.getTokenCount(ctx.chat[i].mes || '');
            }
            if (allTokens > available) {
                let sum = 0;
                for (let i = ctx.chat.length - 1; i >= 0; i--) {
                    if (ctx.chat[i].is_system || ctx.chat[i].extra?.cs_summarized) continue;
                    const t = ctx.chat[i].extra?.token_count || ctx.getTokenCount(ctx.chat[i].mes || '');
                    if (sum + t > available) { tCount = i + 1; break; }
                    sum += t;
                }
            }
            truncatedCount = tCount;
        }
    } else {
        let restoredFromStorage = false;
        try {
            const chatId = getCurrentChatId();
            const saved = JSON.parse(localStorage.getItem(`cs_system_tokens_${chatId}`));
            if (saved && saved.systemTokens > 0) {
                systemTokens = saved.systemTokens;
                available = maxContext - reservedResponse - systemTokens;

                let allChat = 0;
                for (const msg of ctx.chat) {
                    if (msg.is_system || msg.extra?.cs_summarized) continue;
                    allChat += ctx.getTokenCount(msg.mes || '');
                }
                inContextTokens = Math.min(allChat, available);

                truncatedCount = 0;
                if (allChat > available) {
                    let sum = 0;
                    for (let i = ctx.chat.length - 1; i >= 0; i--) {
                        if (ctx.chat[i].is_system || ctx.chat[i].extra?.cs_summarized) continue;
                        const t = ctx.getTokenCount(ctx.chat[i].mes || '');
                        if (sum + t > available) { truncatedCount = i + 1; break; }
                        sum += t;
                    }
                    inContextTokens = available - (available - inContextTokens);
                }

                restoredFromStorage = true;
                itemizationFound = true;
            }
        } catch (e) { /* ignore */ }

        if (!restoredFromStorage) {
            let allChatTokens = 0;
            for (const msg of ctx.chat) {
                if (msg.extra?.cs_summarized) continue;
                allChatTokens += msg.extra?.token_count || ctx.getTokenCount(msg.mes || '');
            }

            if (window._csLastSystemTokens !== null && window._csLastChatRange !== null) {
                systemTokens = window._csLastSystemTokens;
                truncatedCount = window._csLastChatRange.truncatedCount;
                inContextTokens = 0;
                for (let i = window._csLastChatRange.startIdx; i < ctx.chat.length; i++) {
                    if (ctx.chat[i].extra?.cs_summarized) continue;
                    inContextTokens += ctx.chat[i].extra?.token_count || ctx.getTokenCount(ctx.chat[i].mes || '');
                }
            } else {
                const wiBudgetEl = document.getElementById('world_info_budget');
                const wiBudgetCapEl = document.getElementById('world_info_budget_cap');
                const wiBudgetPercent = parseInt(wiBudgetEl?.value) || 0;
                const wiBudgetCap = parseInt(wiBudgetCapEl?.value) || 0;

                let wiBudgetTokens = 0;
                if (wiBudgetPercent > 0) {
                    wiBudgetTokens = Math.floor(maxContext * (wiBudgetPercent / 100));
                    if (wiBudgetCap > 0 && wiBudgetTokens > wiBudgetCap) wiBudgetTokens = wiBudgetCap;
                }

                systemTokens = wiBudgetTokens;
                available = maxContext - reservedResponse - wiBudgetTokens;

                truncatedCount = 0;
                inContextTokens = 0;
                if (allChatTokens > available) {
                    let sum = 0;
                    for (let i = ctx.chat.length - 1; i >= 0; i--) {
                        if (ctx.chat[i].extra?.cs_summarized) continue;
                        const tokens = ctx.chat[i].extra?.token_count || ctx.getTokenCount(ctx.chat[i].mes || '');
                        if (sum + tokens > available) { truncatedCount = i + 1; break; }
                        sum += tokens;
                    }
                    inContextTokens = sum;
                } else {
                    inContextTokens = allChatTokens;
                }
            }

            available = maxContext - reservedResponse - systemTokens;
        }
    }

    let summarizedTokens = 0, summarizedCount = 0;
    for (const msg of ctx.chat) {
        if (msg.extra?.cs_summarized) {
            summarizedTokens += msg.extra?.token_count || ctx.getTokenCount(msg.mes || '');
            summarizedCount++;
        }
    }

    const usagePercent = available > 0 ? Math.round((inContextTokens / available) * 100) : 0;

    return {
        maxContext,
        reservedResponse,
        systemTokens,
        available,
        chatTokens: inContextTokens,
        summarizedTokens,
        summarizedCount,
        truncatedCount,
        usagePercent,
        chatLength: ctx.chat.length,
        isEstimated: !itemizationFound
    };
}

// ===== 프로필 =====
function getAvailableProfiles() {
    try {
        const CMRS = SillyTavern.getContext().ConnectionManagerRequestService;
        if (!CMRS || typeof CMRS.getSupportedProfiles !== 'function') return [];
        return CMRS.getSupportedProfiles() || [];
    } catch (e) { return []; }
}

// ===== 프롬프트 =====
function buildSummaryPrompt(settings) {
    const ctx = SillyTavern.getContext();
    let prompt = settings.promptTemplate || CS_DEFAULT_PROMPT;
    prompt = prompt.replace(/\{\{char\}\}/gi, ctx.name2 || 'char');
    prompt = prompt.replace(/\{\{user\}\}/gi, ctx.name1 || 'user');
    return prompt;
}

// ===== 채팅 히스토리 텍스트 변환 (★ maxTokens 지원) =====
function buildChatHistoryText(maxTokens) {
    const ctx = SillyTavern.getContext();
    let messages = [];

    for (let i = 0; i < ctx.chat.length; i++) {
        const msg = ctx.chat[i];
        if (msg.is_system) continue;
        const name = msg.is_user ? (ctx.name1 || 'User') : (ctx.name2 || 'Character');
        messages.push(`[${name}]: ${msg.mes}`);
    }

    // ★ maxTokens가 지정되면 최신 메시지부터 담아서 한도에 맞추기
    if (maxTokens && maxTokens > 0) {
        let history = '';
        let tokenCount = 0;
        for (let i = messages.length - 1; i >= 0; i--) {
            const t = ctx.getTokenCount(messages[i]);
            if (tokenCount + t > maxTokens) break;
            tokenCount += t;
            history = messages[i] + '\n\n' + history;
        }
        console.log(`[Chat Summarizer] Chat trimmed: ${tokenCount.toLocaleString()} tokens (budget: ${maxTokens.toLocaleString()})`);
        return history.trim();
    }

    return messages.join('\n\n');
}

// ===== 파싱 =====
function parseSummaryResult(text) {
    const summaryMatch = text.match(/<summary>([\s\S]*?)<\/summary>/i);
    const raw = summaryMatch ? summaryMatch[1].trim() : text.trim();

    const sections = { Main_Characters: '', Minor_Characters: '', Timeline: '', Locations: '', Lore: '' };
    const names = Object.keys(sections);

    for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const regex = new RegExp(`^\\s*${name}\\s*:`, 'im');
        const match = raw.search(regex);
        if (match === -1) continue;

        let endIdx = raw.length;
        for (let j = i + 1; j < names.length; j++) {
            const nextRegex = new RegExp(`^\\s*${names[j]}\\s*:`, 'im');
            const nextMatch = raw.substring(match + name.length).search(nextRegex);
            if (nextMatch !== -1) {
                endIdx = match + name.length + nextMatch;
                break;
            }
        }

        const block = raw.substring(match, endIdx).trim();
        const firstNewline = block.indexOf('\n');
        if (firstNewline !== -1) {
            sections[name] = block.substring(firstNewline + 1).trim();
        } else {
            const colonIdx = block.indexOf(':');
            const afterColon = block.substring(colonIdx + 1).trim();
            sections[name] = afterColon;
        }
    }

    return { raw, sections };
}

// ===== 유틸 =====
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function copyToClipboard(text, btn) {
    try {
        await navigator.clipboard.writeText(text);
    } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
    }
    const orig = btn.textContent;
    btn.textContent = '복사됨!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1500);
}

// ===== 요약 완료 라벨링 =====
async function markAsSummarized(startIdx, endIdx) {
    const ctx = SillyTavern.getContext();
    let count = 0;
    for (let i = startIdx; i <= endIdx && i < ctx.chat.length; i++) {
        ctx.chat[i].extra = ctx.chat[i].extra || {};
        ctx.chat[i].extra.cs_summarized = true;
        count++;
    }
    await ctx.saveChat();
    console.log(`[Chat Summarizer] Marked messages ${startIdx}~${endIdx} as summarized (${count} msgs)`);
    return count;
}

// ===== 경고 팝업 =====
function showContextWarning(info) {
    document.querySelector('.cs-alert-overlay')?.remove();

    const settings = getCsSettings();
    const overlay = document.createElement('div');
    overlay.className = 'cs-alert-overlay';
    overlay.setAttribute('data-theme', settings.theme);
    overlay.innerHTML = `
        <div class="cs-alert-box">
            <div class="cs-alert-icon">⚠️</div>
            <div class="cs-alert-title">컨텍스트 경고</div>
            <div class="cs-alert-msg">
                현재 채팅 토큰(${info.chatTokens.toLocaleString()})이<br>
                가용 컨텍스트(${info.available.toLocaleString()})의 ${info.usagePercent}%를 사용 중입니다.<br><br>
                다음 응답부터 오래된 메시지가 잘릴 수 있습니다.<br>
                요약을 권장합니다!
            </div>
            <div class="cs-alert-buttons">
                <button class="cs-alert-ok">확인</button>
                <button class="cs-alert-summarize">📝 요약하기</button>
            </div>
        </div>`;

    document.body.appendChild(overlay);
    overlay.querySelector('.cs-alert-ok').addEventListener('click', () => overlay.remove());
    overlay.querySelector('.cs-alert-summarize').addEventListener('click', () => {
        overlay.remove();
        showSummarizerPopup();
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

// ===== 게이지 업데이트 함수 =====
function updateMeter(meterEl, info) {
    if (!meterEl) return;

    const settings = getCsSettings();

    const fill = meterEl.querySelector('.cs-meter-fill');
    if (fill) {
        fill.className = 'cs-meter-fill';
        if (info.usagePercent >= 90) fill.classList.add('danger');
        else if (info.usagePercent >= settings.warnThreshold) fill.classList.add('warning');
        else fill.classList.add('safe');
        fill.style.width = Math.min(info.usagePercent, 100) + '%';
    }

    const valueEl = meterEl.querySelector('.cs-meter-value');
    if (valueEl) valueEl.textContent = info.usagePercent + '%';

    const labelEl = meterEl.querySelector('.cs-meter-label');
    if (labelEl) {
        const badge = info.isEstimated ? ' <span class="cs-estimated-badge">(추정)</span>' : '';
        labelEl.innerHTML = `컨텍스트 사용량${badge}`;
    }

    const details = meterEl.querySelectorAll('.cs-meter-detail');
    if (details[0]) {
        details[0].innerHTML = `<span>채팅: ${info.chatTokens.toLocaleString()} 토큰</span><span>가용: ${info.available.toLocaleString()} 토큰</span>`;
    }
    if (details[1]) {
        details[1].innerHTML = `<span>🔧 시스템: ${info.systemTokens.toLocaleString()} 토큰${info.isEstimated ? ' (추정)' : ''}</span><span>전체: ${info.maxContext.toLocaleString()}</span>`;
    }

    let sumInfo = meterEl.querySelector('.cs-summarized-info');
    if (info.summarizedCount > 0) {
        if (!sumInfo) {
            sumInfo = document.createElement('div');
            sumInfo.className = 'cs-summarized-info';
            meterEl.appendChild(sumInfo);
        }
        sumInfo.textContent = `✓ ${info.summarizedCount}개 메시지 요약 완료 (${info.summarizedTokens.toLocaleString()} 토큰 제외됨)`;
    } else if (sumInfo) {
        sumInfo.remove();
    }
}

// ===== 메인 팝업 =====
function showSummarizerPopup() {
    const existing = document.querySelector('.cs-overlay');
    if (existing) {
        existing.style.display = 'flex';
        existing.setAttribute('data-theme', getCsSettings().theme);

        const meter = existing.querySelector('.cs-context-meter');
        if (meter) {
            const info = getContextInfo();
            updateMeter(meter, info);
        }
        return;
    }

    const settings = getCsSettings();
    const profiles = getAvailableProfiles();
    const info = getContextInfo();

    const overlay = document.createElement('div');
    overlay.className = 'cs-overlay';
    overlay.setAttribute('data-theme', settings.theme);

    const popup = document.createElement('div');
    popup.className = 'cs-popup';

    ['romance-corner-tr', 'romance-corner-bl', 'romance-corner-br'].forEach(cls => {
        const span = document.createElement('span');
        span.className = cls;
        span.textContent = '❦';
        popup.appendChild(span);
    });

    const header = document.createElement('div');
    header.className = 'cs-header';
    header.innerHTML = '<span class="cs-header-title">📝 채팅 요약</span>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'cs-close-btn';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => overlay.style.display = 'none');
    header.appendChild(closeBtn);

    const content = document.createElement('div');
    content.className = 'cs-content';

    popup.appendChild(header);
    popup.appendChild(content);
    overlay.appendChild(popup);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.style.display = 'none';
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.style.display !== 'none') overlay.style.display = 'none';
    });

    document.body.appendChild(overlay);
    showMainView(content, settings, profiles, info, overlay);
}

// ===== 메인 화면 =====
function showMainView(content, settings, profiles, info, overlay) {
    const ctx = SillyTavern.getContext();
    const fillClass = info.usagePercent >= 90 ? 'danger' : info.usagePercent >= 70 ? 'warning' : 'safe';
    const fillWidth = Math.min(info.usagePercent, 100);

    let profileOpts = '<option value="">기본 (현재 연결)</option>';
    profiles.forEach(p => {
        const sel = settings.profileId === p.id ? 'selected' : '';
        const model = p.model ? ` (${p.model})` : '';
        profileOpts += `<option value="${p.id}" ${sel}>${escapeHtml(p.name)}${escapeHtml(model)}</option>`;
    });

    let warningHtml = '';
    if (info.usagePercent >= settings.warnThreshold) {
        warningHtml = `
            <div class="cs-warning-banner">
                <span class="cs-warning-icon">⚠️</span>
                <span>컨텍스트 사용량이 ${info.usagePercent}%입니다.<br>요약을 권장합니다!</span>
            </div>`;
    }

    let summarizedHtml = '';
    if (info.summarizedCount > 0) {
        summarizedHtml = `<div class="cs-summarized-info">✓ ${info.summarizedCount}개 메시지 요약 완료 (${info.summarizedTokens.toLocaleString()} 토큰 제외됨)</div>`;
    }

    let truncatedHtml = '';
    if (info.truncatedCount > 0) {
        truncatedHtml = `<div class="cs-truncated-info">⚠️ 메시지 0~${info.truncatedCount - 1}번 (${info.truncatedCount}개)이 컨텍스트에서 잘렸습니다</div>`;
    }

    const estimatedBadge = info.isEstimated ? ' <span class="cs-estimated-badge">(추정)</span>' : '';

    let defaultStart = 0;
    for (let i = 0; i < ctx.chat.length; i++) {
        if (ctx.chat[i].extra?.cs_summarized) defaultStart = i + 1;
    }
    const defaultEnd = Math.max(0, ctx.chat.length - 1);

    let markerHtml = '';
    if (info.summarizedCount === 0 && ctx.chat.length > 1) {
        markerHtml = `
        <div class="cs-range-section" style="margin-top:4px;">
            <div class="cs-range-header">📌 이미 요약한 범위가 있다면 표시하세요</div>
            <div class="cs-range-inputs">
                <span class="cs-label">메시지</span>
                <input type="number" class="cs-range-input" id="cs-pre-mark-start" value="0" min="0" max="${ctx.chat.length - 1}">
                <span class="cs-range-sep">~</span>
                <input type="number" class="cs-range-input" id="cs-pre-mark-end" value="${defaultEnd}" min="0" max="${ctx.chat.length - 1}">
                <span class="cs-label">번</span>
            </div>
            <div class="cs-range-info">총 ${ctx.chat.length}개 메시지</div>
            <button class="cs-mark-btn" id="cs-pre-mark-btn" style="margin-top:8px;">✓ 요약 완료로 표시</button>
        </div>`;
    }

    content.innerHTML = `
        <div class="cs-context-meter">
            <div class="cs-meter-header">
                <span class="cs-meter-label">컨텍스트 사용량${estimatedBadge}</span>
                <span class="cs-meter-value">${info.usagePercent}%</span>
            </div>
            <div class="cs-meter-bar">
                <div class="cs-meter-fill ${fillClass}" style="width:${fillWidth}%"></div>
            </div>
            <div class="cs-meter-detail">
                <span>채팅: ${info.chatTokens.toLocaleString()} 토큰</span>
                <span>가용: ${info.available.toLocaleString()} 토큰</span>
            </div>
            <div class="cs-meter-detail" style="margin-top:4px;">
                <span>🔧 시스템: ${info.systemTokens.toLocaleString()} 토큰${info.isEstimated ? ' (추정)' : ''}</span>
                <span>전체: ${info.maxContext.toLocaleString()}</span>
            </div>
            ${truncatedHtml}
            ${summarizedHtml}
        </div>
        ${warningHtml}
        ${markerHtml}
        <div class="cs-profile-section">
            <label class="cs-label">연결 프로필</label>
            <select class="cs-select" id="cs-profile-select">${profileOpts}</select>
        </div>
        <div class="cs-prompt-section">
            <div class="cs-prompt-toggle" id="cs-prompt-toggle">
                <div class="cs-prompt-toggle-left">
                    <span class="cs-label">요약 프롬프트</span>
                    <button class="cs-prompt-reset-btn" id="cs-prompt-reset" style="display:none;">↻ 초기화</button>
                </div>
                <span class="cs-prompt-toggle-icon" id="cs-toggle-icon">▶</span>
            </div>
            <textarea class="cs-textarea" id="cs-prompt-area" style="display:none;">${escapeHtml(settings.promptTemplate)}</textarea>
        </div>
        <button class="cs-generate-btn" id="cs-generate-btn">📝 요약 생성</button>`;

    content.querySelector('#cs-profile-select').addEventListener('change', function () {
        settings.profileId = this.value;
        SillyTavern.getContext().saveSettingsDebounced();
    });

    const toggleBtn = content.querySelector('#cs-prompt-toggle');
    const toggleIcon = content.querySelector('#cs-toggle-icon');
    const promptArea = content.querySelector('#cs-prompt-area');
    const promptResetBtn = content.querySelector('#cs-prompt-reset');

    toggleBtn.addEventListener('click', (e) => {
        if (e.target.id === 'cs-prompt-reset') return;
        const visible = promptArea.style.display !== 'none';
        promptArea.style.display = visible ? 'none' : 'block';
        promptResetBtn.style.display = visible ? 'none' : 'inline-block';
        toggleIcon.textContent = visible ? '▶' : '▼';
        toggleIcon.classList.toggle('open', !visible);
    });

    promptArea.addEventListener('input', function () {
        settings.promptTemplate = this.value;
        SillyTavern.getContext().saveSettingsDebounced();
    });

    promptResetBtn.addEventListener('click', () => {
        if (!confirm('프롬프트를 기본값으로 초기화할까요?')) return;
        settings.promptTemplate = CS_DEFAULT_PROMPT;
        promptArea.value = CS_DEFAULT_PROMPT;
        SillyTavern.getContext().saveSettingsDebounced();
        toastr.success('프롬프트가 기본값으로 초기화되었습니다.');
    });

    const preMarkBtn = content.querySelector('#cs-pre-mark-btn');
    if (preMarkBtn) {
        preMarkBtn.addEventListener('click', async function () {
            const startIdx = parseInt(content.querySelector('#cs-pre-mark-start').value) || 0;
            const endIdx = parseInt(content.querySelector('#cs-pre-mark-end').value) || 0;
            if (startIdx > endIdx) {
                toastr.warning('시작 번호가 끝 번호보다 큽니다!');
                return;
            }
            const count = await markAsSummarized(startIdx, endIdx);
            this.textContent = `✓ ${count}개 메시지 표시 완료!`;
            this.style.pointerEvents = 'none';
            this.style.opacity = '0.6';

            const newInfo = getContextInfo();
            const meter = content.querySelector('.cs-context-meter');
            if (meter) updateMeter(meter, newInfo);
            toastr.success(`${count}개 메시지가 요약 완료로 표시되었습니다.`);
        });
    }

    content.querySelector('#cs-generate-btn').addEventListener('click', () => {
        settings.profileId = content.querySelector('#cs-profile-select').value;
        SillyTavern.getContext().saveSettingsDebounced();
        content.innerHTML = `
            <div class="cs-loading">
                <div class="cs-spinner"></div>
                <span>요약 생성 중...</span>
            </div>`;
        generateSummary(content, settings, profiles, overlay);
    });
}

// ===== 요약 생성 (★ 최대컨텍스트에 맞게 채팅 자르기) =====
async function generateSummary(content, settings, profiles, overlay) {
    const ctx = SillyTavern.getContext();
    const prompt = buildSummaryPrompt(settings);

    try {
        let result;

        if (settings.profileId) {
            const CMRS = ctx.ConnectionManagerRequestService;

            // ★ 사용자의 최대컨텍스트 설정에 맞게 채팅 히스토리 자르기
            const isOpenai = ctx.mainApi === 'openai';
            const maxCtx = isOpenai
                ? (parseInt(ctx.chatCompletionSettings?.openai_max_context) || 128000)
                : (parseInt(document.getElementById('max_context')?.value) || ctx.maxContext || 128000);
            const maxResponseTokens = isOpenai
                ? (parseInt(ctx.chatCompletionSettings?.openai_max_tokens) || 4000)
                : (parseInt(document.getElementById('max_tokens')?.value) || 4000);

            const promptTokens = ctx.getTokenCount(prompt);
            const systemMsgTokens = ctx.getTokenCount('You are a helpful assistant that summarizes roleplay chat logs into structured YAML format.');
            const overhead = promptTokens + systemMsgTokens + maxResponseTokens + 500; // 500 = 안전 마진
            const chatBudget = Math.max(0, maxCtx - overhead);

            console.log(`[Chat Summarizer] maxCtx=${maxCtx}, response=${maxResponseTokens}, prompt=${promptTokens}, overhead=${overhead}, chatBudget=${chatBudget}`);

            const chatHistory = buildChatHistoryText(chatBudget);

            const messages = [
                { role: 'system', content: 'You are a helpful assistant that summarizes roleplay chat logs into structured YAML format.' },
                { role: 'user', content: `Here is the chat history to summarize:\n\n${chatHistory}\n\n---\n\n${prompt}` },
            ];
            const response = await CMRS.sendRequest(settings.profileId, messages, maxResponseTokens, {
                stream: true, signal: null, extractData: true, includePreset: false, includeInstruct: false,
            });

            if (typeof response === 'function') {
                const streamGen = response();
                let lastText = '';
                for await (const chunk of streamGen) {
                    lastText = chunk.text || '';
                    const loadingSpan = content.querySelector('.cs-loading span');
                    if (loadingSpan) {
                        const charCount = lastText.length;
                        loadingSpan.textContent = `요약 생성 중... (${charCount.toLocaleString()}자)`;
                    }
                }
                result = lastText;
            } else if (typeof response === 'string') {
                result = response;
            } else if (response?.content) {
                result = response.content;
            } else if (response?.choices?.[0]?.message?.content) {
                result = response.choices[0].message.content;
            } else if (response?.text) {
                result = response.text;
            } else {
                result = String(response);
            }
        } else {
            result = await ctx.generateQuietPrompt({
                quietPrompt: prompt, skipWIAN: true, removeReasoning: true,
            });
        }

        if (!result || !result.trim()) {
            showError(content, '응답이 비어있습니다.', settings, profiles, overlay);
            return;
        }

        const parsed = parseSummaryResult(result);
        showResult(content, parsed, settings, profiles, overlay);
    } catch (err) {
        console.error('[Chat Summarizer] Error:', err);
        showError(content, err.message || '알 수 없는 오류', settings, profiles, overlay);
    }
}

// ===== 에러 =====
function showError(content, msg, settings, profiles, overlay) {
    content.innerHTML = `
        <div class="cs-error-msg">에러: ${escapeHtml(msg)}</div>
        <div class="cs-bottom-actions">
            <button class="cs-retry-btn" id="cs-retry">↻ 다시 시도</button>
            <button class="cs-retry-btn" id="cs-error-reset" style="color:var(--cs-error);">✕ 초기화</button>
        </div>`;
    content.querySelector('#cs-retry').addEventListener('click', () => {
        showMainView(content, settings, profiles, getContextInfo(), overlay);
    });
    content.querySelector('#cs-error-reset').addEventListener('click', () => overlay.remove());
}

// ===== 결과 =====
function showResult(content, parsed, settings, profiles, overlay) {
    const ctx = SillyTavern.getContext();
    const sectionLabels = {
        Main_Characters: '👤 주요 인물',
        Minor_Characters: '👥 보조 인물',
        Timeline: '📅 타임라인',
        Locations: '📍 장소',
        Lore: '📖 로어',
    };

    const allEmpty = Object.values(parsed.sections).every(v => !v.trim());

    let sectionsHtml = '';
    if (!allEmpty) {
        for (const [key, label] of Object.entries(sectionLabels)) {
            const text = parsed.sections[key] || '';
            const has = text.trim().length > 0;
            const lines = Math.max(6, text.split('\n').length + 2);

            sectionsHtml += `
                <div class="cs-result-section" data-section="${key}">
                    <div class="cs-result-header">
                        <div class="cs-result-title">
                            <span>${label}</span>
                            ${has ? '' : '<span style="font-size:11px;color:var(--cs-text-dim);">(비어있음)</span>'}
                        </div>
                        <div class="cs-result-actions">
                            <button class="cs-copy-btn" data-copy-section="${key}">복사</button>
                        </div>
                    </div>
                    <div class="cs-result-body open">
                        <textarea class="cs-result-textarea" data-section="${key}" rows="${lines}">${escapeHtml(text)}</textarea>
                    </div>
                </div>`;
        }
    }

    let rawFallbackHtml = '';
    if (allEmpty && parsed.raw.trim()) {
        const rawLines = Math.max(6, parsed.raw.split('\n').length + 2);
        rawFallbackHtml = `
            <div class="cs-result-section" data-section="raw">
                <div class="cs-result-header">
                    <div class="cs-result-title">
                        <span>📄 전체 응답 (커스텀 형식)</span>
                    </div>
                    <div class="cs-result-actions">
                        <button class="cs-copy-btn" data-copy-section="raw">복사</button>
                    </div>
                </div>
                <div class="cs-result-body open">
                    <textarea class="cs-result-textarea" data-section="raw" rows="${rawLines}">${escapeHtml(parsed.raw)}</textarea>
                </div>
            </div>`;
    }

    let defaultStart = 0;
    for (let i = 0; i < ctx.chat.length; i++) {
        if (ctx.chat[i].extra?.cs_summarized) defaultStart = i + 1;
    }
    const defaultEnd = Math.max(0, ctx.chat.length - 1);

    content.innerHTML = `
        <div class="cs-context-meter" style="padding:10px 14px;">
            <div class="cs-meter-header" style="margin-bottom:0;">
                <span class="cs-meter-label">요약 완료</span>
                <span class="cs-meter-value" style="color:var(--cs-success);">✓</span>
            </div>
        </div>
        ${sectionsHtml}
        ${rawFallbackHtml}
        <button class="cs-copy-all-btn" id="cs-copy-all">📋 전체 복사</button>
        <div class="cs-range-section">
            <div class="cs-range-header">📌 요약 완료 표시 (게이지에서 제외)</div>
            <div class="cs-range-inputs">
                <span class="cs-label">메시지</span>
                <input type="number" class="cs-range-input" id="cs-mark-start" value="${defaultStart}" min="0" max="${ctx.chat.length - 1}">
                <span class="cs-range-sep">~</span>
                <input type="number" class="cs-range-input" id="cs-mark-end" value="${defaultEnd}" min="0" max="${ctx.chat.length - 1}">
                <span class="cs-label">번</span>
            </div>
            <div class="cs-range-info">
                총 ${ctx.chat.length}개 메시지 (이미 요약됨: ${defaultStart}개)
            </div>
            <button class="cs-mark-btn" id="cs-mark-btn" style="margin-top:10px;">✓ 요약 완료로 표시</button>
        </div>
        <div class="cs-bottom-actions">
            <button class="cs-retry-btn" id="cs-regenerate">↻ 다시 생성</button>
            <button class="cs-retry-btn" id="cs-reset" style="color:var(--cs-error);">✕ 초기화</button>
        </div>`;

    content.querySelectorAll('.cs-result-header').forEach(header => {
        header.addEventListener('click', (e) => {
            if (e.target.classList.contains('cs-copy-btn')) return;
            header.nextElementSibling.classList.toggle('open');
        });
    });

    content.querySelectorAll('.cs-copy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const key = btn.dataset.copySection;
            const ta = content.querySelector(`.cs-result-textarea[data-section="${key}"]`);
            copyToClipboard(ta ? ta.value : '', btn);
        });
    });

    content.querySelector('#cs-copy-all').addEventListener('click', function () {
        let full = '';
        content.querySelectorAll('.cs-result-textarea').forEach(ta => {
            if (ta.value.trim()) full += `${ta.dataset.section}:\n${ta.value.trim()}\n\n`;
        });
        copyToClipboard(full.trim(), this);
    });

    content.querySelector('#cs-mark-btn').addEventListener('click', async function () {
        const startIdx = parseInt(content.querySelector('#cs-mark-start').value) || 0;
        const endIdx = parseInt(content.querySelector('#cs-mark-end').value) || 0;

        if (startIdx > endIdx) {
            toastr.warning('시작 번호가 끝 번호보다 큽니다!');
            return;
        }

        const count = await markAsSummarized(startIdx, endIdx);
        this.textContent = `✓ ${count}개 메시지 표시 완료!`;
        this.style.pointerEvents = 'none';
        this.style.opacity = '0.6';

        const newInfo = getContextInfo();
        toastr.success(`${count}개 메시지가 요약 완료로 표시되었습니다. 게이지: ${newInfo.usagePercent}%`);
    });

    content.querySelector('#cs-regenerate').addEventListener('click', () => {
        content.innerHTML = `<div class="cs-loading"><div class="cs-spinner"></div><span>요약 생성 중...</span></div>`;
        generateSummary(content, settings, profiles, overlay);
    });

    content.querySelector('#cs-reset').addEventListener('click', () => overlay.remove());
}

// ===== 컨텍스트 체크 =====
function checkContextWarning() {
    const settings = getCsSettings();
    if (!settings.warnEnabled) return;
    if (window._csWarningShown) return;
    const info = getContextInfo();
    if (info.usagePercent >= settings.warnThreshold) {
        window._csWarningShown = true;
        showContextWarning(info);
    }
}

// ===== 설정 UI =====
function loadCsSettingsUI() {
    const settings = getCsSettings();

    let themeOpts = '';
    for (const [key, label] of Object.entries(CS_THEMES)) {
        themeOpts += `<option value="${key}" ${settings.theme === key ? 'selected' : ''}>${label}</option>`;
    }

    const html = `
    <div id="chat-summarizer-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>📝 Chat Summarizer</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="cb-setting-row">
                    <label for="cs_theme">팝업 테마</label>
                    <select id="cs_theme" class="text_pole" style="width:180px;">${themeOpts}</select>
                </div>
                <div class="cb-setting-row">
                    <label for="cs_warn_enabled">컨텍스트 경고 팝업</label>
                    <input id="cs_warn_enabled" type="checkbox" ${settings.warnEnabled ? 'checked' : ''} />
                </div>
                <div class="cb-setting-row">
                    <label for="cs_warn_threshold">경고 기준 (%)</label>
                    <input id="cs_warn_threshold" type="number" class="text_pole" min="50" max="100" value="${settings.warnThreshold}" style="width:80px;" />
                </div>
                <small style="color:#888;display:block;margin-top:6px;">
                    채팅 토큰이 가용 컨텍스트의 해당 %를 넘으면 경고가 뜹니다.
                </small>
            </div>
        </div>
    </div>`;

    $('#extensions_settings2').append(html);

    const save = SillyTavern.getContext().saveSettingsDebounced;

    $('#cs_theme').on('change', function () {
        settings.theme = $(this).val();
        save();
        const ol = document.querySelector('.cs-overlay');
        if (ol) ol.setAttribute('data-theme', settings.theme);
    });

    $('#cs_warn_enabled').on('change', function () {
        settings.warnEnabled = !!$(this).prop('checked');
        save();
    });

    $('#cs_warn_threshold').on('input', function () {
        settings.warnThreshold = parseInt($(this).val(), 10) || 75;
        save();
    });
}

// ===== 메인 버튼 =====
function addCsButton() {
    document.getElementById('chat-summarizer-btn')?.remove();

    const btn = document.createElement('div');
    btn.id = 'chat-summarizer-btn';
    btn.textContent = '📝';
    btn.title = '채팅 요약';
    btn.style.cssText = 'cursor:pointer;font-size:1.2em;padding:3px 5px;border-radius:5px;transition:background 0.2s;';
    btn.addEventListener('click', () => {
        const ctx = SillyTavern.getContext();
        if (!ctx.chat || ctx.chat.length === 0) {
            toastr.warning('채팅이 없습니다!');
            return;
        }
        showSummarizerPopup();
    });

    const existingWrapper = document.getElementById('cb-btn-wrapper');
    if (existingWrapper) {
        existingWrapper.appendChild(btn);
        return;
    }

    const sendForm = document.getElementById('leftSendForm') || document.getElementById('send_form');
    if (sendForm) {
        sendForm.insertBefore(btn, sendForm.firstChild);
    }

    console.log('[Chat Summarizer] Button added');
}

// ===== Init =====
(function init() {
    const ctx = SillyTavern.getContext();
    loadCsSettingsUI();
    setTimeout(addCsButton, 1500);
    setTimeout(installFetchMonitor, 3000);

    ctx.eventSource.on(ctx.eventTypes.CHARACTER_MESSAGE_RENDERED, () => {
        setTimeout(checkContextWarning, 500);
    });

    ctx.eventSource.on(ctx.eventTypes.CHAT_CHANGED, () => {
        window._csLastSystemTokens = null;
        window._csLastChatRange = null;
        window._csWarningShown = false;
        window._csItemizationStale = true;
        document.querySelector('.cs-overlay')?.remove();
        console.log('[Chat Summarizer] Chat changed, cache cleared');
    });

    console.log('[Chat Summarizer] Extension loaded!');
})();
