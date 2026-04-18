// 페이지 초기 렌더링 단계에서 Pro 캐시가 있으면 adsbygoogle 로드를 차단.
// <head> 최상단에서 동기 실행되도록 <script> 태그로 삽입되어야 함.
(function () {
  try {
    const cached = JSON.parse(localStorage.getItem('lawko_pro_cache_v1') || '{}');
    if (cached.isPro && cached.expiresAt && new Date(cached.expiresAt) > new Date()) {
      window.__lawkoNoAds = true;
      // 이후 로드되는 adsbygoogle 스크립트를 MutationObserver로 제거
      const stop = new MutationObserver((muts) => {
        for (const m of muts) {
          for (const node of m.addedNodes) {
            if (node.tagName === 'SCRIPT' && node.src && node.src.indexOf('adsbygoogle') !== -1) {
              node.parentNode && node.parentNode.removeChild(node);
            }
            if (node.tagName === 'INS' && node.classList && node.classList.contains('adsbygoogle')) {
              node.style.display = 'none';
            }
          }
        }
      });
      stop.observe(document.documentElement, { childList: true, subtree: true });
      document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('ins.adsbygoogle, .lawko-ad-slot').forEach((el) => (el.style.display = 'none'));
        setTimeout(() => stop.disconnect(), 3000);
      });
    }
  } catch (_) { /* noop */ }
})();
