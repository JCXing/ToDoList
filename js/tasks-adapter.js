/**
 * 任务跟踪台 · 运行时适配层
 *
 * 原工作台运行在 WorkBuddy 资料库里，通过 window.__SMART_PAGE__.database 读写在线数据表。
 * 这里用同一套接口签名，把它接到「知栖」自己的云服务数据库（tasks 表），
 * 因此工作台本身的页面与交互代码一行都不用改。
 *
 * 表字段：name / status / priority / category / due_date / delay_reason
 *        / tags / done_at / detail / images
 * 页面侧仍使用中文属性名，读写时在此处做映射。
 */
(function () {
  'use strict';

  /* Supabase 版：会话由 js/cloud.js 镜像到这个键（见 cloud.js 的 mirrorSession） */
  var cfg = {
    publishableKey: 'supabase',
  };

  var DATABASE_ID = 'M3smumYeSxQgh0nzPuiO13'; // 与页面内常量保持一致，仅作为标识
  var SESSION_KEY = 'workbuddy-cloud.session.' + cfg.publishableKey;
  var SEED_FLAG = 'zhiqi.tasks.seeded.' + cfg.publishableKey;
  var REAUTH_FLAG = 'zhiqi.tasks.reauth';

  /* --------------------------- 登录态 --------------------------- */

  function readSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      return s && s.accessToken ? s : null;
    } catch (e) {
      return null;
    }
  }

  var session = null;
  var cloud = null;
  var db = null;
  var started = false;

  /* --------------------------- 字段映射 --------------------------- */

  var PROP = {
    name: '任务名称',
    status: '状态',
    priority: '优先级',
    category: '分类',
    due: '截止日期',
    delay: '延迟原因',
    tags: '标签',
    done: '完成时间',
    detail: '详情',
    images: '详情图片',
    nextAction: '下一步动作',
    sourceIdea: '来源想法',
    delayCount: '延期次数',
    delayLog: '延期记录',
    firstDue: '首次截止日',
  };

  var COLUMN = {
    [PROP.name]: 'name',
    [PROP.status]: 'status',
    [PROP.priority]: 'priority',
    [PROP.category]: 'category',
    [PROP.due]: 'due_date',
    [PROP.delay]: 'delay_reason',
    [PROP.tags]: 'tags',
    [PROP.done]: 'done_at',
    [PROP.detail]: 'detail',
    [PROP.images]: 'images',
    [PROP.nextAction]: 'next_action',
    [PROP.sourceIdea]: 'source_idea',
    [PROP.delayCount]: 'delay_count',
    [PROP.delayLog]: 'delay_log',
    [PROP.firstDue]: 'first_due',
  };

  var OPTIONS = {
    [PROP.status]: ['待办', '进行中', '已延期', '已完成'],
    [PROP.priority]: ['P0 紧急', 'P1 高', 'P2 中', 'P3 低'],
    [PROP.category]: ['工作', '学习', '生活', '其他'],
  };

  var DEFAULT_COLUMN = {
    name: '',
    status: '待办',
    priority: 'P2 中',
    category: '其他',
    due_date: null,
    delay_reason: '',
    tags: '',
    done_at: '',
    detail: '',
    images: [],
    next_action: '',
    source_idea: null,
    delay_count: 0,
    delay_log: '',
    first_due: null,
    // 老任务在前，补上首次截止日的时候用得到
    created_at: null,
    updated_at: null,
  };

  /** 页面写的属性值（{text}/{select}/{date}/{attachment}）→ 列值 */
  function propValue(v) {
    if (v == null) return '';
    if (typeof v === 'string' || typeof v === 'number') return v;
    if (Array.isArray(v)) return v;
    if (typeof v === 'object') {
      if (v.text != null) return v.text;
      if (v.select != null) return v.select;
      if (v.date != null) return v.date;
      if (v.attachment != null) return v.attachment;
      if (v.number != null) return v.number;
    }
    return '';
  }

  function toRow(properties) {
    var row = {};
    Object.keys(properties || {}).forEach(function (prop) {
      var column = COLUMN[prop];
      if (!column) return;
      row[column] = propValue(properties[prop]);
    });
    if (row.due_date === '' ) row.due_date = null;
    if (row.images && !Array.isArray(row.images)) row.images = [];
    if (row.source_idea !== undefined) {
      var n = Number(row.source_idea);
      row.source_idea = (row.source_idea === '' || row.source_idea == null || isNaN(n)) ? null : n;
    }
    if (row.delay_count !== undefined) {
      var c = Number(row.delay_count);
      row.delay_count = isNaN(c) ? 0 : c;
    }
    if (row.delay_log !== undefined && typeof row.delay_log !== 'string') {
      row.delay_log = row.delay_log == null ? '' : String(row.delay_log);
    }
    if (row.first_due === '') row.first_due = null;
    return row;
  }

  function toProperties(row) {
    var out = {
      _id: String(row.id),
      [PROP.name]: row.name || '',
      [PROP.status]: row.status || '待办',
      [PROP.priority]: row.priority || 'P2 中',
      [PROP.category]: row.category || '其他',
      [PROP.due]: row.due_date || '',
      [PROP.delay]: row.delay_reason || '',
      [PROP.tags]: row.tags || '',
      [PROP.done]: row.done_at || '',
      [PROP.detail]: row.detail || '',
      [PROP.images]: Array.isArray(row.images) ? row.images : [],
      [PROP.nextAction]: row.next_action || '',
      [PROP.sourceIdea]: row.source_idea == null ? '' : String(row.source_idea),
      [PROP.delayCount]: row.delay_count || 0,
      [PROP.delayLog]: row.delay_log || '',
      [PROP.firstDue]: row.first_due || '',
    };
    return out;
  }

  function fail(error, fallback) {
    var e = new Error((error && (error.message || error.error_description)) || fallback || '云端请求失败');
    e.raw = error;
    return e;
  }

  var leaving = false;
  var recovering = false;

  function isAuthError(error) {
    var text = String((error && (error.message || error.error_description)) || '');
    var code = String((error && (error.code || error.status)) || '');
    return /401|JWT|token/i.test(text) || /401|PGRST301/.test(code);
  }

  /** 交给主应用续期一次；续上了就用新令牌重放请求，不必打断用户 */
  function tryRecover() {
    var fn = window.__zhiqiAuthRecover__;
    if (!fn) return Promise.resolve(false);
    return Promise.resolve()
      .then(fn)
      .then(function (ok) {
        return !!ok;
      })
      .catch(function () {
        return false;
      });
  }

  /** op 是一次云端读写；遇到 401 先自救，再原样重放一次 */
  function run(op) {
    return Promise.resolve()
      .then(op)
      .then(function (res) {
        if (!res || !res.error || !isAuthError(res.error)) return res;
        if (recovering) return res;
        recovering = true;
        return tryRecover().then(function (ok) {
          recovering = false;
          if (!ok) return res;
          return Promise.resolve().then(op).then(function (again) {
            return again || res;
          });
        }, function () {
          recovering = false;
          return res;
        });
      });
  }

  function authExpired(error) {
    if (!leaving) {
      leaving = true;
      try {
        window.dispatchEvent(new CustomEvent('zhiqi:auth-expired', { detail: { scope: 'tasks' } }));
      } catch (err) {
        /* 忽略 */
      }
    }
    // 挂起这次请求：主应用会先尝试续期，续不上才会回到登录页
    return new Promise(function () {});
  }

  /** 登录态失效时回到登录页，而不是静默退化成「离线模式」 */
  function guard(error) {
    var e = fail(error, '云端请求失败');
    if (isAuthError(error)) return authExpired(error);
    throw e;
  }

  /* --------------------------- 首次导入 --------------------------- */

  var seeding = null;

  function seedOnce() {
    if (seeding) return seeding;
    seeding = (function () {
      try {
        if (localStorage.getItem(SEED_FLAG) === '1') return Promise.resolve();
      } catch (e) {
        /* 忽略：读不到标记就按未导入处理 */
      }
      return run(function () {
        return db.from('tasks').select('id').limit(1);
      }).then(function (res) {
          if (res.error) return guard(res.error);
          if (res.data && res.data.length) {
            localStorage.setItem(SEED_FLAG, '1');
            return null;
          }
          return fetch('data/tasks-seed.json', { cache: 'no-store' })
            .then(function (r) {
              if (!r.ok) throw new Error('种子数据读取失败');
              return r.json();
            })
            .then(function (list) {
              var rows = list.map(function (t) {
                var row = Object.assign({}, DEFAULT_COLUMN, t, {
                  owner_name: (session.user && session.user.name) || null,
                  images: [],
                });
                // Supabase/Postgres：显式插 NULL 不会走列默认值，会触发非空约束（23502）
                delete row.created_at;
                delete row.updated_at;
                return row;
              });
              return run(function () {
                return db.from('tasks').insert(rows);
              }).then(function (r2) {
                if (r2.error) return guard(r2.error);
                localStorage.setItem(SEED_FLAG, '1');
              });
            });
        })
        .catch(function (error) {
          seeding = null; // 失败后允许下次重试
          throw error;
        });
    })();
    return seeding;
  }

  /* --------------------------- 图片附件 --------------------------- */

  function extOf(name, type) {
    var m = /\.([a-zA-Z0-9]{2,5})$/.exec(name || '');
    if (m) return m[1].toLowerCase();
    if (type === 'image/jpeg') return 'jpg';
    if (type === 'image/png') return 'png';
    if (type === 'image/webp') return 'webp';
    if (type === 'image/gif') return 'gif';
    return 'png';
  }

  function uid() {
    return (session.user && session.user.id) || 'anon';
  }

  var urlCache = {};

  /* --------------------------- 适配对象 --------------------------- */

  var SMART_PAGE = {
    databaseId: DATABASE_ID,
    database: {
      getSchema: function () {
        var properties = [
          { id: 'name', name: PROP.name, type: 'text' },
          { id: 'status', name: PROP.status, type: 'select', config: { options: [] } },
          { id: 'priority', name: PROP.priority, type: 'select', config: { options: [] } },
          { id: 'category', name: PROP.category, type: 'select', config: { options: [] } },
          { id: 'due', name: PROP.due, type: 'date' },
          { id: 'delay', name: PROP.delay, type: 'text' },
          { id: 'tags', name: PROP.tags, type: 'text' },
          { id: 'done', name: PROP.done, type: 'text' },
          { id: 'detail', name: PROP.detail, type: 'text' },
          { id: 'images', name: PROP.images, type: 'attachment' },
          { id: 'nextAction', name: PROP.nextAction, type: 'text' },
          { id: 'sourceIdea', name: PROP.sourceIdea, type: 'text' },
          { id: 'delayCount', name: PROP.delayCount, type: 'text' },
          { id: 'delayLog', name: PROP.delayLog, type: 'text' },
          { id: 'firstDue', name: PROP.firstDue, type: 'date' },
        ];
        properties.forEach(function (p) {
          if (OPTIONS[p.name]) {
            p.config = {
              options: OPTIONS[p.name].map(function (t) {
                return { id: t, text: t };
              }),
            };
          }
        });
        return Promise.resolve({ id: DATABASE_ID, title: '个人任务跟踪', properties: properties });
      },

      query: function () {
        return seedOnce()
          .then(function () {
            return run(function () {
              return db.from('tasks').select('*').order('created_at', { ascending: true });
            });
          })
          .then(function (res) {
            if (res.error) return guard(res.error);
            return {
              results: (res.data || []).map(toProperties),
              hasMore: false,
              nextCursor: null,
            };
          });
      },

      addRecord: function (payload) {
        var row = toRow(payload && payload.properties);
        if (!row.name) row.name = '未命名任务';
        row.owner_name = (session.user && session.user.name) || null;
        return seedOnce()
          .then(function () {
            return run(function () {
              return db.from('tasks').insert(row).select();
            });
          })
          .then(function (res) {
            if (res.error) return guard(res.error);
            var saved = Array.isArray(res.data) ? res.data[0] : res.data;
            return { id: String(saved.id), _id: String(saved.id) };
          });
      },

      updateRecord: function (payload) {
        var row = toRow(payload && payload.properties);
        row.updated_at = new Date().toISOString();
        return run(function () {
          return db
            .from('tasks')
            .update(row)
            .eq('id', payload.recordId)
            .select();
        }).then(function (res) {
            if (res.error) return guard(res.error);
            if (!res.data || !res.data.length) throw new Error('任务不存在或无权修改');
            return { id: String(payload.recordId) };
          });
      },

      deleteRecord: function (payload) {
        return run(function () {
          return db
            .from('tasks')
            .delete()
            .eq('id', payload.recordId)
            .select();
        }).then(function (res) {
            if (res.error) return guard(res.error);
            return { id: String(payload.recordId) };
          });
      },

      /** 云端暂无推送通道，返回取消函数即可，页面会退化成本地即时刷新 */
      onUpdated: function () {
        return function () {};
      },

      uploadFile: function (payload) {
        var file = payload && payload.file;
        if (!file) return Promise.reject(new Error('没有选择文件'));
        var path = cloud.storage.userPath(
          uid(),
          'tasks/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + extOf(file.name, file.type),
        );
        return cloud.storage
          .upload(path, file, { contentType: file.type || 'image/png', upsert: true })
          .then(function () {
            return {
              attachmentId: path,
              name: file.name || '图片',
              fileType: file.type || '',
              fileSize: file.size || 0,
              mediaType: 'image',
            };
          })
          .catch(function (error) {
            throw fail(error, '图片上传失败');
          });
      },

      getPreviewUrl: function (payload) {
        var id = payload && payload.attachmentId;
        if (!id) return Promise.resolve({ previewUrl: '', thumbnailUrl: '' });
        if (urlCache[id]) return Promise.resolve({ previewUrl: urlCache[id], thumbnailUrl: urlCache[id] });
        return cloud.storage
          .download(id)
          .then(function (res) {
            var blob = res instanceof Blob ? res : res && res.data;
            if (!blob) return { previewUrl: '', thumbnailUrl: '' };
            var url = URL.createObjectURL(blob);
            urlCache[id] = url;
            return { previewUrl: url, thumbnailUrl: url };
          })
          .catch(function () {
            return { previewUrl: '', thumbnailUrl: '' };
          });
      },
    },
  };

  /* --------------------------- 对外入口 --------------------------- */

  /**
   * 由主应用在登录成功后调用：装配 __SMART_PAGE__，之后才能加载 js/tasks-page.js，
   * 否则工作台会因为没有数据通道而退化成「离线缓存」模式。
   */
  function start() {
    if (started) return true;
    session = readSession();
    if (!session) return false;
    // Supabase 版：共享客户端由 js/cloud.js（模块）在启动时挂到 window 上
    var shared = window.__zhiqiCloud__;
    if (!shared) return false;
    cloud = shared;
    db = cloud.database;
    window.__SMART_PAGE__ = SMART_PAGE;
    started = true;
    return true;
  }

  window.TaskAdapter = {
    start: start,
    isStarted: function () {
      return started;
    },
  };
})();
