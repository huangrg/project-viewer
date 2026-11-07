(function () {
  'use strict';

  const STORE_KEY = 'projectViewer.v2';
  const LEGACY_STORE_KEY = 'projectViewer.v1';
  const THEME_KEY = 'projectViewer.theme';
  const BACKUP_KEY = 'projectViewer.backup';
  const SCHEMA_VERSION = 2;
  const MAX_AMOUNT = 999999999;
  const CHANNELS = ['转介绍', '线上', '线下', '老客户', '其他'];
  const STATUS = {
    pending: { label: '待签约', cls: 'badge-pending' },
    signed: { label: '已签约', cls: 'badge-signed' },
    rejected: { label: '不签约', cls: 'badge-rejected' }
  };

  const ICONS = {
    back:
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"></path></svg>',
    sun:
      '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"></circle><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"></path></svg>',
    moon:
      '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a7 7 0 0 0 10.7 10.7z"></path></svg>',
    auto:
      '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"></circle><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" stroke="none"></path></svg>',
    clipboard:
      '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1z"></path><path d="M8 5H6.5A1.5 1.5 0 0 0 5 6.5v13A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 17.5 5H16"></path><path d="M8.5 11h7M8.5 15h4.5"></path></svg>'
  };

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const state = {
    view: 'pending',
    searchPending: '',
    searchAll: '',
    statusFilter: 'all',
    statsMonth: currentMonth(),
    detailId: null,
    editingNoteId: null,
    formOpen: false,
    chart: null,
    yearExpandedYear: null
  };

  let data = loadData();

  /* ---------- 基础工具 ---------- */

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(16).slice(2, 10);
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function truncate(text, max) {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    return s.length > max ? s.slice(0, max) + '…' : s;
  }

  const moneyFmt = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function money(value) {
    const n = Number(value);
    return '¥' + moneyFmt.format(isFinite(n) ? n : 0);
  }

  function rateText(rate) {
    const n = Number(rate);
    return (isFinite(n) ? n : 0).toFixed(2) + '%';
  }

  function commissionOf(amount, rate) {
    if (amount == null || rate == null) return 0;
    const amountCents = Math.round(Number(amount) * 100);
    const rateBp = Math.round(Number(rate) * 100);
    if (!isFinite(amountCents) || !isFinite(rateBp)) return 0;
    return Math.round((amountCents * rateBp) / 10000) / 100;
  }

  function commission(p) {
    return commissionOf(p.amount, p.commissionRate);
  }

  const moneyCompactFmt = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });

  function roundMoney(value) {
    const n = Number(value);
    return isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }

  function moneyCompact(value) {
    return '¥' + moneyCompactFmt.format(roundMoney(value));
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function ymd(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  function todayISO() {
    return ymd(new Date());
  }

  function currentMonth() {
    return todayISO().slice(0, 7);
  }

  function parseDate(iso) {
    const parts = String(iso).split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function daysDiff(fromISO, toISO) {
    if (!fromISO || !toISO) return 0;
    return Math.round((startOfDay(parseDate(toISO)) - startOfDay(parseDate(fromISO))) / 86400000);
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const s = String(iso);
    if (s.length === 10) return s;
    const d = new Date(s);
    if (isNaN(d.getTime())) return s.slice(0, 10);
    return ymd(d);
  }

  function fmtDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso).slice(0, 16).replace('T', ' ');
    return (
      d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes())
    );
  }

  function addMonths(ym, delta) {
    const parts = ym.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1 + delta, 1);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
  }

  function stamp() {
    const d = new Date();
    return (
      d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' + pad2(d.getHours()) + pad2(d.getMinutes())
    );
  }

  /* ---------- 数据 ---------- */

  function safeId(value) {
    const s = String(value == null ? '' : value);
    return /^[A-Za-z0-9_-]{1,64}$/.test(s) ? s : uid();
  }

  function cleanDate(value) {
    const s = String(value == null ? '' : value).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
    const d = new Date(s + 'T00:00:00');
    return isNaN(d.getTime()) || ymd(d) !== s ? '' : s;
  }

  function toNumber(value) {
    if (typeof value === 'number') return isFinite(value) ? value : null;
    const s = String(value == null ? '' : value).trim();
    if (!s) return null;
    const n = Number(s);
    return isFinite(n) ? n : null;
  }

  function cleanTime(value, fallback) {
    if (typeof value === 'string' && !isNaN(new Date(value).getTime())) return value;
    return fallback;
  }

  function normalizeProject(raw) {
    const p = raw || {};
    const status = STATUS[p.status] ? p.status : 'pending';
    const createdAt = cleanTime(p.createdAt, nowISO());
    const updatedAt = cleanTime(p.updatedAt, createdAt);
    const notes = Array.isArray(p.notes)
      ? p.notes
          .filter(function (n) { return n && String(n.content || '').trim(); })
          .map(function (n) {
            const noteCreatedAt = cleanTime(n.createdAt, nowISO());
            return {
              id: safeId(n.id),
              content: String(n.content).trim(),
              createdAt: noteCreatedAt,
              updatedAt: cleanTime(n.updatedAt, noteCreatedAt)
            };
          })
      : [];
    const amountValue = toNumber(p.amount);
    const rateValue = toNumber(p.commissionRate);
    return {
      id: safeId(p.id),
      name: String(p.name || '').trim(),
      status: status,
      clientName: String(p.clientName || '').trim(),
      contactInfo: String(p.contactInfo || '').trim(),
      expectedSignDate: cleanDate(p.expectedSignDate),
      channel: String(p.channel || '').trim(),
      amount: amountValue != null && amountValue > 0 ? Math.round(amountValue * 100) / 100 : null,
      commissionRate: rateValue != null && rateValue >= 0 && rateValue <= 100 ? Math.round(rateValue * 100) / 100 : null,
      signDate: cleanDate(p.signDate),
      rejectReason: String(p.rejectReason || '').trim(),
      notes: notes,
      createdAt: createdAt,
      updatedAt: updatedAt
    };
  }

  function normalizeIncome(raw) {
    const r = raw || {};
    const base = toNumber(r.baseSalary);
    const bonus = toNumber(r.bonus);
    return {
      baseSalary: base != null && base >= 0 && base <= MAX_AMOUNT ? roundMoney(base) : 0,
      bonus: bonus != null && bonus >= 0 && bonus <= MAX_AMOUNT ? roundMoney(bonus) : 0,
      note: String(r.note || '').trim().slice(0, 120)
    };
  }

  function normalizeIncomes(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    Object.keys(raw).forEach(function (key) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) return;
      const income = normalizeIncome(raw[key]);
      if (income.baseSalary || income.bonus || income.note) out[key] = income;
    });
    return out;
  }

  function normalizeSettings(raw) {
    const r = raw || {};
    const base = toNumber(r.defaultBaseSalary);
    return {
      defaultBaseSalary: base != null && base > 0 && base <= MAX_AMOUNT ? roundMoney(base) : null
    };
  }

  function parseStored(raw) {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && Array.isArray(parsed.projects) ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function normalizeSnapshot(parsed) {
    if (!parsed || !Array.isArray(parsed.projects)) return null;
    const seen = {};
    const projects = parsed.projects.map(normalizeProject).filter(function (p) {
      if (!p.name) return false;
      if (seen[p.id]) p.id = uid();
      seen[p.id] = true;
      return true;
    });
    return {
      projects: projects,
      incomes: normalizeIncomes(parsed.incomes),
      settings: normalizeSettings(parsed.settings)
    };
  }

  function loadData() {
    const keys = [STORE_KEY, LEGACY_STORE_KEY];
    let parsed = null;
    let sourceKey = null;
    let corruptRaw = null;
    for (let i = 0; i < keys.length; i += 1) {
      let raw = null;
      try {
        raw = localStorage.getItem(keys[i]);
      } catch (e) {
        raw = null;
      }
      if (!raw) continue;
      const candidate = parseStored(raw);
      if (candidate) {
        parsed = candidate;
        sourceKey = keys[i];
        break;
      }
      if (!corruptRaw) corruptRaw = raw;
    }
    if (!parsed) {
      if (corruptRaw) {
        try {
          localStorage.setItem(BACKUP_KEY, JSON.stringify({ at: nowISO(), raw: corruptRaw }));
        } catch (e) {}
      }
      return {
        version: SCHEMA_VERSION,
        projects: [],
        incomes: {},
        settings: normalizeSettings(),
        corrupt: !!corruptRaw
      };
    }
    const snapshot = normalizeSnapshot(parsed);
    if (sourceKey === LEGACY_STORE_KEY) {
      try {
        localStorage.setItem(
          STORE_KEY,
          JSON.stringify({
            version: SCHEMA_VERSION,
            projects: snapshot.projects,
            incomes: snapshot.incomes,
            settings: snapshot.settings
          })
        );
      } catch (e) {}
    }
    return {
      version: SCHEMA_VERSION,
      projects: snapshot.projects,
      incomes: snapshot.incomes,
      settings: snapshot.settings,
      corrupt: false
    };
  }

  function saveData() {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({
          version: SCHEMA_VERSION,
          projects: data.projects,
          incomes: data.incomes,
          settings: data.settings
        })
      );
      return true;
    } catch (e) {
      toast('保存失败：浏览器存储空间不足');
      return false;
    }
  }

  function getProject(id) {
    return data.projects.find(function (p) { return p.id === id; }) || null;
  }

  function validateName(name, excludeId) {
    if (!name) return '请填写项目地址';
    const lower = name.toLowerCase();
    const dup = data.projects.some(function (p) {
      return p.id !== excludeId && p.name.trim().toLowerCase() === lower;
    });
    return dup ? '项目地址已存在' : '';
  }

  function parseAmount(value) {
    const s = String(value == null ? '' : value).trim();
    if (!s) return { error: '请填写签约金额' };
    const n = Number(s);
    if (!isFinite(n)) return { error: '签约金额格式不正确' };
    if (n <= 0) return { error: '签约金额必须大于 0' };
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return { error: '签约金额最多两位小数' };
    return { value: n };
  }

  function parseRate(value) {
    const s = String(value == null ? '' : value).trim();
    if (!s) return { error: '请填写佣金比例' };
    const n = Number(s);
    if (!isFinite(n)) return { error: '佣金比例格式不正确' };
    if (n < 0 || n > 100) return { error: '佣金比例需在 0–100 之间' };
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return { error: '佣金比例最多两位小数' };
    return { value: n };
  }

  function parseIncomeAmount(value, label) {
    const s = String(value == null ? '' : value).trim();
    if (!s) return { value: 0 };
    const n = Number(s);
    if (!isFinite(n)) return { error: label + '格式不正确' };
    if (n < 0) return { error: label + '不能为负数' };
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return { error: label + '最多两位小数' };
    if (n > MAX_AMOUNT) return { error: label + '金额过大' };
    return { value: roundMoney(n) };
  }

  /* ---------- 通用 UI ---------- */

  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  function updateBodyLock() {
    const locked =
      !$('#detailLayer').classList.contains('hidden') ||
      !$('#formLayer').classList.contains('hidden') ||
      !!$('#modalRoot').firstElementChild ||
      !!$('#confirmRoot').firstElementChild;
    document.body.classList.toggle('no-scroll', locked);
  }

  function openModal(html) {
    const root = $('#modalRoot');
    root.innerHTML = '<div class="modal-mask" role="dialog" aria-modal="true"><div class="modal" tabindex="-1">' + html + '</div></div>';
    root.querySelector('.modal-mask').addEventListener('click', function (e) {
      if (e.target.classList.contains('modal-mask')) closeModal();
    });
    updateBodyLock();
    setTimeout(function () {
      const target = root.querySelector('input, textarea, select, .modal-actions .btn-primary');
      if (target) target.focus();
    }, 60);
  }

  function closeModal() {
    $('#modalRoot').innerHTML = '';
    updateBodyLock();
  }

  function closeConfirm() {
    $('#confirmRoot').innerHTML = '';
    updateBodyLock();
  }

  function showConfirm(opts) {
    const root = $('#confirmRoot');
    root.innerHTML =
      '<div class="modal-mask confirm-mask" role="dialog" aria-modal="true">' +
        '<div class="modal" tabindex="-1">' +
          '<h3>' + esc(opts.title) + '</h3>' +
          '<p class="modal-note">' + esc(opts.message) + '</p>' +
          '<div class="modal-actions">' +
            '<button class="btn btn-outline" type="button" data-mact="cancel">取消</button>' +
            '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" type="button" data-mact="ok">' + esc(opts.okText || '确定') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    const mask = root.querySelector('.modal-mask');
    mask.addEventListener('click', function (e) {
      if (e.target.classList.contains('modal-mask')) closeConfirm();
    });
    root.querySelector('[data-mact="cancel"]').addEventListener('click', closeConfirm);
    root.querySelector('[data-mact="ok"]').addEventListener('click', function () {
      closeConfirm();
      if (typeof opts.onOk === 'function') opts.onOk();
    });
    updateBodyLock();
    setTimeout(function () {
      const target = root.querySelector('.modal');
      if (target) target.focus();
    }, 60);
  }

  function emptyBlock(title, text, withNew) {
    return (
      '<div class="empty">' +
        '<div class="empty-icon">' + ICONS.clipboard + '</div>' +
        '<div class="empty-title">' + esc(title) + '</div>' +
        '<p>' + esc(text) + '</p>' +
        (withNew ? '<button class="btn btn-primary" type="button" data-action="new-project">新建项目</button>' : '') +
      '</div>'
    );
  }

  function channelOptions(selected) {
    let html = '<option value="">未选择</option>';
    CHANNELS.forEach(function (c) {
      html += '<option value="' + c + '"' + (c === selected ? ' selected' : '') + '>' + c + '</option>';
    });
    return html;
  }

  /* ---------- 列表渲染 ---------- */

  function matchQuery(p, query) {
    if (!query) return true;
    const q = query.toLowerCase();
    const hay = [p.name, p.clientName].concat(p.notes.map(function (n) { return n.content; })).join('\n').toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  function latestNote(p) {
    if (!p.notes.length) return null;
    return p.notes.reduce(function (latest, note) {
      if (!latest) return note;
      return note.createdAt > latest.createdAt ? note : latest;
    }, null);
  }

  function byUpdatedDesc(a, b) {
    return String(b.updatedAt).localeCompare(String(a.updatedAt));
  }

  function comparePending(a, b) {
    const da = a.expectedSignDate;
    const db = b.expectedSignDate;
    if (da && db) {
      if (da !== db) return da < db ? -1 : 1;
      return byUpdatedDesc(a, b);
    }
    if (da) return -1;
    if (db) return 1;
    return byUpdatedDesc(a, b);
  }

  function compareAll(a, b, filter) {
    if (filter === 'pending') return comparePending(a, b);
    if (filter === 'signed') {
      const da = a.signDate || '';
      const db = b.signDate || '';
      if (da && db) {
        if (da !== db) return da < db ? 1 : -1;
        return byUpdatedDesc(a, b);
      }
      if (da) return -1;
      if (db) return 1;
      return byUpdatedDesc(a, b);
    }
    return byUpdatedDesc(a, b);
  }

  function expectedBadge(p) {
    if (!p.expectedSignDate) return '<span class="badge badge-muted">未设预计签约时间</span>';
    const diff = daysDiff(todayISO(), p.expectedSignDate);
    let cls = 'badge-muted';
    let text = p.expectedSignDate;
    if (diff < 0) {
      cls = 'badge-danger';
      text = p.expectedSignDate + ' · 已逾期 ' + (-diff) + ' 天';
    } else if (diff === 0) {
      cls = 'badge-warn';
      text = p.expectedSignDate + ' · 今天到期';
    } else if (diff <= 7) {
      cls = 'badge-warn';
      text = p.expectedSignDate + ' · 还剩 ' + diff + ' 天';
    }
    return '<span class="badge ' + cls + '">' + esc(text) + '</span>';
  }

  function pendingCard(p) {
    const latest = latestNote(p);
    const days = Math.max(0, daysDiff(fmtDate(p.createdAt), todayISO()));
    const noteLine = latest
      ? esc(truncate(latest.content, 42))
      : '<span class="muted">还没有跟进记录</span>';
    const noteMeta = latest
      ? '最近备注 ' + fmtDate(latest.createdAt) + ' · 共 ' + p.notes.length + ' 条'
      : '备注 0 条';
    return (
      '<article class="card project-card" role="button" tabindex="0" data-action="open" data-id="' + esc(p.id) + '">' +
        '<div class="card-head">' +
          '<div>' +
            '<div class="card-title">' + esc(p.name) + '</div>' +
            (p.clientName ? '<div class="card-sub">' + esc(p.clientName) + '</div>' : '') +
          '</div>' +
          '<span class="badge badge-pending">待签约</span>' +
        '</div>' +
        '<div class="card-meta">' + expectedBadge(p) + '<span class="muted">已待签约 ' + days + ' 天</span></div>' +
        '<div class="card-note">' + noteLine + '</div>' +
        '<div class="card-meta muted">' + noteMeta + '</div>' +
        '<div class="card-actions">' +
          '<button class="btn btn-sm" type="button" data-action="quick-note" data-id="' + esc(p.id) + '">+ 备注</button>' +
          '<button class="btn btn-sm btn-outline" type="button" data-action="status" data-id="' + esc(p.id) + '">切换状态</button>' +
        '</div>' +
      '</article>'
    );
  }

  function allCard(p) {
    const st = STATUS[p.status];
    let extra = '';
    if (p.status === 'signed') {
      extra =
        '<div class="card-meta">' +
          '<span>签约 ' + esc(p.signDate || '—') + '</span>' +
          '<span>金额 <strong>' + money(p.amount) + '</strong></span>' +
          '<span class="muted">佣金 ' + money(commission(p)) + ' · ' + rateText(p.commissionRate) + '</span>' +
        '</div>';
    } else if (p.status === 'rejected') {
      extra =
        '<div class="card-note">' +
          (p.rejectReason ? esc(p.rejectReason) : '<span class="muted">未填写不签约原因</span>') +
        '</div>';
    } else {
      extra = '<div class="card-meta">' + expectedBadge(p) + '</div>';
    }
    return (
      '<article class="card project-card" role="button" tabindex="0" data-action="open" data-id="' + esc(p.id) + '">' +
        '<div class="card-head">' +
          '<div>' +
            '<div class="card-title">' + esc(p.name) + '</div>' +
            (p.clientName ? '<div class="card-sub">' + esc(p.clientName) + '</div>' : '') +
          '</div>' +
          '<span class="badge ' + st.cls + '">' + st.label + '</span>' +
        '</div>' +
        extra +
        (p.notes.length
          ? '<div class="card-meta muted">备注 ' + p.notes.length + ' 条 · 最近更新 ' + fmtDate(p.updatedAt) + '</div>'
          : '') +
      '</article>'
    );
  }

  function renderPending() {
    const query = state.searchPending.trim();
    const items = data.projects
      .filter(function (p) { return p.status === 'pending' && matchQuery(p, query); })
      .sort(comparePending);
    const wrap = $('#listPending');
    if (!items.length) {
      if (data.projects.length === 0) {
        wrap.innerHTML = emptyBlock('还没有项目', '把正在跟进的项目记下来，签约后自动进入业绩统计。', true);
      } else if (query) {
        wrap.innerHTML = emptyBlock('没有匹配的项目', '换个关键词试试。', false);
      } else {
        wrap.innerHTML = emptyBlock('没有待签约项目', '当前所有项目都已处理，可以在「全部项目」里查看。', false);
      }
      return;
    }
    wrap.innerHTML = items.map(pendingCard).join('');
  }

  function renderAllList() {
    const query = state.searchAll.trim();
    const filter = state.statusFilter;
    const items = data.projects
      .filter(function (p) {
        return (filter === 'all' || p.status === filter) && matchQuery(p, query);
      })
      .sort(function (a, b) { return compareAll(a, b, filter); });
    const wrap = $('#listAll');
    if (!items.length) {
      if (data.projects.length === 0) {
        wrap.innerHTML = emptyBlock('还没有项目', '点击右下角按钮新建第一个项目。', true);
      } else {
        wrap.innerHTML = emptyBlock('没有匹配的项目', '换个关键词或状态试试。', false);
      }
      return;
    }
    wrap.innerHTML = items.map(allCard).join('');
  }

  /* ---------- 业绩 ---------- */

  function monthStats(ym) {
    let amount = 0;
    let commissionTotal = 0;
    let count = 0;
    data.projects.forEach(function (p) {
      if (p.status !== 'signed' || !p.signDate || p.signDate.slice(0, 7) !== ym) return;
      amount += Number(p.amount) || 0;
      commissionTotal += commission(p);
      count += 1;
    });
    const income = data.incomes[ym];
    const baseSalary = income ? income.baseSalary : 0;
    const bonus = income ? income.bonus : 0;
    return {
      amount: roundMoney(amount),
      commission: roundMoney(commissionTotal),
      baseSalary: baseSalary,
      bonus: bonus,
      totalIncome: roundMoney(baseSalary + bonus + commissionTotal),
      count: count
    };
  }

  function yearStats(year) {
    const yearKey = String(year);
    let amount = 0;
    let commissionTotal = 0;
    let baseSalary = 0;
    let bonus = 0;
    let count = 0;
    for (let i = 1; i <= 12; i += 1) {
      const stats = monthStats(yearKey + '-' + pad2(i));
      amount += stats.amount;
      commissionTotal += stats.commission;
      baseSalary += stats.baseSalary;
      bonus += stats.bonus;
      count += stats.count;
    }
    return {
      amount: roundMoney(amount),
      commission: roundMoney(commissionTotal),
      baseSalary: roundMoney(baseSalary),
      bonus: roundMoney(bonus),
      totalIncome: roundMoney(baseSalary + bonus + commissionTotal),
      count: count
    };
  }

  function recordedMonthsInYear(year) {
    const yearKey = String(year);
    return Object.keys(data.incomes).filter(function (ym) {
      return ym.slice(0, 4) === yearKey;
    }).length;
  }

  function elapsedMonthsInYear(year) {
    const now = new Date();
    const currentYear = now.getFullYear();
    if (year < currentYear) return 12;
    if (year > currentYear) return 0;
    return now.getMonth() + 1;
  }

  function renderStats() {
    const ym = state.statsMonth;
    const year = Number(ym.slice(0, 4));
    const month = Number(ym.slice(5, 7));
    const monthLabel = $('#monthLabel');
    if (monthLabel) monthLabel.textContent = year + '年' + month + '月';

    const current = monthStats(ym);
    const income = data.incomes[ym];
    const recorded = !!income;
    const missingTag = '<span class="mini-tag">未录入</span>';
    const statCards = $('#statCards');
    if (statCards) {
      statCards.innerHTML =
        '<div class="stat-card stat-card-total"><div class="stat-label">本月收入</div><div class="stat-value income">' + money(current.totalIncome) + '</div></div>' +
        '<div class="stat-card"><div class="stat-label">佣金</div><div class="stat-value commission">' + money(current.commission) + '</div></div>' +
        '<div class="stat-card"><div class="stat-label">底薪' + (recorded ? '' : ' ' + missingTag) + '</div><div class="stat-value salary">' + money(current.baseSalary) + '</div></div>' +
        '<div class="stat-card"><div class="stat-label">奖金' + (recorded ? '' : ' ' + missingTag) + '</div><div class="stat-value bonus">' + money(current.bonus) + '</div></div>' +
        '<div class="stat-card"><div class="stat-label">签约金额</div><div class="stat-value amount">' + money(current.amount) + '</div></div>' +
        '<div class="stat-card"><div class="stat-label">签约项目</div><div class="stat-value count">' + current.count + ' 个</div></div>';
    }
    const incomeBar = $('#incomeBar');
    if (incomeBar) {
      incomeBar.innerHTML =
        '<span class="muted small">底薪 / 奖金按自然月记录</span>' +
        '<button class="btn btn-sm ' + (recorded ? 'btn-outline' : 'btn-primary') + '" type="button" data-action="edit-income">' + (recorded ? '编辑本月收入' : '录入本月收入') + '</button>';
    }

    const monthProjects = data.projects
      .filter(function (p) { return p.status === 'signed' && p.signDate && p.signDate.slice(0, 7) === ym; })
      .sort(function (a, b) { return String(b.signDate).localeCompare(String(a.signDate)); });

    const monthListCount = $('#monthListCount');
    if (monthListCount) monthListCount.textContent = monthProjects.length ? monthProjects.length + ' 个' : '';
    const monthList = $('#monthList');
    if (monthList) {
      monthList.innerHTML = monthProjects.length
        ? monthProjects.map(function (p) {
            return (
              '<div class="mini-row" role="button" tabindex="0" data-action="open" data-id="' + esc(p.id) + '">' +
                '<div>' +
                  '<div class="mini-name">' + esc(p.name) + '</div>' +
                  '<div class="mini-sub">' + esc(p.clientName || '未填客户') + ' · ' + esc(p.signDate) + '</div>' +
                '</div>' +
                '<div class="mini-right">' + money(p.amount) + '<div class="muted">佣金 ' + money(commission(p)) + '</div></div>' +
              '</div>'
            );
          }).join('')
        : '<div class="mini-empty">该月没有签约项目</div>';
    }

    const yearKey = String(year);
    const yearly = yearStats(year);
    const recordedMonths = recordedMonthsInYear(year);
    const elapsedMonths = elapsedMonthsInYear(year);

    const yearTotalCard = $('#yearTotalCard');
    if (yearTotalCard) {
      yearTotalCard.innerHTML =
        '<div class="card-title-row"><h3>' + year + ' 年累计</h3><span class="muted small">' + yearly.count + ' 个签约项目</span></div>' +
        '<div class="year-total-grid">' +
          '<div class="year-total-item"><div class="label">签约金额</div><div class="value amount">' + money(yearly.amount) + '</div></div>' +
          '<div class="year-total-item"><div class="label">佣金</div><div class="value commission">' + money(yearly.commission) + '</div></div>' +
          '<div class="year-total-item"><div class="label">底薪</div><div class="value salary">' + money(yearly.baseSalary) + '</div></div>' +
          '<div class="year-total-item"><div class="label">奖金</div><div class="value bonus">' + money(yearly.bonus) + '</div></div>' +
          '<div class="year-total-item"><div class="label">总收入</div><div class="value income">' + money(yearly.totalIncome) + '</div></div>' +
          '<div class="year-total-item"><div class="label">签约项目</div><div class="value">' + yearly.count + ' 个</div></div>' +
        '</div>';
    }

    const yearListTitle = $('#yearListTitle');
    if (yearListTitle) yearListTitle.textContent = year + ' 年各月收入';
    const yearRecordedHint = $('#yearRecordedHint');
    if (yearRecordedHint) {
      const totalMonths = Math.max(elapsedMonths, recordedMonths);
      yearRecordedHint.textContent = totalMonths
        ? '已录入 ' + recordedMonths + '/' + totalMonths + ' 个月'
        : '已录入 ' + recordedMonths + ' 个月';
    }

    const expanded = state.yearExpandedYear === yearKey;
    const listRows = [];
    let hiddenMonths = 0;
    for (let i = 1; i <= 12; i += 1) {
      const key = year + '-' + pad2(i);
      const stats = monthStats(key);
      const hasData = stats.totalIncome > 0 || stats.count > 0;
      if (!expanded && !hasData && key !== ym && key !== currentMonth()) {
        hiddenMonths += 1;
        continue;
      }
      listRows.push(yearMonthRow(key, stats));
    }
    let monthListHtml = listRows.join('');
    if (expanded) {
      monthListHtml += '<button class="btn btn-sm btn-outline year-more" type="button" data-action="toggle-year">收起未录入月份</button>';
    } else if (hiddenMonths > 0) {
      monthListHtml += '<button class="btn btn-sm btn-outline year-more" type="button" data-action="toggle-year">展开其余 ' + hiddenMonths + ' 个月</button>';
    }
    monthListHtml +=
      '<div class="year-month-summary">' +
        '<div class="year-month-head"><span>全年合计</span><span class="year-month-total">' + money(yearly.totalIncome) + '</span></div>' +
        '<div class="year-month-sub">底薪 ' + moneyCompact(yearly.baseSalary) + ' · 奖金 ' + moneyCompact(yearly.bonus) + ' · 佣金 ' + moneyCompact(yearly.commission) + '</div>' +
      '</div>';
    const yearMonthList = $('#yearMonthList');
    if (yearMonthList) yearMonthList.innerHTML = monthListHtml;

    renderChart();
  }

  function yearMonthRow(ym, stats) {
    const income = data.incomes[ym];
    const note = income && income.note ? income.note : '';
    const parts = [
      '底薪 ' + moneyCompact(stats.baseSalary),
      '奖金 ' + moneyCompact(stats.bonus),
      '佣金 ' + moneyCompact(stats.commission),
      '签约 ' + stats.count + ' 个'
    ];
    return (
      '<div class="year-month-row' + (ym === state.statsMonth ? ' active' : '') + '" role="button" tabindex="0" data-action="jump-month" data-month="' + ym + '">' +
        '<div class="year-month-head">' +
          '<span class="year-month-name">' + Number(ym.slice(5, 7)) + ' 月' + (income ? '' : '<span class="mini-tag">未录入</span>') + '</span>' +
          '<span class="year-month-total">' + money(stats.totalIncome) + '</span>' +
        '</div>' +
        '<div class="year-month-sub">' + parts.join(' · ') + '</div>' +
        (note ? '<div class="year-month-note" title="' + esc(note) + '">' + esc(truncate(note, 30)) + '</div>' : '') +
      '</div>'
    );
  }

  function renderChart() {
    if (state.view !== 'stats') return;
    if (typeof echarts === 'undefined') return;
    const el = $('#trendChart');
    if (!el) return;

    const months = [];
    for (let i = 11; i >= 0; i -= 1) months.push(addMonths(state.statsMonth, -i));
    const statsList = months.map(monthStats);
    const amounts = statsList.map(function (s) { return s.amount; });
    const commissions = statsList.map(function (s) { return s.commission; });
    const salaries = statsList.map(function (s) { return s.baseSalary; });
    const bonuses = statsList.map(function (s) { return s.bonus; });
    const incomes = statsList.map(function (s) { return s.totalIncome; });
    const labels = months.map(function (mo) { return Number(mo.slice(5, 7)) + '月'; });

    const cs = getComputedStyle(document.documentElement);
    const textColor = cs.getPropertyValue('--text').trim();
    const muted = cs.getPropertyValue('--muted').trim();
    const border = cs.getPropertyValue('--border').trim();
    const primary = cs.getPropertyValue('--primary').trim();
    const success = cs.getPropertyValue('--success').trim();
    const warn = cs.getPropertyValue('--warn').trim();

    if (!state.chart) state.chart = echarts.init(el);
    state.chart.setOption(
      {
        backgroundColor: 'transparent',
        color: [primary, success, warn],
        grid: { left: 4, right: 8, top: 34, bottom: 2, containLabel: true },
        tooltip: {
          trigger: 'axis',
          backgroundColor: 'rgba(24,27,33,.94)',
          borderWidth: 0,
          textStyle: { color: '#fff', fontSize: 12 },
          formatter: function (params) {
            const idx = params && params[0] ? params[0].dataIndex : 0;
            const monthIncome = data.incomes[months[idx]];
            const note = monthIncome && monthIncome.note ? monthIncome.note : '';
            return (
              labels[idx] +
              '<br/>签约金额：' + money(amounts[idx]) +
              '<br/>佣金：' + money(commissions[idx]) +
              '<br/>底薪：' + money(salaries[idx]) +
              '<br/>奖金：' + money(bonuses[idx]) +
              '<br/>总收入：' + money(incomes[idx]) +
              (note ? '<br/>备注：' + esc(note) : '')
            );
          }
        },
        legend: {
          top: 0,
          right: 0,
          itemWidth: 12,
          itemHeight: 8,
          itemGap: 10,
          textStyle: { color: muted, fontSize: 11 }
        },
        xAxis: {
          type: 'category',
          data: labels,
          axisLine: { lineStyle: { color: border } },
          axisTick: { show: false },
          axisLabel: { color: muted, fontSize: 10 }
        },
        yAxis: [
          {
            type: 'value',
            axisLabel: {
              color: muted,
              fontSize: 10,
              formatter: function (v) {
                if (v >= 100000000) return parseFloat((v / 100000000).toFixed(1)) + '亿';
                if (v >= 10000) return parseFloat((v / 10000).toFixed(1)) + '万';
                return v;
              }
            },
            splitLine: { lineStyle: { color: border, type: 'dashed' } }
          },
          {
            type: 'value',
            axisLabel: { color: muted, fontSize: 10 },
            splitLine: { show: false }
          }
        ],
        series: [
          {
            name: '签约金额',
            type: 'bar',
            data: amounts,
            barMaxWidth: 18,
            itemStyle: { color: primary, borderRadius: [4, 4, 0, 0] }
          },
          {
            name: '佣金',
            type: 'line',
            yAxisIndex: 1,
            data: commissions,
            smooth: true,
            symbol: 'circle',
            symbolSize: 5,
            lineStyle: { color: success, width: 2 },
            itemStyle: { color: success }
          },
          {
            name: '总收入',
            type: 'line',
            yAxisIndex: 1,
            data: incomes,
            smooth: true,
            symbol: 'circle',
            symbolSize: 5,
            lineStyle: { color: warn, width: 2, type: 'dashed' },
            itemStyle: { color: warn }
          }
        ]
      },
      true
    );
    state.chart.resize();
  }

  /* ---------- 月度收入 ---------- */

  function openIncomeModal(ym) {
    const income = data.incomes[ym];
    const defaultBase = data.settings.defaultBaseSalary;
    const baseValue = income ? income.baseSalary : defaultBase == null ? '' : defaultBase;
    const bonusValue = income ? income.bonus : '';
    const noteValue = income ? income.note : '';
    const commissionValue = monthStats(ym).commission;
    const year = ym.slice(0, 4);
    const month = Number(ym.slice(5, 7));

    openModal(
      '<h3>' + year + '年' + month + '月收入</h3>' +
      '<div class="form-row"><label for="mi-base">底薪（元）</label><input type="number" id="mi-base" step="0.01" min="0" inputmode="decimal" value="' + esc(baseValue) + '" placeholder="0"></div>' +
      '<div class="form-row"><label for="mi-bonus">奖金（元）</label><input type="number" id="mi-bonus" step="0.01" min="0" inputmode="decimal" value="' + esc(bonusValue) + '" placeholder="0"></div>' +
      '<div class="form-row"><label for="mi-note">备注</label><input id="mi-note" maxlength="120" placeholder="选填，例如：季度奖 / 项目奖" value="' + esc(noteValue) + '"></div>' +
      '<div class="commission-preview"><span>本月合计</span><strong id="mi-total">' + money(commissionValue + (Number(baseValue) || 0) + (Number(bonusValue) || 0)) + '</strong></div>' +
      '<div class="modal-actions">' +
        (income ? '<button class="btn btn-danger-outline" type="button" data-mact="clear">清除</button>' : '') +
        '<button class="btn btn-outline" type="button" data-mact="cancel">取消</button>' +
        '<button class="btn btn-primary" type="button" data-mact="save">保存</button>' +
      '</div>' +
      '<p class="modal-note">合计 = 底薪 + 奖金 + 当月佣金（佣金按签约月份自动计算）。</p>'
    );

    const baseInput = $('#mi-base');
    const bonusInput = $('#mi-bonus');
    const updatePreview = function () {
      const base = Number(baseInput.value) || 0;
      const bonus = Number(bonusInput.value) || 0;
      $('#mi-total').textContent = money(roundMoney(commissionValue + base + bonus));
    };
    baseInput.addEventListener('input', updatePreview);
    bonusInput.addEventListener('input', updatePreview);
    $('#modalRoot').querySelector('[data-mact="cancel"]').addEventListener('click', closeModal);
    $('#modalRoot').querySelector('[data-mact="save"]').addEventListener('click', function () {
      saveIncomeFromModal(ym);
    });
    const clearBtn = $('#modalRoot').querySelector('[data-mact="clear"]');
    if (clearBtn) clearBtn.addEventListener('click', function () { clearIncome(ym); });
  }

  function saveIncomeFromModal(ym) {
    const baseResult = parseIncomeAmount($('#mi-base').value, '底薪');
    if (baseResult.error) {
      toast(baseResult.error);
      $('#mi-base').focus();
      return;
    }
    const bonusResult = parseIncomeAmount($('#mi-bonus').value, '奖金');
    if (bonusResult.error) {
      toast(bonusResult.error);
      $('#mi-bonus').focus();
      return;
    }
    const note = $('#mi-note').value.trim();
    const previous = data.incomes[ym];
    if (!baseResult.value && !bonusResult.value && !note) delete data.incomes[ym];
    else data.incomes[ym] = { baseSalary: baseResult.value, bonus: bonusResult.value, note: note };
    if (!saveData()) {
      if (previous) data.incomes[ym] = previous;
      else delete data.incomes[ym];
      return;
    }
    closeModal();
    toast('本月收入已保存');
    renderStats();
  }

  function clearIncome(ym) {
    const year = ym.slice(0, 4);
    const month = Number(ym.slice(5, 7));
    showConfirm({
      title: '清除本月收入',
      message: '将清除 ' + year + '年' + month + '月 的底薪和奖金记录，当月佣金不受影响。',
      okText: '清除',
      danger: true,
      onOk: function () {
        const previous = data.incomes[ym];
        delete data.incomes[ym];
        if (!saveData()) {
          if (previous) data.incomes[ym] = previous;
          return;
        }
        closeModal();
        toast('已清除本月收入');
        renderStats();
      }
    });
  }

  /* ---------- 详情页 ---------- */

  function notesHTML(p) {
    const notes = p.notes.slice().sort(function (a, b) {
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
    if (!notes.length) return '<div class="mini-empty">还没有备注</div>';
    return notes
      .map(function (n) {
        if (state.editingNoteId === n.id) {
          return (
            '<div class="note-item">' +
              '<div class="note-time">' + fmtDateTime(n.createdAt) + '</div>' +
              '<div class="note-editor">' +
                '<textarea id="d-note-edit" aria-label="编辑备注" rows="3" maxlength="1000">' + esc(n.content) + '</textarea>' +
                '<div class="note-editor-actions">' +
                  '<button class="btn btn-sm" type="button" data-dact="cancel-edit-note">取消</button>' +
                  '<button class="btn btn-sm btn-primary" type="button" data-dact="save-note" data-note="' + esc(n.id) + '">保存</button>' +
                '</div>' +
              '</div>' +
            '</div>'
          );
        }
        return (
          '<div class="note-item">' +
            '<div class="note-time">' + fmtDateTime(n.createdAt) + (n.updatedAt && n.updatedAt !== n.createdAt ? ' · 已编辑' : '') + '</div>' +
            '<div class="note-content">' + esc(n.content) + '</div>' +
            '<div class="note-actions">' +
              '<button class="btn-ghost" type="button" data-dact="edit-note" data-note="' + esc(n.id) + '">编辑</button>' +
              '<button class="btn-ghost danger" type="button" data-dact="del-note" data-note="' + esc(n.id) + '">删除</button>' +
            '</div>' +
          '</div>'
        );
      })
      .join('');
  }

  function renderDetail() {
    const layer = $('#detailLayer');
    const p = getProject(state.detailId);
    if (!p) {
      layer.classList.add('hidden');
      state.detailId = null;
      updateBodyLock();
      return;
    }
    const st = STATUS[p.status];
    const channelIsCustom = p.channel && CHANNELS.indexOf(p.channel) === -1;
    const channelValue = channelIsCustom ? '其他' : p.channel || '';
    const scrollTop = layer.scrollTop;
    let signedSection = '';
    if (p.status === 'signed') {
      signedSection =
        '<section class="card">' +
          '<div class="section-title">签约信息</div>' +
          '<div class="form-row"><label for="d-amount">签约金额（元）*</label><input type="number" id="d-amount" step="0.01" min="0" inputmode="decimal" value="' + (p.amount == null ? '' : p.amount) + '"></div>' +
          '<div class="form-row"><label for="d-rate">佣金比例（%）*</label><input type="number" id="d-rate" step="0.01" min="0" max="100" inputmode="decimal" value="' + (p.commissionRate == null ? 2 : p.commissionRate) + '"></div>' +
          '<div class="form-row"><label for="d-sign-date">签约日期 *</label><input type="date" id="d-sign-date" value="' + esc(p.signDate) + '"></div>' +
          '<div class="commission-preview"><span>预计佣金</span><strong id="d-commission">' + money(commission(p)) + '</strong></div>' +
        '</section>';
    }
    let rejectedSection = '';
    if (p.status === 'rejected') {
      rejectedSection =
        '<section class="card">' +
          '<div class="form-row"><label for="d-reject">不签约原因</label><textarea id="d-reject" rows="3" maxlength="500" placeholder="选填，例如：预算不足 / 竞品介入">' + esc(p.rejectReason) + '</textarea></div>' +
        '</section>';
    }

    layer.innerHTML =
      '<div class="page-header">' +
        '<button class="icon-btn" type="button" data-dact="back" aria-label="返回">' + ICONS.back + '</button>' +
        '<h2>项目详情</h2>' +
        '<span class="badge ' + st.cls + '">' + st.label + '</span>' +
      '</div>' +
      '<div class="page-body">' +
        '<section class="card">' +
          '<div class="form-row"><label for="d-name">项目地址 *</label><input id="d-name" maxlength="80" value="' + esc(p.name) + '"></div>' +
          '<div class="form-row">' +
            '<label>状态</label>' +
            '<div class="status-line"><span class="badge ' + st.cls + '">' + st.label + '</span>' +
              '<button class="btn btn-sm" type="button" data-dact="status">切换状态</button>' +
            '</div>' +
          '</div>' +
          '<div class="form-row"><label for="d-client">客户名称</label><input id="d-client" maxlength="80" value="' + esc(p.clientName) + '"></div>' +
          '<div class="form-row"><label for="d-contact">联系方式</label><input id="d-contact" maxlength="120" value="' + esc(p.contactInfo) + '"></div>' +
          '<div class="form-row">' +
            '<label for="d-channel">来源渠道</label>' +
            '<select id="d-channel">' + channelOptions(channelValue) + '</select>' +
            '<input id="d-channel-custom" aria-label="自定义来源渠道" class="' + (channelValue === '其他' ? '' : 'hidden') + '" style="margin-top:8px" maxlength="40" placeholder="填写渠道" value="' + esc(channelIsCustom ? p.channel : '') + '">' +
          '</div>' +
          '<div class="form-row"><label for="d-expected">预计签约时间</label><input type="date" id="d-expected" value="' + esc(p.expectedSignDate) + '"></div>' +
        '</section>' +
        signedSection +
        rejectedSection +
        '<button class="btn btn-primary btn-block" type="button" data-dact="save">保存修改</button>' +
        '<section class="card">' +
          '<div class="section-title" id="d-notes-title">备注（' + p.notes.length + '）</div>' +
          '<div class="note-add">' +
            '<textarea id="d-note-new" aria-label="新增备注" rows="2" maxlength="1000" placeholder="记录跟进情况……"></textarea>' +
            '<button class="btn btn-primary btn-sm" type="button" data-dact="add-note">添加备注</button>' +
          '</div>' +
          '<div class="timeline">' + notesHTML(p) + '</div>' +
        '</section>' +
        '<button class="btn btn-danger-outline btn-block detail-danger" type="button" data-dact="delete">删除项目</button>' +
      '</div>';
    layer.scrollTop = scrollTop;
  }

  function captureDetailDraft() {
    if (!$('#d-name')) return null;
    return {
      name: $('#d-name').value,
      client: $('#d-client').value,
      contact: $('#d-contact').value,
      channel: $('#d-channel').value,
      channelCustom: $('#d-channel-custom').value,
      expected: $('#d-expected').value,
      amount: $('#d-amount') ? $('#d-amount').value : null,
      rate: $('#d-rate') ? $('#d-rate').value : null,
      signDate: $('#d-sign-date') ? $('#d-sign-date').value : null,
      reject: $('#d-reject') ? $('#d-reject').value : null,
      noteDraft: $('#d-note-new') ? $('#d-note-new').value : ''
    };
  }

  function restoreDetailDraft(draft) {
    if (!draft) return;
    const set = function (id, value) {
      const el = document.getElementById(id);
      if (el && value != null) el.value = value;
    };
    set('d-name', draft.name);
    set('d-client', draft.client);
    set('d-contact', draft.contact);
    set('d-expected', draft.expected);
    set('d-amount', draft.amount);
    set('d-rate', draft.rate);
    set('d-sign-date', draft.signDate);
    set('d-reject', draft.reject);
    set('d-note-new', draft.noteDraft);
    const custom = $('#d-channel-custom');
    const select = $('#d-channel');
    if (select && draft.channel != null) select.value = draft.channel;
    if (custom) {
      if (draft.channelCustom != null) custom.value = draft.channelCustom;
      custom.classList.toggle('hidden', draft.channel !== '其他');
    }
    updateCommissionPreview();
  }

  function updateCommissionPreview() {
    const amountInput = $('#d-amount');
    const rateInput = $('#d-rate');
    const preview = $('#d-commission');
    if (!amountInput || !rateInput || !preview) return;
    const amount = Number(amountInput.value);
    const rate = Number(rateInput.value);
    preview.textContent = isFinite(amount) && isFinite(rate) ? money(commissionOf(amount, rate)) : '¥0.00';
  }

  function openDetail(id) {
    state.detailId = id;
    state.editingNoteId = null;
    const layer = $('#detailLayer');
    layer.scrollTop = 0;
    layer.classList.remove('hidden');
    renderDetail();
    updateBodyLock();
  }

  function closeDetail() {
    state.detailId = null;
    state.editingNoteId = null;
    $('#detailLayer').classList.add('hidden');
    $('#detailLayer').innerHTML = '';
    updateBodyLock();
    renderAll();
  }

  function saveDetail() {
    const p = getProject(state.detailId);
    if (!p) return;
    const name = $('#d-name').value.trim();
    const nameError = validateName(name, p.id);
    if (nameError) {
      toast(nameError);
      $('#d-name').focus();
      return;
    }

    let amount = p.amount;
    let rate = p.commissionRate;
    let signDate = p.signDate;
    if (p.status === 'signed') {
      const amountResult = parseAmount($('#d-amount').value);
      if (amountResult.error) {
        toast(amountResult.error);
        $('#d-amount').focus();
        return;
      }
      const rateResult = parseRate($('#d-rate').value);
      if (rateResult.error) {
        toast(rateResult.error);
        $('#d-rate').focus();
        return;
      }
      signDate = $('#d-sign-date').value;
      if (!signDate) {
        toast('请选择签约日期');
        $('#d-sign-date').focus();
        return;
      }
      amount = amountResult.value;
      rate = rateResult.value;
    }

    const channelSelect = $('#d-channel').value;
    const channel = channelSelect === '其他' ? $('#d-channel-custom').value.trim() || '其他' : channelSelect;

    p.name = name;
    p.clientName = $('#d-client').value.trim();
    p.contactInfo = $('#d-contact').value.trim();
    p.expectedSignDate = $('#d-expected').value || '';
    p.channel = channel;
    if (p.status === 'signed') {
      p.amount = amount;
      p.commissionRate = rate;
      p.signDate = signDate;
    }
    if (p.status === 'rejected') {
      p.rejectReason = $('#d-reject').value.trim();
    }
    const noteDraft = $('#d-note-new') ? $('#d-note-new').value : '';
    p.updatedAt = nowISO();
    if (!saveData()) return;
    toast('已保存');
    renderDetail();
    const draftInput = $('#d-note-new');
    if (draftInput) draftInput.value = noteDraft;
    renderAll();
  }

  function refreshNotes(p) {
    const title = $('#d-notes-title');
    if (title) title.textContent = '备注（' + p.notes.length + '）';
    const timeline = $('#detailLayer .timeline');
    if (timeline) timeline.innerHTML = notesHTML(p);
    renderAll();
  }

  function addNote() {
    const p = getProject(state.detailId);
    if (!p) return;
    const textarea = $('#d-note-new');
    const content = textarea.value.trim();
    if (!content) {
      toast('备注内容不能为空');
      textarea.focus();
      return;
    }
    const now = nowISO();
    const previousUpdatedAt = p.updatedAt;
    p.notes.push({ id: uid(), content: content, createdAt: now, updatedAt: now });
    p.updatedAt = now;
    if (!saveData()) {
      p.notes.pop();
      p.updatedAt = previousUpdatedAt;
      return;
    }
    textarea.value = '';
    toast('已添加备注');
    refreshNotes(p);
  }

  function saveNote(noteId) {
    const p = getProject(state.detailId);
    if (!p) return;
    const note = p.notes.find(function (n) { return n.id === noteId; });
    if (!note) return;
    const textarea = $('#d-note-edit');
    const content = textarea ? textarea.value.trim() : '';
    if (!content) {
      toast('备注内容不能为空');
      if (textarea) textarea.focus();
      return;
    }
    const previousContent = note.content;
    const previousUpdatedAt = note.updatedAt;
    const previousProjectUpdatedAt = p.updatedAt;
    note.content = content;
    note.updatedAt = nowISO();
    p.updatedAt = note.updatedAt;
    if (!saveData()) {
      note.content = previousContent;
      note.updatedAt = previousUpdatedAt;
      p.updatedAt = previousProjectUpdatedAt;
      return;
    }
    state.editingNoteId = null;
    toast('备注已保存');
    refreshNotes(p);
  }

  function deleteNote(noteId) {
    showConfirm({
      title: '删除备注',
      message: '确定删除这条备注吗？删除后无法恢复。',
      okText: '删除',
      danger: true,
      onOk: function () {
        const p = getProject(state.detailId);
        if (!p) return;
        const index = p.notes.findIndex(function (n) { return n.id === noteId; });
        if (index === -1) return;
        const removed = p.notes[index];
        const previousUpdatedAt = p.updatedAt;
        p.notes.splice(index, 1);
        p.updatedAt = nowISO();
        if (!saveData()) {
          p.notes.splice(index, 0, removed);
          p.updatedAt = previousUpdatedAt;
          return;
        }
        toast('备注已删除');
        refreshNotes(p);
      }
    });
  }

  function confirmDeleteProject() {
    const p = getProject(state.detailId);
    if (!p) return;
    showConfirm({
      title: '删除项目',
      message: '确定删除「' + p.name + '」吗？删除后无法恢复。',
      okText: '删除',
      danger: true,
      onOk: function () {
        const index = data.projects.findIndex(function (x) { return x.id === p.id; });
        if (index === -1) return;
        const removed = data.projects.splice(index, 1)[0];
        if (!saveData()) {
          data.projects.splice(index, 0, removed);
          return;
        }
        closeDetail();
        toast('项目已删除');
      }
    });
  }

  /* ---------- 状态切换 ---------- */

  function openStatusModal(id) {
    const p = getProject(id);
    if (!p) return;
    let target = p.status;
    openModal(
      '<h3>切换项目状态</h3>' +
      '<div class="status-seg" id="st-seg">' +
        ['pending', 'signed', 'rejected'].map(function (s) {
          return '<button type="button" data-st="' + s + '" class="' + (s === p.status ? 'active' : '') + '">' + STATUS[s].label + '</button>';
        }).join('') +
      '</div>' +
      '<div id="st-signed" class="' + (p.status === 'signed' ? '' : 'hidden') + '">' +
        '<div class="form-row"><label for="st-amount">签约金额（元）*</label><input type="number" id="st-amount" step="0.01" min="0" inputmode="decimal" value="' + (p.amount == null ? '' : p.amount) + '"></div>' +
        '<div class="form-row"><label for="st-rate">佣金比例（%）*</label><input type="number" id="st-rate" step="0.01" min="0" max="100" inputmode="decimal" value="' + (p.commissionRate == null ? 2 : p.commissionRate) + '"></div>' +
        '<div class="form-row"><label for="st-date">签约日期 *</label><input type="date" id="st-date" value="' + esc(p.signDate || todayISO()) + '"></div>' +
      '</div>' +
      '<div id="st-rejected" class="' + (p.status === 'rejected' ? '' : 'hidden') + '">' +
        '<div class="form-row"><label for="st-reason">不签约原因</label><textarea id="st-reason" rows="3" maxlength="500" placeholder="选填">' + esc(p.rejectReason) + '</textarea></div>' +
      '</div>' +
      '<div class="modal-actions">' +
        '<button class="btn btn-outline" type="button" data-mact="cancel">取消</button>' +
        '<button class="btn btn-primary" type="button" data-mact="save">确定</button>' +
      '</div>'
    );

    const segment = $('#st-seg');
    function refreshSections() {
      $$('[data-st]', segment).forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.st === target);
      });
      $('#st-signed').classList.toggle('hidden', target !== 'signed');
      $('#st-rejected').classList.toggle('hidden', target !== 'rejected');
    }
    segment.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-st]');
      if (!btn) return;
      target = btn.dataset.st;
      refreshSections();
    });

    $('#modalRoot').querySelector('[data-mact="cancel"]').addEventListener('click', closeModal);
    $('#modalRoot').querySelector('[data-mact="save"]').addEventListener('click', function () {
      let amount = p.amount;
      let rate = p.commissionRate;
      let signDate = p.signDate;
      if (target === 'signed') {
        const amountResult = parseAmount($('#st-amount').value);
        if (amountResult.error) {
          toast(amountResult.error);
          $('#st-amount').focus();
          return;
        }
        const rateResult = parseRate($('#st-rate').value);
        if (rateResult.error) {
          toast(rateResult.error);
          $('#st-rate').focus();
          return;
        }
        signDate = $('#st-date').value;
        if (!signDate) {
          toast('请选择签约日期');
          $('#st-date').focus();
          return;
        }
        amount = amountResult.value;
        rate = rateResult.value;
      }
      const current = getProject(id);
      if (!current) {
        closeModal();
        toast('项目已被删除');
        renderAll();
        if (state.detailId === id) closeDetail();
        return;
      }
      const snapshot = {
        status: current.status,
        amount: current.amount,
        commissionRate: current.commissionRate,
        signDate: current.signDate,
        rejectReason: current.rejectReason,
        updatedAt: current.updatedAt
      };
      current.status = target;
      if (target === 'signed') {
        current.amount = amount;
        current.commissionRate = rate;
        current.signDate = signDate;
      }
      if (target === 'rejected') {
        current.rejectReason = $('#st-reason').value.trim();
      }
      current.updatedAt = nowISO();
      if (!saveData()) {
        Object.assign(current, snapshot);
        return;
      }
      closeModal();
      toast('状态已更新');
      renderAll();
      if (state.detailId === id) {
        const draft = captureDetailDraft();
        renderDetail();
        restoreDetailDraft(draft);
      }
    });
  }

  /* ---------- 新建项目 ---------- */

  function openNewForm() {
    const layer = $('#formLayer');
    layer.innerHTML =
      '<div class="page-header">' +
        '<button class="icon-btn" type="button" data-fact="cancel" aria-label="返回">' + ICONS.back + '</button>' +
        '<h2>新建项目</h2>' +
        '<span class="badge badge-pending">待签约</span>' +
      '</div>' +
      '<div class="page-body">' +
        '<section class="card">' +
          '<div class="form-row"><label for="f-name">项目地址 *</label><input id="f-name" maxlength="80" placeholder="例如：XX 市 XX 区 XX 路 88 号"></div>' +
          '<div class="form-row"><label for="f-client">客户名称</label><input id="f-client" maxlength="80" placeholder="选填"></div>' +
          '<div class="form-row"><label for="f-contact">联系方式</label><input id="f-contact" maxlength="120" placeholder="选填"></div>' +
          '<div class="form-row"><label for="f-expected">预计签约时间</label><input type="date" id="f-expected"></div>' +
          '<div class="form-row">' +
            '<label for="f-channel">来源渠道</label>' +
            '<select id="f-channel">' + channelOptions('') + '</select>' +
            '<input id="f-channel-custom" aria-label="自定义来源渠道" class="hidden" style="margin-top:8px" maxlength="40" placeholder="填写渠道">' +
          '</div>' +
        '</section>' +
        '<button class="btn btn-primary btn-block" type="button" data-fact="create">创建项目</button>' +
      '</div>';
    layer.classList.remove('hidden');
    layer.scrollTop = 0;
    updateBodyLock();
    setTimeout(function () {
      const input = $('#f-name');
      if (input) input.focus();
    }, 60);
  }

  function closeForm() {
    $('#formLayer').classList.add('hidden');
    $('#formLayer').innerHTML = '';
    updateBodyLock();
  }

  function createProject() {
    const nameInput = $('#f-name');
    const name = nameInput.value.trim();
    const nameError = validateName(name, null);
    if (nameError) {
      toast(nameError);
      nameInput.focus();
      return;
    }
    const channelSelect = $('#f-channel').value;
    const channel = channelSelect === '其他' ? $('#f-channel-custom').value.trim() || '其他' : channelSelect;
    const now = nowISO();
    const project = normalizeProject({
      id: uid(),
      name: name,
      status: 'pending',
      clientName: $('#f-client').value.trim(),
      contactInfo: $('#f-contact').value.trim(),
      expectedSignDate: $('#f-expected').value || '',
      channel: channel,
      notes: [],
      createdAt: now,
      updatedAt: now
    });
    data.projects.push(project);
    if (!saveData()) {
      data.projects.pop();
      return;
    }
    closeForm();
    toast('项目已创建');
    renderAll();
  }

  /* ---------- 数据备份 ---------- */

  function readBackup() {
    let raw = null;
    try {
      raw = localStorage.getItem(BACKUP_KEY);
    } catch (e) {
      return null;
    }
    if (!raw) return null;
    try {
      const stored = JSON.parse(raw);
      if (!stored || typeof stored !== 'object') return null;
      let payload = stored.data;
      if (!payload && typeof stored.raw === 'string') {
        try {
          payload = JSON.parse(stored.raw);
        } catch (e) {
          payload = null;
        }
      }
      const snapshot = normalizeSnapshot(payload);
      if (!snapshot) return null;
      return { at: typeof stored.at === 'string' ? stored.at : '', snapshot: snapshot };
    } catch (e) {
      return null;
    }
  }

  function openDataModal() {
    const backup = readBackup();
    const backupSection = backup
      ? '<div class="settings-divider"></div>' +
        '<div class="form-hint">上次自动备份：' + esc(backup.at ? fmtDateTime(backup.at) : '时间未知') + '</div>' +
        '<button class="btn btn-outline btn-block" type="button" data-mact="restore" style="margin-top:8px">恢复上次自动备份</button>'
      : '';
    openModal(
      '<h3>数据与设置</h3>' +
      '<div class="form-row">' +
        '<label for="set-default-base">默认底薪（元）</label>' +
        '<input type="number" id="set-default-base" step="0.01" min="0" inputmode="decimal" placeholder="0" value="' + (data.settings.defaultBaseSalary == null ? '' : data.settings.defaultBaseSalary) + '">' +
        '<div class="form-hint">仅用于录入月度收入时预填，不会自动计入未录入的月份。</div>' +
      '</div>' +
      '<div class="settings-divider"></div>' +
      '<p class="modal-note">数据只保存在当前浏览器（localStorage）。换设备或清理浏览器数据前，请先导出备份。</p>' +
      backupSection +
      '<div style="display:flex;flex-direction:column;gap:10px;margin-top:14px">' +
        '<button class="btn btn-primary btn-block" type="button" data-mact="export">导出 JSON 备份</button>' +
        '<button class="btn btn-outline btn-block" type="button" data-mact="import">导入 JSON（覆盖当前数据）</button>' +
      '</div>' +
      '<input type="file" id="importFile" accept="application/json,.json" class="hidden">' +
      '<div class="modal-actions"><button class="btn btn-block" type="button" data-mact="cancel">关闭</button></div>'
    );

    $('#modalRoot').querySelector('[data-mact="cancel"]').addEventListener('click', closeModal);

    const restoreBtn = $('#modalRoot').querySelector('[data-mact="restore"]');
    if (restoreBtn) {
      restoreBtn.addEventListener('click', function () {
        const latest = readBackup();
        if (!latest) {
          toast('没有可恢复的备份');
          return;
        }
        const snapshot = latest.snapshot;
        if (
          !snapshot.projects.length &&
          !Object.keys(snapshot.incomes).length &&
          snapshot.settings.defaultBaseSalary == null
        ) {
          toast('备份内容为空，无需恢复');
          return;
        }
        showConfirm({
          title: '恢复上次自动备份',
          message:
            '将恢复 ' + snapshot.projects.length + ' 个项目、' + Object.keys(snapshot.incomes).length +
            ' 个月的收入记录，并覆盖当前数据。',
          okText: '恢复',
          danger: true,
          onOk: function () {
            const previous = data;
            data = {
              version: SCHEMA_VERSION,
              projects: snapshot.projects,
              incomes: snapshot.incomes,
              settings: snapshot.settings
            };
            if (!saveData()) {
              data = previous;
              return;
            }
            closeModal();
            renderAll();
            toast('已恢复上次自动备份');
          }
        });
      });
    }

    const defaultBaseInput = $('#set-default-base');
    defaultBaseInput.addEventListener('change', function () {
      const result = parseIncomeAmount(defaultBaseInput.value, '默认底薪');
      if (result.error) {
        toast(result.error);
        defaultBaseInput.value = data.settings.defaultBaseSalary == null ? '' : data.settings.defaultBaseSalary;
        return;
      }
      const previous = data.settings.defaultBaseSalary;
      data.settings.defaultBaseSalary = result.value > 0 ? result.value : null;
      if (!saveData()) {
        data.settings.defaultBaseSalary = previous;
        return;
      }
      toast(result.value > 0 ? '默认底薪已保存' : '默认底薪已清除');
    });

    $('#modalRoot').querySelector('[data-mact="export"]').addEventListener('click', function () {
      const payload = {
        app: '项目管家',
        version: SCHEMA_VERSION,
        exportedAt: nowISO(),
        projects: data.projects,
        incomes: data.incomes,
        settings: data.settings
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = '项目管家-备份-' + stamp() + '.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      toast('已导出备份');
    });

    const fileInput = $('#importFile');
    $('#modalRoot').querySelector('[data-mact="import"]').addEventListener('click', function () {
      fileInput.click();
    });
    fileInput.addEventListener('change', function () {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      fileInput.value = '';
      if (file.size > 5 * 1024 * 1024) {
        toast('导入失败：文件超过 5MB');
        return;
      }
      const reader = new FileReader();
      reader.onerror = function () {
        toast('导入失败：无法读取文件');
      };
      reader.onload = function () {
        let parsed;
        try {
          parsed = JSON.parse(String(reader.result));
        } catch (e) {
          toast('导入失败：文件不是有效的 JSON');
          return;
        }
        if (!parsed || !Array.isArray(parsed.projects)) {
          toast('导入失败：缺少 projects 数据');
          return;
        }
        const seen = {};
        const projects = parsed.projects.map(normalizeProject).filter(function (p) {
          if (!p.name) return false;
          if (seen[p.id]) p.id = uid();
          seen[p.id] = true;
          return true;
        });
        if (!projects.length) {
          toast('导入失败：备份中没有有效项目');
          return;
        }
        const hasIncomesField = Object.prototype.hasOwnProperty.call(parsed, 'incomes');
        const hasSettingsField = Object.prototype.hasOwnProperty.call(parsed, 'settings');
        const incomes = hasIncomesField ? normalizeIncomes(parsed.incomes) : data.incomes;
        const settings = hasSettingsField ? normalizeSettings(parsed.settings) : data.settings;
        const currentIncomeMonths = Object.keys(data.incomes).length;
        const incomingIncomeMonths = Object.keys(incomes).length;
        const incomeText = hasIncomesField
          ? '备份含 ' + incomingIncomeMonths + ' 个月收入记录，将替换当前 ' + currentIncomeMonths + ' 个月'
          : '备份不含收入数据，当前 ' + currentIncomeMonths + ' 个月收入记录会保留';
        let settingsText;
        if (hasSettingsField) {
          settingsText = settings.defaultBaseSalary == null
            ? '默认底薪将被清除'
            : '默认底薪将替换为 ' + money(settings.defaultBaseSalary);
        } else {
          settingsText = data.settings.defaultBaseSalary == null
            ? '默认底薪保持未设置'
            : '默认底薪保持 ' + money(data.settings.defaultBaseSalary);
        }
        closeModal();
        showConfirm({
          title: '导入备份',
          message:
            '将导入 ' + projects.length + ' 个项目，并覆盖当前 ' + data.projects.length + ' 个项目；' +
            incomeText + '；' + settingsText + '。当前数据会先自动暂存一份，可在“数据与设置”中恢复。',
          okText: '导入并覆盖',
          danger: true,
          onOk: function () {
            try {
              localStorage.setItem(BACKUP_KEY, JSON.stringify({ at: nowISO(), data: data }));
            } catch (e) {}
            const previous = data;
            data = { version: SCHEMA_VERSION, projects: projects, incomes: incomes, settings: settings };
            if (!saveData()) {
              data = previous;
              return;
            }
            renderAll();
            toast('已导入 ' + projects.length + ' 个项目');
          }
        });
      };
      reader.readAsText(file);
    });
  }

  /* ---------- 主题 ---------- */

  function themeMode() {
    return localStorage.getItem(THEME_KEY) || 'system';
  }

  function applyTheme() {
    const mode = themeMode();
    const dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const btn = $('#btnTheme');
    if (btn) {
      btn.innerHTML = mode === 'system' ? ICONS.auto : mode === 'light' ? ICONS.sun : ICONS.moon;
      btn.title = mode === 'system' ? '主题：跟随系统' : mode === 'light' ? '主题：浅色' : '主题：深色';
      btn.setAttribute('aria-label', btn.title);
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0f1115' : '#f6f7f9');
    if (state.view === 'stats') renderChart();
  }

  function cycleTheme() {
    const order = ['system', 'light', 'dark'];
    const next = order[(order.indexOf(themeMode()) + 1) % order.length];
    localStorage.setItem(THEME_KEY, next);
    applyTheme();
    toast(next === 'system' ? '主题：跟随系统' : next === 'light' ? '主题：浅色' : '主题：深色');
  }

  /* ---------- 视图 ---------- */

  const VIEW_IDS = { pending: 'viewPending', all: 'viewAll', stats: 'viewStats' };

  function switchView(view) {
    state.view = view;
    $$('.view').forEach(function (el) {
      el.classList.toggle('active', el.id === VIEW_IDS[view]);
    });
    $$('#tabbar .tab').forEach(function (btn) {
      const active = btn.dataset.view === view;
      btn.classList.toggle('active', active);
      if (active) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    const fab = $('#fab');
    fab.classList.toggle('hidden', view === 'stats');
    if (view === 'stats') {
      renderStats();
      requestAnimationFrame(function () {
        if (state.chart) state.chart.resize();
      });
    }
    window.scrollTo(0, 0);
  }

  function renderAll() {
    renderPending();
    renderAllList();
    if (state.view === 'stats') renderStats();
    const fab = $('#fab');
    fab.classList.toggle('hidden', state.view === 'stats');
  }

  /* ---------- 事件 ---------- */

  function onDocumentClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'open') {
      openDetail(el.dataset.id);
    } else if (action === 'quick-note') {
      openQuickNote(el.dataset.id);
    } else if (action === 'status') {
      openStatusModal(el.dataset.id);
    } else if (action === 'new-project') {
      openNewForm();
    } else if (action === 'prev-month') {
      const previousYear = state.statsMonth.slice(0, 4);
      state.statsMonth = addMonths(state.statsMonth, -1);
      if (state.statsMonth.slice(0, 4) !== previousYear) state.yearExpandedYear = null;
      renderStats();
    } else if (action === 'next-month') {
      const previousYear = state.statsMonth.slice(0, 4);
      state.statsMonth = addMonths(state.statsMonth, 1);
      if (state.statsMonth.slice(0, 4) !== previousYear) state.yearExpandedYear = null;
      renderStats();
    } else if (action === 'edit-income') {
      openIncomeModal(state.statsMonth);
    } else if (action === 'toggle-year') {
      state.yearExpandedYear = state.yearExpandedYear === state.statsMonth.slice(0, 4) ? null : state.statsMonth.slice(0, 4);
      renderStats();
    } else if (action === 'jump-month') {
      state.statsMonth = el.dataset.month;
      renderStats();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function openQuickNote(id) {
    const p = getProject(id);
    if (!p) return;
    openModal(
      '<h3>添加备注</h3>' +
      '<div class="form-row"><textarea id="m-note" aria-label="新增备注" rows="4" maxlength="1000" placeholder="记录跟进情况……"></textarea></div>' +
      '<div class="modal-actions">' +
        '<button class="btn btn-outline" type="button" data-mact="cancel">取消</button>' +
        '<button class="btn btn-primary" type="button" data-mact="save">保存</button>' +
      '</div>'
    );
    const textarea = $('#m-note');
    setTimeout(function () { textarea.focus(); }, 60);
    $('#modalRoot').querySelector('[data-mact="cancel"]').addEventListener('click', closeModal);
    $('#modalRoot').querySelector('[data-mact="save"]').addEventListener('click', function () {
      const content = textarea.value.trim();
      if (!content) {
        toast('备注内容不能为空');
        textarea.focus();
        return;
      }
      const current = getProject(id);
      if (!current) {
        closeModal();
        toast('项目已被删除');
        renderAll();
        return;
      }
      const now = nowISO();
      const previousUpdatedAt = current.updatedAt;
      current.notes.push({ id: uid(), content: content, createdAt: now, updatedAt: now });
      current.updatedAt = now;
      if (!saveData()) {
        current.notes.pop();
        current.updatedAt = previousUpdatedAt;
        return;
      }
      closeModal();
      toast('已添加备注');
      if (state.detailId === id) refreshNotes(current);
      else renderAll();
    });
  }

  function onDetailClick(e) {
    const el = e.target.closest('[data-dact]');
    if (!el) return;
    const action = el.dataset.dact;
    if (action === 'back') {
      closeDetail();
    } else if (action === 'status') {
      openStatusModal(state.detailId);
    } else if (action === 'save') {
      saveDetail();
    } else if (action === 'add-note') {
      addNote();
    } else if (action === 'edit-note') {
      const p = getProject(state.detailId);
      if (!p) return;
      state.editingNoteId = el.dataset.note;
      refreshNotes(p);
      const textarea = $('#d-note-edit');
      if (textarea) textarea.focus();
    } else if (action === 'cancel-edit-note') {
      const p = getProject(state.detailId);
      if (!p) return;
      state.editingNoteId = null;
      refreshNotes(p);
    } else if (action === 'save-note') {
      saveNote(el.dataset.note);
    } else if (action === 'del-note') {
      deleteNote(el.dataset.note);
    } else if (action === 'delete') {
      confirmDeleteProject();
    }
  }

  function onDetailChange(e) {
    if (e.target.id === 'd-channel') {
      const custom = $('#d-channel-custom');
      if (custom) custom.classList.toggle('hidden', e.target.value !== '其他');
    }
  }

  function onDetailInput(e) {
    if (e.target.id === 'd-amount' || e.target.id === 'd-rate') updateCommissionPreview();
  }

  function onFormClick(e) {
    const el = e.target.closest('[data-fact]');
    if (!el) return;
    if (el.dataset.fact === 'cancel') closeForm();
    else if (el.dataset.fact === 'create') createProject();
  }

  function onFormChange(e) {
    if (e.target.id === 'f-channel') {
      const custom = $('#f-channel-custom');
      if (custom) custom.classList.toggle('hidden', e.target.value !== '其他');
    }
  }

  function onGlobalKeydown(e) {
    if (e.key === 'Escape') {
      if ($('#confirmRoot').firstElementChild) closeConfirm();
      else if ($('#modalRoot').firstElementChild) closeModal();
      else if (!$('#formLayer').classList.contains('hidden')) closeForm();
      else if (!$('#detailLayer').classList.contains('hidden')) closeDetail();
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      const el = e.target.closest('[data-action]');
      if (el && el.tagName !== 'BUTTON' && el.getAttribute('role') === 'button') {
        e.preventDefault();
        el.click();
      }
    }
  }

  function bindEvents() {
    $('#btnTheme').addEventListener('click', cycleTheme);
    $('#btnData').addEventListener('click', openDataModal);
    $('#searchPending').addEventListener('input', function (e) {
      state.searchPending = e.target.value;
      renderPending();
    });
    $('#searchAll').addEventListener('input', function (e) {
      state.searchAll = e.target.value;
      renderAllList();
    });
    $('#statusChips').addEventListener('click', function (e) {
      const btn = e.target.closest('[data-status]');
      if (!btn) return;
      state.statusFilter = btn.dataset.status;
      $$('#statusChips .chip').forEach(function (chip) {
        const active = chip === btn;
        chip.classList.toggle('active', active);
        chip.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      renderAllList();
    });
    $('#tabbar').addEventListener('click', function (e) {
      const btn = e.target.closest('[data-view]');
      if (!btn) return;
      switchView(btn.dataset.view);
    });
    $('#fab').addEventListener('click', openNewForm);
    $('#detailLayer').addEventListener('click', onDetailClick);
    $('#detailLayer').addEventListener('change', onDetailChange);
    $('#detailLayer').addEventListener('input', onDetailInput);
    $('#formLayer').addEventListener('click', onFormClick);
    $('#formLayer').addEventListener('change', onFormChange);
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onGlobalKeydown);

    window.addEventListener('resize', function () {
      if (state.chart) state.chart.resize();
    });
    window.addEventListener('storage', function (e) {
      if (e.key !== STORE_KEY) return;
      data = loadData();
      renderAll();
      if (state.detailId) {
        if (!getProject(state.detailId)) {
          closeDetail();
          toast('当前项目已在其他标签页删除');
        } else {
          toast('其他标签页已更新数据，当前编辑内容未被覆盖');
        }
      }
    });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', applyTheme);
    else if (mq.addListener) mq.addListener(applyTheme);
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () {});
    });
  }

  function init() {
    applyTheme();
    bindEvents();
    renderAll();
    registerServiceWorker();
    if (data.corrupt) setTimeout(function () { toast('本地数据解析失败，原始数据已暂存'); }, 300);
  }

  init();
})();
