import { clone, validateDoc, synchronizeAttendance, STORES } from './furikko-pair-core.js?v=20260920';

// Public browser configuration, identical to the existing furikko page. No endpoint override.
const ENDPOINT = 'https://kngkckweonnnhfocfqan.supabase.co/rest/v1/rpc/';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtuZ2tja3dlb25ubmhmb2NmcWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5OTQwODUsImV4cCI6MjA5NzU3MDA4NX0.lUeIniKLSh3wxjTL0JGB0PAamSv3X8JEidZtvKhO8-E';
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const CONFLICT = '他の端末で更新されました。確認してもう一度操作してください';
export function createApi({ fetchImpl = globalThis.fetch, timeout = 8000 } = {}) {
  const controllers = new Set();
  return {
    cancel() { for (const c of controllers) c.abort(); controllers.clear(); },
    async call(name, args) {
      if (!['create_furikko_pair', 'get_furikko_pair', 'put_furikko_pair', 'heartbeat_furikko_pair'].includes(name)) throw new Error('Unknown RPC');
      const c = new AbortController(); controllers.add(c);
      const timer = setTimeout(() => c.abort(), timeout);
      try {
        const body = JSON.stringify(args);
        if (new TextEncoder().encode(body).length > 65536) throw new ApiError(400, '入力が長すぎます。');
        const response = await fetchImpl(ENDPOINT + name, { method: 'POST', headers: {
          apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json'
        }, body, signal: c.signal, cache: 'no-store', referrerPolicy: 'no-referrer' });
        if (!response.ok) throw new ApiError(response.status, response.status === 409 ? CONFLICT : '通信内容を確認できませんでした。');
        if (response.status === 204) return null;
        try { return await response.json(); } catch { throw new ApiError(502, '応答を読み取れませんでした。'); }
      } catch (e) {
        if (e instanceof ApiError) throw e;
        throw new ApiError(0, '通信できません。接続を確認して再確認してください。');
      } finally { clearTimeout(timer); controllers.delete(c); }
    }
  };
}
function validRow(row) {
  if (!row || !Object.hasOwn(STORES, row.store_id) || !Number.isSafeInteger(row.revision) || row.revision < 0 ||
      !Number.isFinite(Date.parse(row.updated_at)) || !Number.isFinite(Date.parse(row.seen_at))) throw new ApiError(502, '店舗の応答を確認できませんでした。');
  validateDoc(row.data);
  return clone(row);
}
export class PairSession {
  constructor(identity, api, onChange = () => {}) {
    this.identity = Object.freeze({ ...identity }); this.api = api; this.onChange = onChange;
    this.rows = {}; this.connected = false; this.status = '接続確認中'; this.message = '';
    this.pending = 0; this.generation = 0; this.epoch = 0; this.tail = Promise.resolve(); this.disposed = false;
    this.refreshing = null; this.lastFetched = 0;
  }
  notify() { if (!this.disposed) this.onChange(this); }
  dispose() { this.disposed = true; this.generation++; this.epoch++; this.connected = false; this.api.cancel(); }
  async refresh() {
    if (this.disposed || this.pending) return false;
    if (this.refreshing) return this.refreshing;
    const generation = this.generation;
    this.refreshing = (async () => {
      try {
        const data = await this.api.call('get_furikko_pair', { p_room: this.identity.room });
        if (this.disposed || generation !== this.generation) return false;
        if (!Array.isArray(data) || data.length > 2) throw new ApiError(502, '店舗の応答を確認できませんでした。');
        const rows = {};
        for (const item of data) {
          const row = validRow(item);
          if (rows[row.store_id]) throw new ApiError(502, '店舗の応答を確認できませんでした。');
          rows[row.store_id] = row;
        }
        if (!rows[this.identity.side]) throw new ApiError(502, '自店舗の共有を確認できませんでした。');
        this.rows = rows; this.connected = true; this.lastFetched = Date.now();
        if (this.status !== '保存できません') { this.status = '共有中'; this.message = ''; }
        this.notify(); return true;
      } catch (e) {
        if (this.disposed || generation !== this.generation) return false;
        this.connected = false; this.epoch++; this.status = '通信できません';
        this.message = e.status === 403 ? 'リンクを確認できません。作成した方に店舗用リンクを確認してください。' : e.message;
        this.notify(); return false;
      } finally { this.refreshing = null; }
    })();
    return this.refreshing;
  }
  mutate(operation, { expectedRevision } = {}) {
    const identity = this.identity, generation = this.generation, epoch = this.epoch;
    if (!this.connected || this.disposed) return Promise.reject(new ApiError(0, '接続を再確認してから操作してください。'));
    this.pending++; this.notify();
    const work = this.tail.then(async () => {
      // A poll that began before this tap must finish before reading the revision.
      if (this.refreshing) await this.refreshing;
      if (this.disposed || generation !== this.generation || epoch !== this.epoch || !this.connected) {
        throw new ApiError(0, '操作を取り消しました。内容を確認してもう一度操作してください。');
      }
      try {
        const row = this.rows[identity.side];
        if (expectedRevision !== undefined && expectedRevision !== row.revision) throw new ApiError(409, CONFLICT);
        const doc = synchronizeAttendance(operation(synchronizeAttendance(row.data)));
        const data = await this.api.call('put_furikko_pair', { p_room: identity.room, p_store: identity.side,
          p_write_key: identity.key, p_expected_revision: row.revision, p_data: doc });
        if (this.disposed || generation !== this.generation) throw new ApiError(0, '操作を取り消しました。');
        const saved = validRow(Array.isArray(data) ? data[0] : data);
        // PostgreSQL jsonb key ordering differs from the submitted JS object.
        if (saved.store_id !== identity.side || saved.revision !== row.revision + 1 || !sameDoc(saved.data, doc)) {
          throw new ApiError(502, '保存結果を確認できませんでした。');
        }
        this.rows = { ...this.rows, [identity.side]: saved }; this.status = '共有中'; this.message = ''; return saved;
      } catch (e) {
        if (!this.disposed && generation === this.generation) {
          this.epoch++; this.connected = false; this.status = '保存できません'; this.message = e.message;
          this.conflict = e.status === 409;
        }
        throw e;
      }
    });
    this.tail = work.catch(() => {}).finally(async () => {
      this.pending--; this.notify();
      if (!this.pending && this.conflict && !this.disposed) { this.conflict = false; await this.refresh(); }
    });
    return work;
  }
  async heartbeat() {
    if (this.disposed || !this.connected) return false;
    const generation = this.generation;
    try {
      const data = await this.api.call('heartbeat_furikko_pair', { p_room: this.identity.room,
        p_store: this.identity.side, p_write_key: this.identity.key });
      if (this.disposed || generation !== this.generation) return false;
      const at = Array.isArray(data) ? data[0]?.seen_at : data?.seen_at;
      if (!Number.isFinite(Date.parse(at))) throw new ApiError(502, '接続を確認できませんでした。');
      const row = this.rows[this.identity.side];
      if (row) this.rows = { ...this.rows, [this.identity.side]: { ...row, seen_at: at } };
      this.notify(); return true;
    } catch (e) {
      if (!this.disposed && generation === this.generation) {
        this.connected = false; this.epoch++; this.status = '通信できません'; this.message = e.message; this.notify();
      }
      return false;
    }
  }
}
function sameDoc(a, b) {
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ?
    Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
