// 모두의법률 - 계약서 AI 리뷰 클라이언트
(function () {
  'use strict';

  const cfg = window.LAWKO_CONFIG || {};
  const FUNCTION_URL = `${cfg.supabaseUrl}/functions/v1/contract-review`;
  const MAX_CHARS = 30000;

  const $form = document.getElementById('form-wrap');
  const $login = document.getElementById('login-required');
  const $quota = document.getElementById('quota-bar');
  const $remaining = document.getElementById('quota-remaining');
  const $limit = document.getElementById('quota-limit');
  const $plan = document.getElementById('quota-plan');
  const $upgrade = document.getElementById('quota-upgrade');
  const $title = document.getElementById('contract-title');
  const $text = document.getElementById('contract-text');
  const $charCount = document.getElementById('char-count');
  const $analyzeBtn = document.getElementById('analyze-btn');
  const $sampleBtn = document.getElementById('sample-btn');
  const $clearBtn = document.getElementById('clear-btn');
  const $report = document.getElementById('report');

  let busy = false;

  // ------- 로그인 상태 -------
  async function syncLoginState() {
    const user = window.LawkoAuth && window.LawkoAuth.getUser();
    if (user) {
      $login.style.display = 'none';
      $form.style.display = 'block';
      $quota.style.display = 'flex';
      const isPro = window.LawkoAuth.isPro();
      $plan.textContent = isPro ? 'Pro' : '무료';
      $plan.className = 'quota-plan' + (isPro ? ' pro' : '');
      $upgrade.style.display = isPro ? 'none' : 'inline-block';
      // 초기 한도 표기 (실제 남은 횟수는 요청 후 정확해짐)
      $remaining.textContent = isPro ? '10' : '1';
      $limit.textContent = isPro ? '10' : '1';
    } else {
      $login.style.display = 'block';
      $form.style.display = 'none';
      $quota.style.display = 'none';
    }
  }

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

  $upgrade.addEventListener('click', () => {
    if (window.LawkoAuth) window.LawkoAuth.openSubscribe();
  });

  // ------- 입력 UI -------
  $text.addEventListener('input', () => {
    const n = $text.value.length;
    $charCount.textContent = n.toLocaleString();
    $charCount.parentElement.classList.toggle('over', n > MAX_CHARS);
  });

  $clearBtn.addEventListener('click', () => {
    if ($text.value && !confirm('작성한 내용을 모두 지울까요?')) return;
    $title.value = '';
    $text.value = '';
    $charCount.textContent = '0';
    $report.classList.remove('show');
    $report.innerHTML = '';
  });

  $sampleBtn.addEventListener('click', () => {
    $title.value = '근로계약서 (샘플)';
    $text.value = SAMPLE_CONTRACT;
    $charCount.textContent = $text.value.length.toLocaleString();
    $text.focus();
    $text.setSelectionRange(0, 0);
    window.scrollTo({ top: $text.offsetTop - 80, behavior: 'smooth' });
  });

  $analyzeBtn.addEventListener('click', analyze);

  // ------- 분석 -------
  async function analyze() {
    if (busy) return;
    const text = $text.value.trim();
    const title = $title.value.trim();

    if (text.length < 100) {
      alert('계약서 본문이 너무 짧습니다. (최소 100자)');
      return;
    }
    if (text.length > MAX_CHARS) {
      alert(`계약서가 너무 깁니다. (최대 ${MAX_CHARS.toLocaleString()}자)`);
      return;
    }

    const user = window.LawkoAuth && window.LawkoAuth.getUser();
    if (!user) {
      window.LawkoAuth && window.LawkoAuth.openLogin();
      return;
    }

    const supa = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    const { data: { session } } = await supa.auth.getSession();
    if (!session) {
      window.LawkoAuth && window.LawkoAuth.openLogin();
      return;
    }

    busy = true;
    $analyzeBtn.disabled = true;
    $analyzeBtn.innerHTML = '⏳ 분석 중... (30~60초 소요)';
    $report.classList.add('show');
    $report.innerHTML = '<p style="color:var(--steel);">AI가 계약서를 읽고 분석하는 중입니다. 잠시만 기다려주세요.</p><p class="cursor">▋</p>';
    window.scrollTo({ top: $report.offsetTop - 80, behavior: 'smooth' });

    try {
      const res = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ text, title }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '오류' }));
        $report.innerHTML = `<div class="report-error">${escapeHtml(err.error || '분석에 실패했습니다.')}</div>`;
        if (err.code === 'QUOTA_EXCEEDED') {
          $remaining.textContent = '0';
          $limit.textContent = String(err.limit || '-');
          setTimeout(() => {
            if (confirm('오늘 계약서 리뷰 한도를 모두 사용했습니다.\n광고제거 구독 시 하루 10회까지 이용할 수 있습니다.\n\n지금 구독하시겠어요?')) {
              window.LawkoAuth && window.LawkoAuth.openSubscribe();
            }
          }, 100);
        }
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let assembled = '';
      let meta = null;

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
              meta = evt;
              $remaining.textContent = String(evt.remaining);
              $limit.textContent = String(evt.limit);
            } else if (evt.type === 'delta') {
              assembled += evt.text;
              $report.innerHTML = renderMarkdown(assembled) + '<span class="cursor">▋</span>';
            } else if (evt.type === 'error') {
              $report.innerHTML += `<div class="report-error">${escapeHtml(evt.message)}</div>`;
            }
          } catch { /* 무시 */ }
        }
      }

      $report.innerHTML = renderMarkdown(assembled);

      // Pro 아니고 마지막 리뷰였으면 구독 권유
      if (meta && !meta.isPro && meta.remaining === 0) {
        $report.innerHTML += `
          <div style="margin-top:24px;padding:16px;background:linear-gradient(135deg,rgba(37,99,235,0.1),rgba(59,130,246,0.05));border:1px solid var(--accent);border-radius:10px;">
            <strong style="color:var(--accent-light);">💎 더 많은 계약서를 리뷰하시려면?</strong>
            <p style="margin-top:8px;color:#CBD5E1;font-size:13px;">Pro 구독 시 하루 10회까지 AI 계약서 리뷰를 이용할 수 있습니다.</p>
            <button type="button" class="analyze-btn" style="margin-top:12px;" onclick="window.LawkoAuth && window.LawkoAuth.openSubscribe()">Pro 구독하기</button>
          </div>`;
      }
    } catch (e) {
      $report.innerHTML = `<div class="report-error">네트워크 오류: ${escapeHtml(String(e.message || e))}</div>`;
    } finally {
      busy = false;
      $analyzeBtn.disabled = false;
      $analyzeBtn.innerHTML = '🔍 계약서 분석';
    }
  }

  // ------- 마크다운 렌더 -------
  function renderMarkdown(src) {
    const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const lines = src.split('\n');
    let html = '';
    let inList = false;
    let inBq = false;

    const flushList = () => { if (inList) { html += '</ul>'; inList = false; } };
    const flushBq = () => { if (inBq) { html += '</blockquote>'; inBq = false; } };

    for (const raw of lines) {
      const line = raw.trimEnd();
      if (/^##\s+/.test(line)) {
        flushList(); flushBq();
        html += `<h2>${applyInline(esc(line.replace(/^##\s+/, '')))}</h2>`;
      } else if (/^###\s+/.test(line)) {
        flushList(); flushBq();
        html += `<h3>${applyInline(esc(line.replace(/^###\s+/, '')))}</h3>`;
      } else if (/^>\s?/.test(line)) {
        flushList();
        if (!inBq) { html += '<blockquote>'; inBq = true; }
        html += `<p>${applyInline(esc(line.replace(/^>\s?/, '')))}</p>`;
      } else if (/^[-*]\s+/.test(line)) {
        flushBq();
        if (!inList) { html += '<ul>'; inList = true; }
        html += `<li>${applyInline(esc(line.replace(/^[-*]\s+/, '')))}</li>`;
      } else if (line.trim() === '') {
        flushList(); flushBq();
      } else {
        flushList(); flushBq();
        html += `<p>${applyInline(esc(line))}</p>`;
      }
    }
    flushList(); flushBq();
    return html;
  }

  function applyInline(s) {
    return s
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // ------- 샘플 계약서 (테스트용) -------
  const SAMPLE_CONTRACT = `근로계약서

주식회사 ○○(이하 "회사")와 홍길동(이하 "근로자")은 다음과 같이 근로계약을 체결한다.

제1조 (근무장소 및 담당업무)
1. 근무장소: 회사가 지정하는 장소
2. 담당업무: 회사가 지시하는 모든 업무
3. 회사는 사업상 필요에 따라 근로자의 근무장소 및 담당업무를 변경할 수 있으며, 근로자는 이에 이의를 제기하지 않는다.

제2조 (근로시간)
1. 소정 근로시간은 09:00부터 18:00까지로 한다.
2. 회사의 업무상 필요에 따라 근로자는 연장근로, 야간근로, 휴일근로에 동의하며, 별도의 수당은 월 급여에 포함된 것으로 본다.

제3조 (임금)
1. 월 급여는 금 이백오십만원(2,500,000원)으로 한다.
2. 임금은 매월 말일에 지급한다.
3. 각종 수당 및 상여금은 회사의 재량으로 지급하며, 근로자는 이에 대한 청구권이 없다.

제4조 (휴가)
1. 연차유급휴가는 근로기준법에 따른다.
2. 근로자가 연차를 사용하지 않은 경우 미사용 연차수당은 지급하지 아니한다.

제5조 (비밀유지 및 경업금지)
1. 근로자는 재직 중 알게 된 회사의 모든 정보를 퇴직 후에도 외부에 유출하지 아니한다.
2. 근로자는 퇴직 후 5년간 동종업계에 취업하거나 창업할 수 없다.
3. 제1항, 제2항 위반 시 근로자는 회사에 1억원의 손해배상금을 지급한다.

제6조 (계약해지)
1. 회사는 필요에 따라 언제든 근로자를 해고할 수 있다.
2. 근로자가 퇴직하고자 할 때에는 90일 전에 서면으로 통보해야 하며, 이를 위반 시 한 달치 급여를 위약금으로 지급한다.

제7조 (기타)
본 계약서에 명시되지 않은 사항은 회사 취업규칙에 따르며, 취업규칙과 본 계약이 상충할 경우 회사에 유리한 조항이 우선한다.

2026년 4월 18일

회사: 주식회사 ○○  (인)
근로자: 홍길동 (서명)`;

})();
