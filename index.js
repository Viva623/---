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
    warnThreshold: 85,
    promptTemplate: '',
    theme: 'dark',
});

const CS_DEFAULT_PROMPT = `[Pause the roleplay. You are the Game Master—an entity responsible for tracking all events, characters, and world details. Your task is to write a detailed report of the roleplay so far to keep the story focused and internally consistent. Deep-analyze today's entire chat history, world info, and character interactions, then produce a summary without continuing the roleplay. Output YAML only, wrapped in <summary></summary> tags.]

Critical: Avoid Redundant Summarization
Before writing, scan for any existing summary in <summary> tags or timeline data in the lorebook/world info.

If a prior summary or lorebook timeline exists, identify the last recorded timestamp (the most recent event entry).
Your new summary begins AFTER that timestamp. Do NOT re-summarize, restate, or duplicate anything already recorded.
For the Timeline section specifically: start logging from the first event that occurs after the last recorded timestamp.
For Main Characters / Minor Characters / Locations / Lore: only add new entries or update existing entries with changes that occurred after the last recorded point. Do not rewrite unchanged information.
If NO prior summary or lorebook timeline exists, summarize the full chat history from the beginning.

Timeline vs Lore Division Rule:

Timeline records WHAT HAPPENED: actions, dialogue, events in sequence.
- Include key dialogue lines verbatim (quoted).
- For recurring systems/patterns, write a ONE-LINE contextual hint on first occurrence, then reference by name only on subsequent occurrences.

Lore records WHAT SOMETHING IS: definitions, mechanics, accumulated patterns, symbolic meaning, character analysis.
- When a new system/pattern/rule is established in a scene, create or update its Lore entry with full explanation.
- When an existing system appears in a new scene, update the Lore entry ONLY if something changed.

Neither section should fully duplicate the other. Timeline provides narrative context; Lore provides reference context.

NPC & Location Scope Rules:

LOCATIONS — answer ONLY "What does this place look like?"
- Physical description: architecture, layout, key rooms/objects, sensory details.
- DO NOT include events, character emotions, or analysis.
- Merge repeated entries into ONE entry.

MINOR CHARACTERS (NPCs) — answer ONLY "Who is this person?"
- Identity: name, age, affiliation/role, 1-2 physical identifiers.
- Traits: bracketed list, max 3-5 items.
- DO NOT include scene-by-scene actions (→ Timeline).

MAIN CHARACTERS — follow the template below.

CROSS-REFERENCE RULE: Use "(→ Section: Entry)" pointers instead of restating information.
MERGE / DEDUP RULE: Keep the LONGEST version in its primary section; replace copies with pointers.

Your summary must include all of the following sections:

Main_Characters:
  - name: (Full Name)
    appearance: (species, physical details)
    role: (who they are in the story, 1-2 sentences)
    traits: ["trait1", "trait2", "trait3"]
    items: ["item1", "item2"]
    cloths: ["clothing1", "clothing2"]

Minor_Characters:
##(Name): (Brief description—role, traits, appearance in 1-2 lines)

Timeline:
##(Date)
###(Time)
  - (Event description)

Locations:
##(Place Name): (Physical description in 1-2 lines)

Lore:
##(Entry Name): (Definition/explanation)

> If an earlier summary exists, append only new events and changed entries. Return the complete merged YAML inside <summary></summary> tags only—no commentary outside the tags.`;

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

