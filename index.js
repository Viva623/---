// ============================================
//  Chat Summarizer – SillyTavern Extension
// ============================================
const CS_MODULE = 'chat_summarizer';

const CS_THEMES = {
  cyber:   '🌆 사이버펑크',
  retro:   '🖥️ 레트로 Y2K',
  romance: '🏰 로맨스 판타지',
  magical: '⭐ 마법소녀',
  simple:  '⬜ 심플',
};

const CS_DEFAULT_PROMPT = `You are a structured story summarizer. Analyze the conversation between {{user}} and {{char}}, then produce a YAML summary inside <summary> tags.

Rules:
- Write in Korean.
- Only include NEW or UPDATED information not already covered in previous summaries.
- Use concise, factual sentences.
- Timeline entries must be in chronological order with timestamps or event markers.
- Do not repeat information across sections.
- If a section has no new content, write "변동 없음".

<summary>
Main_Characters:
  - Name: {{char}}
    Appearance: (physical description)
    Personality: (key traits)
    Status: (current state/mood)
    Notes: (any new developments)
  - Name: {{user}}
    Appearance: (physical description)
    Personality: (key traits)
    Status: (current state/mood)
    Notes: (any new developments)

Minor_Characters:
  - Name: (NPC name)
    Role: (role in story)
    Notes: (relevant info)

Timeline:
  - Event: (what happened)
    When: (time marker)
    Who: (involved characters)
    Details: (brief description)

Locations:
  - Name: (place name)
    Description: (what it looks like)
    Notes: (any significance)

Lore:
  - Topic: (lore topic)
    Details: (explanation)
</summary>`;

const CS_DEFAULTS = {
  profileId: '',
  warnEnabled: true,
  warnThreshold: 85,
  promptTemplate: CS_DEFAULT_PROMPT,
  theme: 'cyber',
};

/* ── Settings ── */
function getCsSettings() {
  const ctx = SillyTavern.getContext();
  if (!ctx.extensionSettings[CS_MODULE]) {
    ctx.extensionSettings[CS_MODULE] = structuredClone(CS_DEFAULTS);
  }
  const s = ctx.extensionSettings[CS_MODULE];
  for (const [k, v] of Object.entries(CS_DEFAULTS)) {
    if (s[k] === undefined) s[k] = v;
  }
  return s;
}

/* ── Context Info ── */
function getContextInfo() {
  const ctx = SillyTavern.getContext();

  // Read real max context
  const openaiCtxEl = document.getElementById('openai_max_context');
  const textgenCtxEl = document.getElementById('max_context');
  let maxCtx = 0;
  if (ctx.mainApi === 'openai' && openaiCtxEl) {
    maxCtx = parseInt(openaiCtxEl.value) || 0;
  }
  if (!maxCtx && textgenCtxEl) {
    maxCtx = parseInt(textgenCtxEl.value) || 0;
  }
  if (!maxCtx) maxCtx = ctx.maxContext || 8192;

  // Reserved response tokens
  const maxTokensEl = document.getElementById('openai_max_tokens');
  const reservedTokens = maxTokensEl ? (parseInt(maxTokensEl.value) || 0) : 0;
  const available = Math.max(0, maxCtx - reservedTokens);

  // Calculate chat tokens
  const chat = ctx.chat || [];
  let totalTokens = 0;
  const perMsg = [];
  for (const msg of chat) {
    const text = msg.mes || '';
    const t = ctx.getTokenCount(text);
    totalTokens += t;
    perMsg.push(t);
  }

  const usagePercent = available > 0 ? Math.round((totalTokens / available) * 100) : 0;

  return { maxCtx, reservedTokens, available, totalTokens, usagePercent, msgCount: chat.length, perMsg };
}

/* ── Profiles ── */
function getAvailableProfiles() {
  try {
    const ctx = SillyTavern.getContext();
    const CMRS = ctx.ConnectionManagerRequestService;
    if (CMRS && typeof CMRS.getSupportedProfiles === 'function') {
      return CMRS.getSupportedProfiles() || [];
    }
  } catch (e) { console.warn('[CS] profile error:', e); }
  return [];
}

/* ── Build Prompt ── */
function buildSummaryPrompt(settings) {
  const ctx = SillyTavern.getContext();
  let prompt = settings.promptTemplate || CS_DEFAULT_PROMPT;
  prompt = prompt.replace(/\{\{user\}\}/g, ctx.name1 || 'User');
  prompt = prompt.replace(/\{\{char\}\}/g, ctx.name2 || 'Character');
  return prompt;
}

