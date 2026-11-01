(function () {
  'use strict';

  const STORE_KEY = 'projectViewer.v1';
  const THEME_KEY = 'projectViewer.theme';
  const BACKUP_KEY = 'projectViewer.backup';
  const SCHEMA_VERSION = 1;
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
    chart: null
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

  function ymd(date) {
    const pad = function (n) { return String(n).padStart(2, '0'); };
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
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
    const pad = function (n) { return String(n).padStart(2, '0'); };
    return (
      d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
    );
  }

  function addMonths(ym, delta) {
    const parts = ym.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1 + delta, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function stamp() {
    const d = new Date();
    const pad = function (n) { return String(n).padStart(2, '0'); };
    return (
      d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes())
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

  function loadData() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORE_KEY);
      if (!raw) return { version: SCHEMA_VERSION, projects: [], corrupt: false };
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.projects)) throw new Error('bad shape');
      const seen = {};
      const projects = parsed.projects.map(normalizeProject).filter(function (p) {
        if (!p.name) return false;
        if (seen[p.id]) p.id = uid();
        seen[p.id] = true;
        return true;
      });
      return { version: SCHEMA_VERSION, projects: projects, corrupt: false };
    } catch (e) {
      if (raw) {
        try {
          localStorage.setItem(BACKUP_KEY, JSON.stringify({ at: nowISO(), raw: raw }));
        } catch (err) {}
      }
      return { version: SCHEMA_VERSION, projects: [], corrupt: true };
    }
  }

  function saveData() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ version: SCHEMA_VERSION, projects: data.projects }));
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
    if (!name) return '请填写项目名称';
    const lower = name.toLowerCase();
    const dup = data.projects.some(function (p) {
      return p.id !== excludeId && p.name.trim().toLowerCase() === lower;
    });
    return dup ? '项目名称已存在' : '';
  }

  function parseAmount(value) {
    const s = String(value == null ? '' : value).trim();
    if (!s) return { error: '请填写签约金额' };
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return { error: '签约金额最多两位小数' };
    const n = Number(s);
    if (!isFinite(n) || n <= 0) return { error: '签约金额必须大于 0' };
    return { value: n };
  }

  function parseRate(value) {
    const s = String(value == null ? '' : value).trim();
    if (!s) return { error: '请填写佣金比例' };
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return { error: '佣金比例最多两位小数' };
    const n = Number(s);
    if (!isFinite(n) || n < 0 || n > 100) return { error: '佣金比例需在 0–100 之间' };
    return { value: n };
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
      !!$('#modalRoot').firstElementChild;
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

  function showConfirm(opts) {
    openModal(
      '<h3>' + esc(opts.title) + '</h3>' +
      '<p class="modal-note">' + esc(opts.message) + '</p>' +
      '<div class="modal-actions">' +
        '<button class="btn btn-outline" type="button" data-mact="cancel">取消</button>' +
        '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" type="button" data-mact="ok">' + esc(opts.okText || '确定') + '</button>' +
      '</div>'
    );
    $('#modalRoot').querySelector('[data-mact="cancel"]').addEventListener('click', closeModal);
    $('#modalRoot').querySelector('[data-mact="ok"]').addEventListener('click', function () {
      closeModal();
      if (typeof opts.onOk === 'function') opts.onOk();
    });
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
    return {
      amount: Math.round(amount * 100) / 100,
      commission: Math.round(commissionTotal * 100) / 100,
      count: count
    };
  }

  function renderStats() {
    const ym = state.statsMonth;
    const year = Number(ym.slice(0, 4));
    const month = Number(ym.slice(5, 7));
    $('#monthLabel').textContent = year + '年' + month + '月';

    const current = monthStats(ym);
    $('#statCards').innerHTML =
      '<div class="stat-card"><div class="stat-label">签约金额</div><div class="stat-value amount">' + money(current.amount) + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">佣金</div><div class="stat-value commission">' + money(current.commission) + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">签约项目</div><div class="stat-value count">' + current.count + ' 个</div></div>';

    const monthProjects = data.projects
      .filter(function (p) { return p.status === 'signed' && p.signDate && p.signDate.slice(0, 7) === ym; })
      .sort(function (a, b) { return String(b.signDate).localeCompare(String(a.signDate)); });

    $('#monthListCount').textContent = monthProjects.length ? monthProjects.length + ' 个' : '';
    $('#monthList').innerHTML = monthProjects.length
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

    const yearKey = String(year);
    const yearProjects = data.projects.filter(function (p) {
      return p.status === 'signed' && p.signDate && p.signDate.slice(0, 4) === yearKey;
    });
    let yearAmount = 0;
    let yearCommission = 0;
    yearProjects.forEach(function (p) {
      yearAmount += Number(p.amount) || 0;
      yearCommission += commission(p);
    });
    yearAmount = Math.round(yearAmount * 100) / 100;
    yearCommission = Math.round(yearCommission * 100) / 100;

    $('#yearTotalCard').innerHTML =
      '<div class="card-title-row"><h3>' + year + ' 年累计</h3><span class="muted small">' + yearProjects.length + ' 个签约项目</span></div>' +
      '<div class="year-total-grid">' +
        '<div class="year-total-item"><div class="label">签约金额</div><div class="value" style="color:var(--primary-strong)">' + money(yearAmount) + '</div></div>' +
        '<div class="year-total-item"><div class="label">佣金</div><div class="value" style="color:var(--success)">' + money(yearCommission) + '</div></div>' +
        '<div class="year-total-item"><div class="label">签约项目</div><div class="value">' + yearProjects.length + ' 个</div></div>' +
      '</div>';

    $('#yearTableTitle').textContent = year + ' 年各月汇总';
    const rows = [];
    for (let i = 1; i <= 12; i += 1) {
      const key = year + '-' + String(i).padStart(2, '0');
      const stats = monthStats(key);
      rows.push(
        '<tr data-action="jump-month" tabindex="0" data-month="' + key + '"' + (key === ym ? ' class="active"' : '') + '>' +
          '<td>' + i + ' 月</td>' +
          '<td>' + stats.count + '</td>' +
          '<td>' + money(stats.amount) + '</td>' +
          '<td>' + money(stats.commission) + '</td>' +
        '</tr>'
      );
    }
    rows.push(
      '<tr class="total"><td>合计</td><td>' + yearProjects.length + '</td><td>' + money(yearAmount) + '</td><td>' + money(yearCommission) + '</td></tr>'
    );
    $('#yearTable').innerHTML =
      '<thead><tr><th>月份</th><th>签约数</th><th>金额</th><th>佣金</th></tr></thead><tbody>' + rows.join('') + '</tbody>';

    renderChart();
  }

  function renderChart() {
    if (state.view !== 'stats') return;
    if (typeof echarts === 'undefined') return;
    const el = $('#trendChart');
    if (!el) return;

    const months = [];
    for (let i = 11; i >= 0; i -= 1) months.push(addMonths(state.statsMonth, -i));
    const amounts = months.map(function (mo) { return monthStats(mo).amount; });
    const commissions = months.map(function (mo) { return monthStats(mo).commission; });
    const labels = months.map(function (mo) { return Number(mo.slice(5, 7)) + '月'; });

    const cs = getComputedStyle(document.documentElement);
    const textColor = cs.getPropertyValue('--text').trim();
    const muted = cs.getPropertyValue('--muted').trim();
    const border = cs.getPropertyValue('--border').trim();
    const primary = cs.getPropertyValue('--primary').trim();
    const success = cs.getPropertyValue('--success').trim();

    if (!state.chart) state.chart = echarts.init(el);
    state.chart.setOption(
      {
        backgroundColor: 'transparent',
        color: [primary, success],
        grid: { left: 4, right: 8, top: 34, bottom: 2, containLabel: true },
        tooltip: {
          trigger: 'axis',
          backgroundColor: 'rgba(24,27,33,.94)',
          borderWidth: 0,
          textStyle: { color: '#fff', fontSize: 12 },
          formatter: function (params) {
            const idx = params && params[0] ? params[0].dataIndex : 0;
            return (
              labels[idx] +
              '<br/>签约金额：' + money(amounts[idx]) +
              '<br/>佣金：' + money(commissions[idx])
            );
          }
        },
        legend: {
          top: 0,
          right: 0,
          itemWidth: 12,
          itemHeight: 8,
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
          }
        ]
      },
      true
    );
    state.chart.resize();
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
          '<div class="form-row"><label for="d-name">项目名称 *</label><input id="d-name" maxlength="80" value="' + esc(p.name) + '"></div>' +
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
          '<div class="form-row"><label for="f-name">项目名称 *</label><input id="f-name" maxlength="80" placeholder="例如：XX 品牌年度合作"></div>' +
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

  function openDataModal() {
    openModal(
      '<h3>数据备份</h3>' +
      '<p class="modal-note">数据只保存在当前浏览器（localStorage）。换设备或清理浏览器数据前，请先导出备份。</p>' +
      '<div style="display:flex;flex-direction:column;gap:10px;margin-top:14px">' +
        '<button class="btn btn-primary btn-block" type="button" data-mact="export">导出 JSON 备份</button>' +
        '<button class="btn btn-outline btn-block" type="button" data-mact="import">导入 JSON（覆盖当前数据）</button>' +
      '</div>' +
      '<input type="file" id="importFile" accept="application/json,.json" class="hidden">' +
      '<div class="modal-actions"><button class="btn btn-block" type="button" data-mact="cancel">关闭</button></div>'
    );

    $('#modalRoot').querySelector('[data-mact="cancel"]').addEventListener('click', closeModal);

    $('#modalRoot').querySelector('[data-mact="export"]').addEventListener('click', function () {
      const payload = {
        app: '项目管家',
        version: SCHEMA_VERSION,
        exportedAt: nowISO(),
        projects: data.projects
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
        closeModal();
        showConfirm({
          title: '导入备份',
          message: '将导入 ' + projects.length + ' 个项目，并覆盖当前 ' + data.projects.length + ' 个项目。当前数据会先自动暂存一份。',
          okText: '导入并覆盖',
          danger: true,
          onOk: function () {
            try {
              localStorage.setItem(BACKUP_KEY, JSON.stringify({ at: nowISO(), data: data }));
            } catch (e) {}
            const previous = data;
            data = { version: SCHEMA_VERSION, projects: projects };
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
    renderStats();
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
      state.statsMonth = addMonths(state.statsMonth, -1);
      renderStats();
    } else if (action === 'next-month') {
      state.statsMonth = addMonths(state.statsMonth, 1);
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
      if ($('#modalRoot').firstElementChild) closeModal();
      else if (!$('#formLayer').classList.contains('hidden')) closeForm();
      else if (!$('#detailLayer').classList.contains('hidden')) closeDetail();
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      const el = e.target.closest('[data-action]');
      if (el && el.tagName !== 'BUTTON' && (el.getAttribute('role') === 'button' || el.tagName === 'TR')) {
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