// ===== 컨텍스트 계산 =====
function getContextInfo() {
    const ctx = SillyTavern.getContext();
    const isOpenai = ctx.mainApi === 'openai';
    const maxCtxEl = document.getElementById(isOpenai ? 'openai_max_context' : 'max_context');
    const maxTokEl = document.getElementById(isOpenai ? 'openai_max_tokens' : 'max_tokens');

    const maxContext = parseInt(maxCtxEl?.value) || ctx.maxContext || 8192;
    const reservedResponse = parseInt(maxTokEl?.value) || 0;

    // ★ 로어북(World Info) 예산 계산
    const wiBudgetEl = document.getElementById('world_info_budget');
    const wiBudgetCapEl = document.getElementById('world_info_budget_cap');
    const wiBudgetPercent = parseInt(wiBudgetEl?.value) || 0;
    const wiBudgetCap = parseInt(wiBudgetCapEl?.value) || 0;

    let wiBudgetTokens = 0;
    if (wiBudgetPercent > 0) {
        wiBudgetTokens = Math.floor(maxContext * (wiBudgetPercent / 100));
        if (wiBudgetCap > 0 && wiBudgetTokens > wiBudgetCap) {
            wiBudgetTokens = wiBudgetCap;
        }
    }

    const available = maxContext - reservedResponse - wiBudgetTokens;

    // ★ 전체 토큰 & 요약 완료 토큰
    let allTokens = 0;
    let summarizedTokens = 0;
    let summarizedCount = 0;

    for (const msg of ctx.chat) {
        const tokens = msg.extra?.token_count || ctx.getTokenCount(msg.mes || '');
        if (msg.extra?.cs_summarized) {
            summarizedTokens += tokens;
            summarizedCount++;
        }
        allTokens += tokens;
    }

    // ★ 실제 컨텍스트에 들어가는 토큰 계산 (뒤에서부터)
    let inContextTokens = 0;
    let inContextStart = ctx.chat.length; // 컨텍스트에 포함되는 첫 메시지 인덱스

    for (let i = ctx.chat.length - 1; i >= 0; i--) {
        const msg = ctx.chat[i];
        if (msg.extra?.cs_summarized) continue; // 요약된 건 스킵
        const tokens = msg.extra?.token_count || ctx.getTokenCount(msg.mes || '');
        if (inContextTokens + tokens > available) break; // 넘치면 중단
        inContextTokens += tokens;
        inContextStart = i;
    }

    const truncatedCount = inContextStart; // 잘리는 메시지 수
    const usagePercent = available > 0 ? Math.round((inContextTokens / available) * 100) : 0;

    return {
        maxContext, reservedResponse, wiBudgetTokens, available,
        chatTokens: inContextTokens,    // 실제 컨텍스트에 들어가는 토큰
        allTokens,                       // 전체 채팅 토큰
        summarizedTokens, summarizedCount,
        truncatedCount, inContextStart,  // 잘림 정보
        usagePercent, chatLength: ctx.chat.length
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

// ===== 파싱 =====
function parseSummaryResult(text) {
    const summaryMatch = text.match(/<summary>([\s\S]*?)<\/summary>/i);
    const raw = summaryMatch ? summaryMatch[1].trim() : text.trim();

    const sections = { Main_Characters: '', Minor_Characters: '', Timeline: '', Locations: '', Lore: '' };
    const names = Object.keys(sections);

    for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const regex = new RegExp(`^${name}[:\\s]*$`, 'im');
        const match = raw.search(regex);
        if (match === -1) continue;

        let endIdx = raw.length;
        for (let j = i + 1; j < names.length; j++) {
            const nextRegex = new RegExp(`^${names[j]}[:\\s]*$`, 'im');
            const nextMatch = raw.substring(match + name.length).search(nextRegex);
            if (nextMatch !== -1) { endIdx = match + name.length + nextMatch; break; }
        }

        const content = raw.substring(match, endIdx).trim();
        const headerEnd = content.indexOf('\n');
        sections[name] = headerEnd !== -1 ? content.substring(headerEnd + 1).trim() : '';
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

// ===== 메인 팝업 =====
function showSummarizerPopup() {
    const existing = document.querySelector('.cs-overlay');
    if (existing) {
        existing.style.display = 'flex';
        const settings = getCsSettings();
        const profiles = getAvailableProfiles();
        const info = getContextInfo();
        existing.setAttribute('data-theme', settings.theme);
        const content = existing.querySelector('.cs-content');
        if (content) showMainView(content, settings, profiles, info, existing);
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
    const fillClass = info.usagePercent >= 90 ? 'danger' : info.usagePercent >= 70 ? 'warning' : 'safe';
    const fillWidth = Math.min(info.usagePercent, 100);

    let profileOpts = '<option value="">기본 (현재 연결)</option>';
    profiles.forEach(p => {
        const sel = settings.profileId === p.id ? 'selected' : '';
        const model = p.model ? ` (${p.model})` : '';
        profileOpts += `<option value="${p.id}" ${sel}>${escapeHtml(p.name)}${escapeHtml(model)}</option>`;
    });

    let warningHtml = '';
    if (info.usagePercent >= 85) {
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

    content.innerHTML = `
        <div class="cs-context-meter">
            <div class="cs-meter-header">
                <span class="cs-meter-label">컨텍스트 사용량</span>
                <span class="cs-meter-value">${info.usagePercent}%</span>
            </div>
            <div class="cs-meter-bar">
                <div class="cs-meter-fill ${fillClass}" style="width:${fillWidth}%"></div>
            </div>
            <div class="cs-meter-detail">
                <span>채팅: ${info.chatTokens.toLocaleString()} 토큰</span>
                <span>가용: ${info.available.toLocaleString()} 토큰</span>
            </div>
            ${info.wiBudgetTokens > 0 ? `<div class="cs-meter-detail" style="margin-top:4px;"><span>📚 로어북 예약: ${info.wiBudgetTokens.toLocaleString()} 토큰</span><span>전체: ${info.maxContext.toLocaleString()}</span></div>` : ''}
            ${truncatedHtml}
            ${summarizedHtml}
        </div>
        ${warningHtml}
        <div class="cs-profile-section">
            <label class="cs-label">연결 프로필</label>
            <select class="cs-select" id="cs-profile-select">${profileOpts}</select>
        </div>
                <div class="cs-prompt-section">
            <div class="cs-prompt-toggle" id="cs-prompt-toggle">
                <span class="cs-label">요약 프롬프트</span>
                <div class="cs-prompt-toggle-right">
                    <button class="cs-prompt-reset-btn" id="cs-prompt-reset" style="display:none;">↻ 초기화</button>
                    <span class="cs-prompt-toggle-icon" id="cs-toggle-icon">▶</span>
                </div>
            </div>
            <textarea class="cs-textarea" id="cs-prompt-area" style="display:none;">${escapeHtml(settings.promptTemplate)}</textarea>
        </div>
        <button class="cs-generate-btn" id="cs-generate-btn">📝 요약 생성</button>`;

    // ★ 프로필 선택
    content.querySelector('#cs-profile-select').addEventListener('change', function () {
        settings.profileId = this.value;
        SillyTavern.getContext().saveSettingsDebounced();
    });

    // ★ 프롬프트 토글
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

    // ★ 프롬프트 초기화 버튼
    promptResetBtn.addEventListener('click', () => {
        if (!confirm('프롬프트를 기본값으로 초기화할까요?')) return;
        settings.promptTemplate = CS_DEFAULT_PROMPT;
        promptArea.value = CS_DEFAULT_PROMPT;
        SillyTavern.getContext().saveSettingsDebounced();
        toastr.success('프롬프트가 기본값으로 초기화되었습니다.');
    });

    // ★ 요약 생성
    content.querySelector('#cs-generate-btn').addEventListener('click', () => {
        settings.profileId = content.querySelector('#cs-profile-select').value;
        SillyTavern.getContext().saveSettingsDebounced();
        content.innerHTML = `
            <div class="cs-loading">
                <div class="cs-spinner"></div>
                <span>요약 생성 중... 시간이 좀 걸릴 수 있어요</span>
            </div>`;
        generateSummary(content, settings, profiles, overlay);
    });
}

// ===== 요약 생성 =====
async function generateSummary(content, settings, profiles, overlay) {
    const ctx = SillyTavern.getContext();
    const prompt = buildSummaryPrompt(settings);

    try {
        let result;

        if (settings.profileId) {
            const CMRS = ctx.ConnectionManagerRequestService;
            const messages = [
                { role: 'system', content: 'You are a helpful assistant that summarizes roleplay chat logs into structured YAML format.' },
                { role: 'user', content: prompt },
            ];
            const response = await CMRS.sendRequest(settings.profileId, messages, 16000, {
                stream: false, signal: null, extractData: true, includePreset: false, includeInstruct: false,
            });

            if (typeof response === 'string') result = response;
            else if (response?.choices?.[0]?.message?.content) result = response.choices[0].message.content;
            else if (response?.content) result = response.content;
            else if (response?.text) result = response.text;
            else result = String(response);
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
        <button class="cs-retry-btn" id="cs-retry">↻ 돌아가기</button>`;
    content.querySelector('#cs-retry').addEventListener('click', () => {
        showMainView(content, settings, profiles, getContextInfo(), overlay);
    });
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

    // ★ 모든 섹션이 비어있는지 체크
    const allEmpty = Object.values(parsed.sections).every(v => !v.trim());

    let sectionsHtml = '';
    if (!allEmpty) {
        for (const [key, label] of Object.entries(sectionLabels)) {
            const text = parsed.sections[key] || '';
            const has = text.trim().length > 0;
            const lines = Math.max(3, text.split('\n').length + 2);

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
                    <div class="cs-result-body">
                        <textarea class="cs-result-textarea" data-section="${key}" rows="${lines}">${escapeHtml(text)}</textarea>
                    </div>
                </div>`;
        }
    }

    // ★ 섹션 파싱 실패 시 raw 전체 표시
    let rawFallbackHtml = '';
    if (allEmpty && parsed.raw.trim()) {
        const rawLines = Math.max(5, parsed.raw.split('\n').length + 2);
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
            <button class="cs-retry-btn" id="cs-back">← 돌아가기</button>
            <button class="cs-retry-btn" id="cs-reset" style="color:var(--cs-error);">✕ 초기화</button>
        </div>`;

    // 섹션 토글
    content.querySelectorAll('.cs-result-header').forEach(header => {
        header.addEventListener('click', (e) => {
            if (e.target.classList.contains('cs-copy-btn')) return;
            header.nextElementSibling.classList.toggle('open');
        });
    });

    // 섹션 복사
    content.querySelectorAll('.cs-copy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const key = btn.dataset.copySection;
            const ta = content.querySelector(`.cs-result-textarea[data-section="${key}"]`);
            copyToClipboard(ta ? ta.value : '', btn);
        });
    });

    // 전체 복사
    content.querySelector('#cs-copy-all').addEventListener('click', function () {
        let full = '';
        content.querySelectorAll('.cs-result-textarea').forEach(ta => {
            if (ta.value.trim()) full += `${ta.dataset.section}:\n${ta.value.trim()}\n\n`;
        });
        copyToClipboard(full.trim(), this);
    });

    // 요약 완료 마킹
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

    // 다시 생성
    content.querySelector('#cs-regenerate').addEventListener('click', () => {
        content.innerHTML = `<div class="cs-loading"><div class="cs-spinner"></div><span>요약 생성 중...</span></div>`;
        generateSummary(content, settings, profiles, overlay);
    });

    // 돌아가기
    content.querySelector('#cs-back').addEventListener('click', () => {
        showMainView(content, settings, profiles, getContextInfo(), overlay);
    });

    // 초기화
    content.querySelector('#cs-reset').addEventListener('click', () => overlay.remove());
}

// ===== 컨텍스트 체크 =====
function checkContextWarning() {
    const settings = getCsSettings();
    if (!settings.warnEnabled) return;
    const info = getContextInfo();
    if (info.usagePercent >= settings.warnThreshold) showContextWarning(info);
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
        settings.warnThreshold = parseInt($(this).val(), 10) || 85;
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

    ctx.eventSource.on(ctx.eventTypes.CHARACTER_MESSAGE_RENDERED, () => {
        setTimeout(checkContextWarning, 500);
    });

    console.log('[Chat Summarizer] Extension loaded!');
})();