/* ── Parse Result ── */
function parseSummaryResult(text) {
  const match = text.match(/<summary>([\s\S]*?)<\/summary>/i);
  const raw = match ? match[1].trim() : text.trim();

  const sections = {};
  const sectionNames = ['Main_Characters', 'Minor_Characters', 'Timeline', 'Locations', 'Lore'];

  for (let i = 0; i < sectionNames.length; i++) {
    const name = sectionNames[i];
    const nextName = sectionNames[i + 1];
    let regex;
    if (nextName) {
      regex = new RegExp(`${name}:\\s*\\n([\\s\\S]*?)(?=\\n${nextName}:)`, 'i');
    } else {
      regex = new RegExp(`${name}:\\s*\\n([\\s\\S]*)`, 'i');
    }
    const m = raw.match(regex);
    sections[name] = m ? m[1].trim() : '';
  }

  return { raw, sections };
}

/* ── Helpers ── */
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function copyToClipboard(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const orig = btn.textContent;
    btn.textContent = '✓ 복사됨';
    setTimeout(() => btn.textContent = orig, 1500);
  } catch (e) {
    console.error('[CS] copy failed:', e);
  }
}

/* ── Context Warning ── */
function showContextWarning(info) {
  if (document.querySelector('.cs-alert-overlay')) return;
  const settings = getCsSettings();

  const alertOverlay = document.createElement('div');
  alertOverlay.className = 'cs-alert-overlay';

  const alertBox = document.createElement('div');
  alertBox.className = 'cs-alert-box';
  alertBox.innerHTML = `
    <div class="cs-alert-icon">⚠️</div>
    <div class="cs-alert-title">컨텍스트 경고</div>
    <div class="cs-alert-msg">
      현재 사용량이 <b>${info.usagePercent}%</b>입니다.<br>
      (${info.totalTokens.toLocaleString()} / ${info.available.toLocaleString()} 토큰)<br><br>
      다음 응답부터 이전 메시지가 잘릴 수 있습니다.<br>
      요약을 권장합니다!
    </div>
    <button class="cs-alert-btn">확인</button>
  `;
  alertOverlay.appendChild(alertBox);

  alertBox.querySelector('.cs-alert-btn').addEventListener('click', () => alertOverlay.remove());
  alertOverlay.addEventListener('click', (e) => { if (e.target === alertOverlay) alertOverlay.remove(); });

  document.body.appendChild(alertOverlay);
}

/* ── Check Context on new messages ── */
function checkContextWarning() {
  const settings = getCsSettings();
  if (!settings.warnEnabled) return;
  const info = getContextInfo();
  if (info.usagePercent >= settings.warnThreshold) {
    showContextWarning(info);
  }
}

/* ══════════════════════════════════
   MAIN POPUP
   ══════════════════════════════════ */
function showSummarizerPopup() {
  // If popup already exists, just show it
  const existing = document.querySelector('.cs-overlay');
  if (existing) {
    existing.style.display = 'flex';
    return;
  }

  const settings = getCsSettings();
  const profiles = getAvailableProfiles();
  const info = getContextInfo();

  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'cs-overlay';
  overlay.setAttribute('data-theme', settings.theme || 'cyber');

  const popup = document.createElement('div');
  popup.className = 'cs-popup';

  // Header
  const header = document.createElement('div');
  header.className = 'cs-header';
  header.innerHTML = `<span class="cs-header-title">📝 채팅 요약</span>`;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'cs-close-btn';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => {
    overlay.style.display = 'none';
  });
  header.appendChild(closeBtn);

  // Content
  const content = document.createElement('div');
  content.className = 'cs-content';

  popup.appendChild(header);
  popup.appendChild(content);
  overlay.appendChild(popup);

  // Click outside to hide
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.style.display = 'none';
  });

  // Escape key to hide
  const escHandler = (e) => {
    if (e.key === 'Escape' && overlay.style.display !== 'none') {
      overlay.style.display = 'none';
    }
  };
  document.addEventListener('keydown', escHandler);

  document.body.appendChild(overlay);

  // Show the main view (NOT generate immediately!)
  showMainView(content, settings, profiles, info, overlay);
}

