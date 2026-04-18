// 모두의법률 - AI 법률 상담 클라이언트
// chat.html에서만 사용. lawko-auth.js 이후 로드될 것.
(function () {
  'use strict';

  const cfg = window.LAWKO_CONFIG || {};
  const FUNCTION_URL = `${cfg.supabaseUrl}/functions/v1/law-chat`;

  const $messages = document.getElementById('chat-messages');
  const $empty = document.getElementById('empty-state');
  const $input = document.getElementById('chat-input');
  const $send = document.getElementById('send-btn');
  const $inputWrap = document.getElementById('chat-input-wrap');
  const $loginRequired = document.getElementById('login-required');
  const $quotaBar = document.getElementById('quota-bar');
  const $quotaRemaining = document.getElementById('quota-remaining');
  const $quotaLimit = document.getElementById('quota-limit');
  const $quotaPlan = document.getElementById('quota-plan');
  const $quotaUpgrade = document.getElementById('quota-upgrade');

  const history = []; // {role, content}
  let busy = false;

  // ------- 로그인 상태에 따른 UI -------
  async function syncLoginState() {
    const user = window.LawkoAuth && window.LawkoAuth.getUser();
    if (user) {
      $loginRequired.style.display = 'none';
      $inputWrap.style.display = 'block';
      $quotaBar.style.display = 'flex';
      const isPro = window.LawkoAuth.isPro();
      $quotaPlan.textContent = isPro ? 'Pro' : '무료';
      $quotaPlan.style.background = isPro ? 'var(--accent)' : '#334155';
      $quotaPlan.style.color = isPro ? '#fff' : '#CBD5E1';
      $quotaUpgrade.style.display = isPro ? 'none' : 'inline-block';
    } else {
      $loginRequired.style.display = 'block';
      $inputWrap.style.display = 'none';
      $quotaBar.style.display = 'none';
      $empty.style.display = 'none';
    }
  }

  // 로그인 상태를 주기적으로 재확인 (Auth 모듈이 비동기로 초기화됨)
  let lastUserId = null;
  setInterval(() => {
    const user = window.LawkoAuth && window.LawkoAuth.getUser();
    const uid = user ? user.id : null;
    if (uid !== lastUserId) {
      lastUserId = uid;
      syncLoginState();
    }
  }, 500);
  syncLoginState();

  $quotaUpgrade.addEventListener('click', () => {
    if (window.LawkoAuth) window.LawkoAuth.openSubscribe();
  });

  // ------- 입력 UI -------
  function autoResize() {
    $input.style.height = 'auto';
    $input.style.height = Math.min($input.scrollHeight, 160) + 'px';
  }
  $input.addEventListener('input', autoResize);
  $input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
  $send.addEventListener('click', send);

  document.querySelectorAll('.sug').forEach((btn) => {
    btn.addEventListener('click', () => {
      $input.value = btn.dataset.q || btn.textContent;
      autoResize();
      $input.focus();
    });
  });

  // ------- 메시지 렌더 -------
  function appendMessage(role, initialText = '') {
    if ($empty) $empty.style.display = 'none';
    const el = document.createElement('div');
    el.className = `msg ${role}`;
    el.innerHTML = `<span class="role-tag">${role === 'user' ? '나' : 'AI 상담원'}</span><span class="msg-body"></span>`;
    el.querySelector('.msg-body').textContent = initialText;
    $messages.appendChild(el);
    scrollToBottom();
    return el;
  }
  function scrollToBottom() {
    $messages.scrollTop = $messages.scrollHeight;
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  function updateQuota(remaining, limit, isPro) {
    if (typeof remaining === 'number') $quotaRemaining.textContent = remaining;
    if (typeof limit === 'number') $quotaLimit.textContent = limit;
    if (typeof isPro === 'boolean') {
      $quotaPlan.textContent = isPro ? 'Pro' : '무료';
      $quotaPlan.style.background = isPro ? 'var(--accent)' : '#334155';
      $quotaPlan.style.color = isPro ? '#fff' : '#CBD5E1';
      $quotaUpgrade.style.display = isPro ? 'none' : 'inline-block';
    }
  }

  // ------- 전송 -------
  async function send() {
    if (busy) return;
    const text = $input.value.trim();
    if (!text) return;

    const user = window.LawkoAuth && window.LawkoAuth.getUser();
    if (!user) {
      window.LawkoAuth && window.LawkoAuth.openLogin();
      return;
    }

    // Supabase 세션 토큰
    const supa = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    const { data: { session } } = await supa.auth.getSession();
    if (!session) {
      window.LawkoAuth && window.LawkoAuth.openLogin();
      return;
    }

    busy = true;
    $send.disabled = true;
    $send.textContent = '응답 중...';
    $input.value = '';
    autoResize();

    appendMessage('user', text);
    history.push({ role: 'user', content: text });

    const assistantEl = appendMessage('assistant', '');
    const body = assistantEl.querySelector('.msg-body');
    assistantEl.classList.add('loading');

    try {
      const res = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ messages: history }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '오류가 발생했습니다.' }));
        assistantEl.classList.remove('loading');
        body.textContent = err.error || '오류가 발생했습니다.';
        body.style.color = '#EF4444';
        if (err.code === 'QUOTA_EXCEEDED') {
          updateQuota(0, err.limit, err.isPro);
        }
        history.pop(); // 요청이 실패했으므로 user 메시지 제거
        return;
      }

      // SSE 스트리밍 파싱
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let assembled = '';
      let firstDelta = true;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data) continue;
          try {
            const evt = JSON.parse(data);
            if (evt.type === 'meta') {
              updateQuota(evt.remaining, evt.limit, evt.isPro);
            } else if (evt.type === 'delta') {
              if (firstDelta) {
                assistantEl.classList.remove('loading');
                firstDelta = false;
              }
              assembled += evt.text;
              body.textContent = assembled;
              scrollToBottom();
            } else if (evt.type === 'error') {
              assistantEl.classList.remove('loading');
              body.textContent = (assembled || '') + `\n\n[오류: ${evt.message}]`;
              body.style.color = '#EF4444';
            }
          } catch { /* 무시 */ }
        }
      }

      assistantEl.classList.remove('loading');
      if (assembled) {
        history.push({ role: 'assistant', content: assembled });
      }
    } catch (e) {
      assistantEl.classList.remove('loading');
      body.textContent = `네트워크 오류: ${e.message || e}`;
      body.style.color = '#EF4444';
      history.pop();
    } finally {
      busy = false;
      $send.disabled = false;
      $send.textContent = '전송';
      $input.focus();
    }
  }
})();
