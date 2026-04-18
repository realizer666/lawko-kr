// 모두의법률 - 웹 공통 Auth + 광고 게이트
// 모든 페이지에 주입되어:
//   1. Supabase 세션 복원
//   2. 네비게이션에 로그인/계정 버튼 삽입
//   3. Pro 엔타이틀먼트 있으면 AdSense 숨김 + 광고 로드 차단
//   4. 로그인/회원가입 모달 제공
(function () {
  'use strict';

  const cfg = window.LAWKO_CONFIG || {};
  const hasSupabase = !!(cfg.supabaseUrl && !cfg.supabaseUrl.includes('YOUR-PROJECT'));

  let supabase = null;
  let currentUser = null;
  let isPro = false;

  // 빠른 광고 차단을 위해 이전 세션의 Pro 여부를 캐시.
  // (서버 재확인 후 틀리면 광고가 다시 나타날 뿐이라 보안상 문제 없음)
  const PRO_CACHE_KEY = 'lawko_pro_cache_v1';
  try {
    const cached = JSON.parse(localStorage.getItem(PRO_CACHE_KEY) || '{}');
    if (cached.isPro && cached.expiresAt && new Date(cached.expiresAt) > new Date()) {
      isPro = true;
    }
  } catch (_) { /* noop */ }

  // ------- Supabase 초기화 -------
  function ensureSupabase() {
    if (supabase || !hasSupabase) return supabase;
    if (!window.supabase) {
      console.warn('[lawko-auth] supabase-js가 로드되지 않았습니다.');
      return null;
    }
    supabase = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    return supabase;
  }

  async function refreshState() {
    const s = ensureSupabase();
    if (!s) return { user: null, isPro: false };
    const { data: { user } } = await s.auth.getUser();
    currentUser = user;
    if (user) {
      const { data, error } = await s
        .from(cfg.entitlementsTable || 'user_entitlements')
        .select('active, expires_at')
        .eq('user_id', user.id)
        .eq('entitlement', cfg.proEntitlement || 'pro')
        .maybeSingle();
      if (error) {
        console.warn('[lawko-auth] entitlement 조회 실패:', error.message);
        isPro = false;
      } else if (data) {
        const notExpired = !data.expires_at || new Date(data.expires_at) > new Date();
        isPro = !!data.active && notExpired;
      } else {
        isPro = false;
      }
    } else {
      isPro = false;
    }
    // 캐시 업데이트
    try {
      if (isPro) {
        const exp = new Date();
        exp.setHours(exp.getHours() + 6); // 6시간 신뢰
        localStorage.setItem(PRO_CACHE_KEY, JSON.stringify({ isPro: true, expiresAt: exp.toISOString() }));
      } else {
        localStorage.removeItem(PRO_CACHE_KEY);
      }
    } catch (_) { /* noop */ }
    updateNavUI();
    applyAdGate();
    return { user: currentUser, isPro };
  }

  // ------- 광고 게이트 -------
  // Pro 사용자는 광고 제거. AdSense auto ads는 JS로 완전히 끊지 못하므로
  // (1) adsbygoogle 로드 전에 플래그로 차단하고
  // (2) 이미 렌더된 광고 슬롯은 숨김 처리.
  function applyAdGate() {
    if (!isPro) return;
    // 이미 삽입된 AdSense 스크립트/광고 제거
    document.querySelectorAll('script[src*="adsbygoogle"]').forEach((s) => s.remove());
    document.querySelectorAll('ins.adsbygoogle, .lawko-ad-slot').forEach((el) => {
      el.style.display = 'none';
    });
    // 광고 영역 자리에 "Pro 이용중" 알림
    document.querySelectorAll('.lawko-ad-slot').forEach((el) => {
      el.insertAdjacentHTML(
        'afterend',
        '<div class="lawko-pro-badge">광고제거 이용 중</div>'
      );
    });
  }

  // AdSense 로드 전에 호출하면 자동광고를 비활성화할 수 있음
  window.__lawkoPreventAds = function () {
    // adsbygoogle.pauseAdRequests로는 초기화 후에만 작동 → 스크립트 자체를 막는 것이 확실
    // main 스크립트에서 "if(!window.__lawkoNoAds) loadAdSense();" 식으로 체크하도록 안내
    window.__lawkoNoAds = true;
  };

  // ------- 네비게이션 UI 주입 -------
  function updateNavUI() {
    const nav = document.querySelector('.top-nav .nav-links, .top-nav .container');
    if (!nav) return;

    let slot = document.getElementById('lawko-auth-slot');
    if (!slot) {
      slot = document.createElement('div');
      slot.id = 'lawko-auth-slot';
      slot.style.cssText = 'display:flex;align-items:center;gap:12px;margin-left:16px;';
      // nav-links 옆에 붙이거나 container 끝에 추가
      const navLinks = document.querySelector('.top-nav .nav-links');
      if (navLinks) {
        navLinks.appendChild(slot);
      } else {
        nav.appendChild(slot);
      }
    }

    if (currentUser) {
      slot.innerHTML = `
        <span style="font-size:13px;color:#94A3B8;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${escapeHtml(currentUser.email || '')}
        </span>
        ${isPro ? '<span style="font-size:11px;background:#2563EB;color:#fff;padding:3px 8px;border-radius:4px;">Pro</span>' : ''}
        <button type="button" data-lawko="subscribe" style="font-size:13px;background:#2563EB;color:#fff;border:0;padding:6px 12px;border-radius:6px;cursor:pointer;${isPro ? 'display:none;' : ''}">광고제거</button>
        <button type="button" data-lawko="logout" style="font-size:13px;background:transparent;color:#94A3B8;border:1px solid #334155;padding:5px 10px;border-radius:6px;cursor:pointer;">로그아웃</button>
      `;
    } else {
      slot.innerHTML = `
        <button type="button" data-lawko="login" style="font-size:13px;background:transparent;color:#F8FAFC;border:1px solid #334155;padding:6px 12px;border-radius:6px;cursor:pointer;">로그인</button>
        <button type="button" data-lawko="signup" style="font-size:13px;background:#2563EB;color:#fff;border:0;padding:6px 12px;border-radius:6px;cursor:pointer;">회원가입</button>
      `;
    }

    slot.querySelectorAll('[data-lawko]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const action = e.currentTarget.dataset.lawko;
        if (action === 'login') openAuthModal('login');
        else if (action === 'signup') openAuthModal('signup');
        else if (action === 'logout') doSignOut();
        else if (action === 'subscribe') openSubscribeModal();
      });
    });
  }

  // ------- 인증 동작 -------
  async function doSignIn(email, password) {
    const s = ensureSupabase();
    if (!s) throw new Error('서버 설정이 완료되지 않았습니다.');
    const { data, error } = await s.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await refreshState();
    return data;
  }

  async function doSignUp(email, password) {
    const s = ensureSupabase();
    if (!s) throw new Error('서버 설정이 완료되지 않았습니다.');
    const { data, error } = await s.auth.signUp({ email, password });
    if (error) throw error;
    await refreshState();
    return data;
  }

  async function doSignOut() {
    const s = ensureSupabase();
    if (!s) return;
    await s.auth.signOut();
    await refreshState();
  }

  async function doResetPassword(email) {
    const s = ensureSupabase();
    if (!s) throw new Error('서버 설정이 완료되지 않았습니다.');
    const { error } = await s.auth.resetPasswordForEmail(email);
    if (error) throw error;
  }

  // ------- 모달 -------
  function openAuthModal(mode) {
    const isLogin = mode === 'login';
    const existing = document.getElementById('lawko-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'lawko-modal';
    overlay.innerHTML = `
      <div class="lawko-modal-backdrop"></div>
      <div class="lawko-modal-box">
        <button type="button" class="lawko-modal-close" aria-label="닫기">✕</button>
        <h2 class="lawko-modal-title">${isLogin ? '로그인' : '회원가입'}</h2>
        <p class="lawko-modal-sub">광고제거는 로그인한 계정에 적용됩니다.</p>
        <form class="lawko-modal-form">
          <label>이메일<input type="email" name="email" required autocomplete="email"></label>
          <label>비밀번호<input type="password" name="password" required minlength="6" autocomplete="${isLogin ? 'current-password' : 'new-password'}"></label>
          ${!isLogin ? `
            <label class="lawko-check">
              <input type="checkbox" name="agree" required>
              <span>
                <a href="/terms.html" target="_blank">이용약관</a> 및
                <a href="/privacy.html" target="_blank">개인정보처리방침</a>에 동의합니다.
              </span>
            </label>
          ` : ''}
          <div class="lawko-modal-error" role="alert"></div>
          <button type="submit" class="lawko-modal-primary">${isLogin ? '로그인' : '가입하기'}</button>
          ${isLogin ? `
            <button type="button" class="lawko-modal-link" data-lawko="reset">비밀번호를 잊으셨나요?</button>
            <p class="lawko-modal-swap">계정이 없으신가요?
              <a href="#" data-lawko="switch-signup">회원가입</a>
            </p>
          ` : `
            <p class="lawko-modal-swap">이미 계정이 있으신가요?
              <a href="#" data-lawko="switch-login">로그인</a>
            </p>
          `}
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    injectModalStyles();

    const close = () => overlay.remove();
    overlay.querySelector('.lawko-modal-close').addEventListener('click', close);
    overlay.querySelector('.lawko-modal-backdrop').addEventListener('click', close);

    const form = overlay.querySelector('form');
    const errBox = overlay.querySelector('.lawko-modal-error');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.textContent = '';
      const fd = new FormData(form);
      try {
        if (isLogin) {
          await doSignIn(fd.get('email'), fd.get('password'));
        } else {
          await doSignUp(fd.get('email'), fd.get('password'));
          errBox.style.color = '#22C55E';
          errBox.textContent = '가입이 완료되었습니다. 인증 메일을 확인해주세요.';
          setTimeout(close, 1500);
          return;
        }
        close();
      } catch (err) {
        errBox.style.color = '#EF4444';
        errBox.textContent = err.message || '오류가 발생했습니다.';
      }
    });

    const resetBtn = overlay.querySelector('[data-lawko="reset"]');
    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        const email = form.email.value.trim();
        if (!email) {
          errBox.textContent = '이메일을 먼저 입력해주세요.';
          return;
        }
        try {
          await doResetPassword(email);
          errBox.style.color = '#22C55E';
          errBox.textContent = '비밀번호 재설정 메일을 보냈습니다.';
        } catch (err) {
          errBox.style.color = '#EF4444';
          errBox.textContent = err.message;
        }
      });
    }
    overlay.querySelectorAll('[data-lawko^="switch-"]').forEach((a) => {
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        close();
        openAuthModal(a.dataset.lawko === 'switch-signup' ? 'signup' : 'login');
      });
    });
  }

  function openSubscribeModal() {
    const existing = document.getElementById('lawko-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'lawko-modal';
    overlay.innerHTML = `
      <div class="lawko-modal-backdrop"></div>
      <div class="lawko-modal-box">
        <button type="button" class="lawko-modal-close" aria-label="닫기">✕</button>
        <h2 class="lawko-modal-title">광고제거 구독</h2>
        <ul class="lawko-modal-features">
          <li>배너 · 전면광고 완전 제거</li>
          <li>계정 기반 — 모바일 앱과 웹 모두 적용</li>
          <li>다른 기기에서 로그인해도 그대로 유지</li>
        </ul>
        <div class="lawko-modal-price-row">
          <div class="lawko-modal-price"><span class="lbl">월간</span><span class="val">${cfg.priceMonthly}</span></div>
          <div class="lawko-modal-price hilite"><span class="lbl">연간 (추천)</span><span class="val">${cfg.priceYearly}</span></div>
        </div>
        <div class="lawko-modal-warn">⚠️ 한번 결제 시 환불이 불가합니다. 자동 갱신 해지는 스토어/계정 설정에서 언제든 가능합니다.</div>
        <p class="lawko-modal-info" style="margin-top:12px;">
          현재 결제는 <strong>모바일 앱</strong>에서 가능합니다. 앱을 설치하고 동일한 이메일로 로그인하시면 웹에서도 광고가 자동으로 제거됩니다.
        </p>
        <div class="lawko-modal-btn-row">
          <a href="${cfg.iosAppUrl}" target="_blank" class="lawko-modal-primary">App Store</a>
          <a href="${cfg.androidAppUrl}" target="_blank" class="lawko-modal-primary alt">Google Play</a>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    injectModalStyles();
    const close = () => overlay.remove();
    overlay.querySelector('.lawko-modal-close').addEventListener('click', close);
    overlay.querySelector('.lawko-modal-backdrop').addEventListener('click', close);
  }

  function injectModalStyles() {
    if (document.getElementById('lawko-modal-styles')) return;
    const s = document.createElement('style');
    s.id = 'lawko-modal-styles';
    s.textContent = `
      #lawko-modal { position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center; }
      #lawko-modal .lawko-modal-backdrop { position:absolute;inset:0;background:rgba(15,23,42,.75);backdrop-filter:blur(4px); }
      #lawko-modal .lawko-modal-box { position:relative;background:#131c33;color:#F8FAFC;padding:28px;border-radius:14px;min-width:320px;max-width:92vw;width:420px;box-shadow:0 20px 60px rgba(0,0,0,.5);border:1px solid #1E293B; }
      #lawko-modal .lawko-modal-close { position:absolute;top:12px;right:12px;background:transparent;border:0;color:#94A3B8;font-size:18px;cursor:pointer; }
      #lawko-modal .lawko-modal-title { font-size:22px;font-weight:700;margin-bottom:6px; }
      #lawko-modal .lawko-modal-sub { color:#94A3B8;font-size:13px;margin-bottom:18px; }
      #lawko-modal form label { display:block;margin-bottom:12px;font-size:13px;color:#CBD5E1; }
      #lawko-modal form input[type=email], #lawko-modal form input[type=password] { width:100%;margin-top:4px;background:#0F172A;border:1px solid #334155;border-radius:8px;padding:10px 12px;color:#F8FAFC;font-size:14px; }
      #lawko-modal form input:focus { outline:2px solid #2563EB;border-color:#2563EB; }
      #lawko-modal .lawko-check { display:flex;gap:8px;align-items:flex-start;font-size:12px;color:#94A3B8; }
      #lawko-modal .lawko-check input { margin-top:2px; }
      #lawko-modal .lawko-check a { color:#3B82F6;text-decoration:underline; }
      #lawko-modal .lawko-modal-error { font-size:12px;min-height:16px;margin:8px 0; }
      #lawko-modal .lawko-modal-primary { display:inline-block;text-align:center;width:100%;background:#2563EB;color:#fff;border:0;padding:12px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;margin-top:8px;text-decoration:none; }
      #lawko-modal .lawko-modal-primary.alt { background:#334155; }
      #lawko-modal .lawko-modal-link { background:transparent;border:0;color:#94A3B8;font-size:12px;margin-top:8px;cursor:pointer;text-decoration:underline; }
      #lawko-modal .lawko-modal-swap { font-size:12px;color:#94A3B8;margin-top:14px;text-align:center; }
      #lawko-modal .lawko-modal-swap a { color:#3B82F6;text-decoration:underline; }
      #lawko-modal .lawko-modal-features { list-style:none;padding:0;margin:0 0 16px;font-size:13px;color:#CBD5E1; }
      #lawko-modal .lawko-modal-features li { padding:4px 0;padding-left:20px;position:relative; }
      #lawko-modal .lawko-modal-features li::before { content:'✓';position:absolute;left:0;color:#22C55E;font-weight:700; }
      #lawko-modal .lawko-modal-price-row { display:flex;gap:10px;margin:16px 0; }
      #lawko-modal .lawko-modal-price { flex:1;background:#0F172A;border:1px solid #334155;border-radius:10px;padding:12px;text-align:center; }
      #lawko-modal .lawko-modal-price.hilite { border-color:#2563EB;background:rgba(37,99,235,0.08); }
      #lawko-modal .lawko-modal-price .lbl { display:block;font-size:11px;color:#94A3B8;margin-bottom:4px; }
      #lawko-modal .lawko-modal-price .val { font-size:16px;font-weight:700;color:#F8FAFC; }
      #lawko-modal .lawko-modal-warn { background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.4);color:#EF4444;padding:10px 12px;border-radius:8px;font-size:12px;font-weight:600; }
      #lawko-modal .lawko-modal-info { font-size:13px;color:#CBD5E1;line-height:1.6; }
      #lawko-modal .lawko-modal-btn-row { display:flex;gap:10px;margin-top:14px; }
      .lawko-pro-badge { display:inline-block;background:#0F172A;color:#22C55E;font-size:11px;padding:4px 10px;border-radius:4px;border:1px solid #22C55E; }
    `;
    document.head.appendChild(s);
  }

  // ------- 유틸 -------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // ------- 공개 API -------
  window.LawkoAuth = {
    refreshState,
    openLogin: () => openAuthModal('login'),
    openSignup: () => openAuthModal('signup'),
    openSubscribe: openSubscribeModal,
    signOut: doSignOut,
    getUser: () => currentUser,
    isPro: () => isPro,
  };

  // DOM 준비 후 초기 세션 복원
  const start = () => {
    refreshState().catch((e) => console.warn('[lawko-auth] init:', e));
    // 세션 변경 구독
    const s = ensureSupabase();
    if (s) {
      s.auth.onAuthStateChange(() => refreshState());
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