/* ── Main View (before generation) ── */
function showMainView(content, settings, profiles, info, overlay) {
  // Meter color
  let meterColor = 'var(--cs-meter-ok)';
  let meterLabel = '여유';
  if (info.usagePercent >= 85) {
    meterColor = 'var(--cs-meter-danger)';
    meterLabel = '위험';
  } else if (info.usagePercent >= 60) {
    meterColor = 'var(--cs-meter-warn)';
    meterLabel = '주의';
  }

  let html = '';

  // Context meter
  html += `
    <div class="cs-context-meter">
      <div class="cs-meter-header">
        <span class="cs-meter-label">컨텍스트 사용량</span>
        <span class="cs-meter-value" style="color:${meterColor};">${info.usagePercent}% (${meterLabel})</span>
      </div>
      <div class="cs-meter-bar">
        <div class="cs-meter-fill" style="width:${Math.min(info.usagePercent, 100)}%;background:${meterColor};"></div>
      </div>
      <div class="cs-meter-detail">
        ${info.totalTokens.toLocaleString()} / ${info.available.toLocaleString()} 토큰 · 메시지 ${info.msgCount}개
      </div>
    </div>`;

  // Profile selector
  html += `<div class="cs-profile-section">
    <label class="cs-profile-label">연결 프로필 선택</label>
    <select class="cs-profile-select" id="cs-profile-select">
      <option value="">현재 연결 사용</option>`;
  for (const p of profiles) {
    const label = `${p.name || p.id} (${p.api || ''} / ${p.model || ''})`;
    const sel = p.id === settings.profileId ? 'selected' : '';
    html += `<option value="${p.id}" ${sel}>${escapeHtml(label)}</option>`;
  }
  html += `</select></div>`;

  // Prompt toggle
  html += `
    <div class="cs-prompt-toggle" id="cs-prompt-toggle">
      <span class="cs-prompt-arrow" id="cs-prompt-arrow">▶</span>
      <span>프롬프트 편집</span>
    </div>
    <div class="cs-prompt-area" id="cs-prompt-area">
      <textarea class="cs-prompt-textarea" id="cs-prompt-input">${escapeHtml(settings.promptTemplate)}</textarea>
    </div>`;

  // Generate button
  html += `<button class="cs-generate-btn" id="cs-generate">📝 요약 생성</button>`;

  content.innerHTML = html;

  // Profile change handler
  const profileSelect = content.querySelector('#cs-profile-select');
  profileSelect?.addEventListener('change', () => {
    settings.profileId = profileSelect.value;
    const ctx = SillyTavern.getContext();
    ctx.saveSettingsDebounced();
  });

  // Prompt toggle handler
  const toggleEl = content.querySelector('#cs-prompt-toggle');
  const arrowEl = content.querySelector('#cs-prompt-arrow');
  const areaEl = content.querySelector('#cs-prompt-area');
  const promptInput = content.querySelector('#cs-prompt-input');

  toggleEl?.addEventListener('click', () => {
    areaEl.classList.toggle('open');
    arrowEl.classList.toggle('open');
  });

  promptInput?.addEventListener('change', () => {
    settings.promptTemplate = promptInput.value;
    const ctx = SillyTavern.getContext();
    ctx.saveSettingsDebounced();
  });

  // Generate button handler
  const genBtn = content.querySelector('#cs-generate');
  genBtn?.addEventListener('click', () => {
    generateSummary(content, settings, profiles, overlay);
  });
}

/* ── Generate Summary ── */
async function generateSummary(content, settings, profiles, overlay) {
  // Show loading
  content.innerHTML = `
    <div class="cs-loading">
      <div class="cs-spinner"></div>
      <div class="cs-loading-text">요약 중입니다...<br>시간이 걸릴 수 있습니다.</div>
    </div>`;

  const prompt = buildSummaryPrompt(settings);

  try {
    let response = '';
    const profileId = settings.profileId;

    if (profileId) {
      // Use specific profile via CMRS
      const ctx = SillyTavern.getContext();
      const CMRS = ctx.ConnectionManagerRequestService;
      if (CMRS && typeof CMRS.sendRequest === 'function') {
        response = await CMRS.sendRequest(profileId, prompt);
      } else {
        throw new Error('ConnectionManagerRequestService not available');
      }
    } else {
      // Use current connection
      const ctx = SillyTavern.getContext();
      response = await ctx.generateQuietPrompt(prompt);
    }

    if (!response || response.trim().length === 0) {
      showError(content, '빈 응답을 받았습니다.', settings, profiles, overlay);
      return;
    }

    const parsed = parseSummaryResult(response);
    showResult(content, parsed, settings, profiles, overlay);

  } catch (error) {
    console.error('[CS] Error:', error);
    showError(content, `오류: ${error.message || error}`, settings, profiles, overlay);
  }
}

