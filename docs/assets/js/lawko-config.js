// 모두의법률 - 웹 공통 설정
// GitHub Pages 정적 사이트이므로 anon key만 사용 (공개 가능).
window.LAWKO_CONFIG = {
  // Supabase — 앱과 동일한 프로젝트를 써야 계정/결제가 공유됨
  supabaseUrl: 'https://auutrcgmiurdcooufxpy.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1dXRyY2dtaXVyZGNvb3VmeHB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0OTk4NzQsImV4cCI6MjA5MjA3NTg3NH0.hLspGPhlphcAtncXU2rlSM3Y6SEQqu3DGdY3ts5KihQ',

  // 엔타이틀먼트 테이블 (RevenueCat 웹훅이 업서트)
  // 구조: id uuid, user_id uuid (auth.users), entitlement text, active boolean, expires_at timestamptz
  entitlementsTable: 'user_entitlements',
  proEntitlement: 'pro',

  // 가격 (모두의경매 광고제거 벤치마크)
  priceMonthly: '5,500원',
  priceYearly: '29,000원',

  // 앱 다운로드 링크 (스토어 심사 통과 후 교체)
  iosAppUrl: 'https://apps.apple.com/kr/app/id0000000000',
  androidAppUrl: 'https://play.google.com/store/apps/details?id=kr.lawko.lawko_app',

  // 문의
  supportEmail: 'support@lawko.kr',
};
