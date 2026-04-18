# lawko.kr (웹사이트)

GitHub Pages로 호스팅되는 정적 법령 검색 사이트. `docs/` 폴더가 배포 루트.

**벤치마크**: 모두의경매 / **모바일 앱 레포**: `projects/lawko_app`

## 로그인 · 광고제거 · 앱 연동

웹과 모바일 앱이 **같은 Supabase 프로젝트**를 공유하므로 하나의 계정으로 양쪽 모두 이용 가능하다.

- `docs/assets/js/lawko-config.js` — Supabase URL / anon key (앱의 `constants.dart`와 동일 값)
- `docs/assets/js/lawko-auth.js` — 로그인/회원가입 모달, 세션 관리, 네비 UI 주입, 광고 게이트
- `docs/assets/js/lawko-early-gate.js` — `<head>` 최상단에서 Pro 캐시 확인 → AdSense 로드 차단
- 모든 페이지(`index, browse, law, precedent, about, terms, privacy`)에 주입 완료

**광고 로직**
- 비로그인 / 미결제 → AdSense 노출
- 로그인 + `user_entitlements.active=true` → 즉시 광고 제거

**결제는 현재 모바일 앱에서만** (RevenueCat 사용). 웹에서 구독 모달을 열면 App Store / Google Play 링크로 유도. 동일 이메일로 앱 로그인 후 결제하면 RevenueCat 웹훅이 Supabase에 반영 → 웹에서도 즉시 광고 제거.

상세 연동 가이드: `projects/lawko_app/docs/SUPABASE_ENTITLEMENTS.md`

## 배포 다음 작업

1. Supabase 프로젝트 생성 후 `docs/assets/js/lawko-config.js`에 URL/anon key 입력
2. `user_entitlements` 테이블 + RevenueCat 웹훅 (`SUPABASE_ENTITLEMENTS.md` 참고)
3. `docs/privacy.html`, `docs/terms.html` 개정
   - 회원가입 시 이메일 수집 명시
   - "한번 결제 시 환불 불가" 조항 추가
4. `docs/assets/js/lawko-config.js`에 실제 App Store / Google Play URL 입력 (심사 통과 후)