/* ── Show Error ── */
function showError(content, message, settings, profiles, overlay) {
  const info = getContextInfo();
  content.innerHTML = `
    <div class="cs-error">
      <div style="font-size:32px;margin-bottom:12px;">😥</div>
      <div>${escapeHtml(message)}</div>
    </div>
    <div style="display:flex;gap:10px;margin-top:14px;">
      <button class="cs-retry-btn" id="cs-error-retry" style="flex:1;">↻ 다시 시도</button>
      <button class="cs-retry-btn" id="cs-error-back" style="flex:1;">← 돌아가기</button>
    </div>`;

  content.querySelector('#cs-error-retry')?.addEventListener('click', () => {
    generateSummary(content, settings, profiles, overlay);
  });
  content.querySelector('#cs-error-back')?.addEventListener('click', () => {
    showMainView(content, settings, profiles, info, overlay);
  });
}

/* ── Show Result ── */
function showResult(content, parsed, settings, profiles, overlay) {
  const sectionLabels = {
    Main_Characters: '👤 주요 인물',
    Minor_Characters: '👥 보조 인물',
    Timeline: '📅 타임라인',
    Locations: '📍 장소',
    Lore: '📖 로어',
  };

  let sectionsHtml = '';
  for (const [key, label] of Object.entries(sectionLabels)) {
    const text = parsed.sections[key] || '';
    const has = text.trim().length > 0;
    const rows = Math.max(3, text.split('\n').length + 2);
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
          <textarea class="cs-result-textarea" data-section="${key}" rows="${rows}">${escapeHtml(text)}</textarea>
        </div>
      </div>`;
  }

  const info = getContextInfo();

  content.innerHTML = `
    <div class="cs-context-meter" style="padding:10px 14px;">
      <div class="cs-meter-header" style="margin-bottom:0;">
        <span class="cs-meter-label">요약 완료</span>
        <span class="cs-meter-value" style="color:var(--cs-meter-ok);">✓</span>
      </div>
    </div>
    ${sectionsHtml}
    <button class="cs-copy-all-btn" id="cs-copy-all">📋 전체 복사</button>
    <div style="display:flex;gap:10px;">
      <button class="cs-retry-btn" id="cs-regenerate" style="flex:1;">↻ 다시 생성</button>
      <button class="cs-retry-btn" id="cs-back" style="flex:1;">← 돌아가기</button>
      <button class="cs-retry-btn" id="cs-reset" style="flex:0.8;color:var(--cs-meter-danger);">✕ 초기화</button>
    </div>`;

  // Section header toggle
  content.querySelectorAll('.cs-result-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.cs-copy-btn')) return;
      const body = header.nextElementSibling;
      body.classList.toggle('open');
    });
  });

  // Copy individual section
  content.querySelectorAll('.cs-copy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const section = btn.dataset.copySection;
      const textarea = content.querySelector(`.cs-result-textarea[data-section="${section}"]`);
      if (textarea) copyToClipboard(textarea.value, btn);
    });
  });

  // Copy all
  content.querySelector('#cs-copy-all')?.addEventListener('click', function () {
    const allText = [...content.querySelectorAll('.cs-result-textarea')]
      .map(ta => ta.value)
      .filter(t => t.trim())
      .join('\n\n');
    copyToClipboard(allText, this);
  });

  // Regenerate
  content.querySelector('#cs-regenerate')?.addEventListener('click', () => {
    generateSummary(content, settings, profiles, overlay);
  });

  // Back to main
  content.querySelector('#cs-back')?.addEventListener('click', () => {
    showMainView(content, settings, profiles, info, overlay);
  });

  // Reset (remove popup entirely)
  content.querySelector('#cs-reset')?.addEventListener('click', () => {
    overlay.remove();
  });
}

/* ══════════════════════════════════
   SETTINGS UI
   ══════════════════════════════════ */
function loadCsSettingsUI() {
  const settingsContainer = document.getElementById('extensions_settings2');
  if (!settingsContainer) return;

  const settings = getCsSettings();

  const html = `
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>📝 Chat Summarizer</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content" style="font-size:small;">
      <div style="margin-bottom:10px;">
        <label style="display:block;margin-bottom:4px;font-weight:bold;">테마</label>
        <select id="cs_set_theme" class="text_pole" style="width:100%;">
          ${Object.entries(CS_THEMES).map(([k, v]) =>
            `<option value="${k}" ${settings.theme === k ? 'selected' : ''}>${v}</option>`
          ).join('')}
        </select>
      </div>
      <div style="margin-bottom:10px;">
        <label style="display:block;margin-bottom:4px;">
          <input type="checkbox" id="cs_set_warn" ${settings.warnEnabled ? 'checked' : ''} />
          컨텍스트 경고 활성화
        </label>
      </div>
      <div style="margin-bottom:10px;">
        <label style="display:block;margin-bottom:4px;font-weight:bold;">경고 임계값 (%)</label>
        <input type="number" id="cs_set_threshold" class="text_pole" value="${settings.warnThreshold}" min="50" max="100" style="width:100%;" />
      </div>
      <div style="margin-bottom:10px;">
        <label style="display:block;margin-bottom:4px;font-weight:bold;">기본 프롬프트</label>
        <textarea id="cs_set_prompt" class="text_pole" rows="6" style="width:100%;font-size:11px;line-height:1.5;">${escapeHtml(settings.promptTemplate)}</textarea>
      </div>
      <div style="margin-bottom:6px;">
        <button id="cs_set_reset_prompt" class="menu_button menu_button_icon">프롬프트 초기화</button>
      </div>
    </div>
  </div>`;

  settingsContainer.insertAdjacentHTML('beforeend', html);

  const ctx = SillyTavern.getContext();

  // Theme
  document.getElementById('cs_set_theme')?.addEventListener('change', function () {
    settings.theme = this.value;
    ctx.saveSettingsDebounced();
    // Update popup theme if open
    const overlay = document.querySelector('.cs-overlay');
    if (overlay) overlay.setAttribute('data-theme', this.value);
  });

  // Warning toggle
  document.getElementById('cs_set_warn')?.addEventListener('change', function () {
    settings.warnEnabled = this.checked;
    ctx.saveSettingsDebounced();
  });

  // Threshold
  document.getElementById('cs_set_threshold')?.addEventListener('change', function () {
    settings.warnThreshold = parseInt(this.value) || 85;
    ctx.saveSettingsDebounced();
  });

  // Prompt
  document.getElementById('cs_set_prompt')?.addEventListener('change', function () {
    settings.promptTemplate = this.value;
    ctx.saveSettingsDebounced();
  });

  // Reset prompt
  document.getElementById('cs_set_reset_prompt')?.addEventListener('click', () => {
    settings.promptTemplate = CS_DEFAULT_PROMPT;
    const promptEl = document.getElementById('cs_set_prompt');
    if (promptEl) promptEl.value = CS_DEFAULT_PROMPT;
    ctx.saveSettingsDebounced();
  });
}

/* ══════════════════════════════════
   BUTTON
   ══════════════════════════════════ */
function addCsButton() {
  if (document.getElementById('cs-main-btn')) return;

  const target =
    document.getElementById('leftSendForm') ||
    document.getElementById('send_form') ||
    document.querySelector('#form_sheld .flex-container');

  if (!target) {
    console.warn('[CS] Button target not found, retrying in 2s');
    setTimeout(addCsButton, 2000);
    return;
  }

  const btn = document.createElement('div');
  btn.id = 'cs-main-btn';
  btn.title = '채팅 요약';
  btn.className = 'fa-solid interactable';
  btn.style.cssText = 'cursor:pointer;font-size:18px;padding:6px;display:flex;align-items:center;justify-content:center;';
  btn.textContent = '📝';

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showSummarizerPopup();
  });

  // Insert before the first child or alongside other buttons
  const firstChild = target.querySelector('#send_but') || target.firstChild;
  if (firstChild) {
    target.insertBefore(btn, firstChild);
  } else {
    target.appendChild(btn);
  }

  console.log('[CS] Button added');
}

/* ══════════════════════════════════
   INIT
   ══════════════════════════════════ */
(function init() {
  loadCsSettingsUI();

  // Add button with slight delay for DOM readiness
  if (document.getElementById('leftSendForm') || document.getElementById('send_form')) {
    addCsButton();
  } else {
    setTimeout(addCsButton, 1500);
  }

  // Hook into character message events for context warning
  try {
    const ctx = SillyTavern.getContext();
    if (ctx.eventSource && ctx.eventTypes) {
      const eventName = ctx.eventTypes.CHARACTER_MESSAGE_RENDERED
        || ctx.eventTypes.MESSAGE_RECEIVED;
      if (eventName) {
        ctx.eventSource.on(eventName, () => {
          setTimeout(checkContextWarning, 1000);
        });
        console.log('[CS] Context warning hook registered');
      }
    }
  } catch (e) {
    console.warn('[CS] Event hook failed:', e);
  }

  console.log('[CS] Chat Summarizer loaded');
})();
