// 모두의법률 - 북마크 공통 모듈
// 사용:
//   await LawkoBookmarks.isBookmarked('law', path);
//   await LawkoBookmarks.toggle('law', path, title, payload);
//   await LawkoBookmarks.list(['law']);
(function () {
  'use strict';

  const cfg = window.LAWKO_CONFIG || {};
  let supabase = null;
  const localCache = {}; // { 'law:/path': true, ... }  — UX용 빠른 체크

  function getClient() {
    if (supabase) return supabase;
    if (!window.supabase) return null;
    supabase = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    return supabase;
  }

  function cacheKey(type, id) {
    return `${type}:${id}`;
  }

  async function isBookmarked(type, id) {
    const k = cacheKey(type, id);
    if (k in localCache) return localCache[k];
    const s = getClient();
    if (!s) return false;
    const { data: { user } } = await s.auth.getUser();
    if (!user) return false;
    const { data, error } = await s
      .from('user_bookmarks')
      .select('id')
      .eq('user_id', user.id)
      .eq('target_type', type)
      .eq('target_id', id)
      .maybeSingle();
    if (error) return false;
    const exists = !!data;
    localCache[k] = exists;
    return exists;
  }

  async function add(type, id, title, payload) {
    const s = getClient();
    if (!s) throw new Error('Supabase 초기화 실패');
    const { data: { user } } = await s.auth.getUser();
    if (!user) throw new Error('LOGIN_REQUIRED');

    // 법령의 경우 payload에서 version 정보 추출
    let lastSeenVersion = null;
    if (type === 'law' && payload) {
      lastSeenVersion = payload['시행일자'] || payload['공포번호'] || null;
    }

    const { error } = await s.from('user_bookmarks').upsert(
      {
        user_id: user.id,
        target_type: type,
        target_id: id,
        title: String(title || '').slice(0, 500),
        payload: payload || null,
        last_seen_version: lastSeenVersion,
      },
      { onConflict: 'user_id,target_type,target_id' },
    );
    if (error) throw error;
    localCache[cacheKey(type, id)] = true;
  }

  async function remove(type, id) {
    const s = getClient();
    if (!s) throw new Error('Supabase 초기화 실패');
    const { data: { user } } = await s.auth.getUser();
    if (!user) throw new Error('LOGIN_REQUIRED');
    const { error } = await s
      .from('user_bookmarks')
      .delete()
      .eq('user_id', user.id)
      .eq('target_type', type)
      .eq('target_id', id);
    if (error) throw error;
    localCache[cacheKey(type, id)] = false;
  }

  async function toggle(type, id, title, payload) {
    const exists = await isBookmarked(type, id);
    if (exists) {
      await remove(type, id);
      return false;
    } else {
      await add(type, id, title, payload);
      return true;
    }
  }

  async function list(types) {
    const s = getClient();
    if (!s) return [];
    const { data: { user } } = await s.auth.getUser();
    if (!user) return [];
    let q = s
      .from('user_bookmarks')
      .select('id, target_type, target_id, title, payload, notify_on_change, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (Array.isArray(types) && types.length) {
      q = q.in('target_type', types);
    }
    const { data, error } = await q;
    if (error) return [];
    // 캐시 업데이트
    (data || []).forEach(b => { localCache[cacheKey(b.target_type, b.target_id)] = true; });
    return data || [];
  }

  async function setNotify(id, notify) {
    const s = getClient();
    if (!s) return;
    const { data: { user } } = await s.auth.getUser();
    if (!user) return;
    await s
      .from('user_bookmarks')
      .update({ notify_on_change: !!notify })
      .eq('user_id', user.id)
      .eq('id', id);
  }

  window.LawkoBookmarks = { isBookmarked, add, remove, toggle, list, setNotify };
})();
