// TimeLane Data Editor
(function () {
  'use strict';

  // ── DOM refs ──────────────────────────────────────────────
  const previewArea = document.getElementById('preview-area');
  const previewCanvas = document.getElementById('preview-canvas');
  const configPanel = document.getElementById('config-panel');
  const dataPanel = document.getElementById('data-panel');
  const dataTbody = document.getElementById('data-tbody');
  const tabConfig = document.getElementById('tab-config');
  const tabData = document.getElementById('tab-data');
  const infoStats = document.getElementById('info-stats');
  const propsOverlay = document.getElementById('props-overlay');
  const propsList = document.getElementById('props-list');
  const tooltip = document.getElementById('tooltip');

  // ── Defaults ──────────────────────────────────────────────
  const DEFAULT_THEME = {
    backgroundColor: '#1a1a2e', labelBgColor: '#16162a',
    channelBgColor: '#1b1c30', channelBgAltColor: '#1d1e32',
    groupHeaderBgColor: 'rgba(255,255,255,0.05)', groupHeaderTextColor: '#ddd',
    baselineColor: 'rgba(255,255,255,0.12)', timeAxisColor: '#888',
    timeTextColor: '#aaa', timeTickColor: 'rgba(255,255,255,0.15)',
    headerTitleColor: '#eee', headerDescColor: '#999', footerColor: '#666',
    gridLineColor: 'rgba(255,255,255,0.04)', eventMarkerColor: '#FF6B6B',
    hoverBorderColor: '#fff', labelSeparatorColor: 'rgba(255,255,255,0.08)',
  };

  function blankConfig() {
    return {
      channelHeight: 100, channelGap: 2, headerHeight: 34, footerHeight: 16,
      groupHeaderHeight: 28, chartTitle: '', chartTitleHeight: 32,
      labelWidth: 140, timeAxisHeight: 48, defaultBlockColor: '#4A90D9',
      minBlockHeightPx: 2, minBlockWidthPx: 2,
      fontFamily: "'Microsoft YaHei', 'PingFang SC', sans-serif",
      timeFontSize: 12, blockFontSize: 12, eventFontSize: 10,
      timeFormat: 'HH:mm', showGridLines: true, showCurrentTimeLine: false,
      showEvents: true, blockTextPosition: 'center', blockTextShow: true,
      zoomMin: 0.05, zoomMax: 50, exportScale: 2,
      blockBorderRadius: 3, blockBorderWidth: 0, blockBorderColor: 'rgba(0,0,0,0.2)',
      theme: { ...DEFAULT_THEME },
    };
  }

  function blankData() {
    var now = new Date();
    var start1 = new Date(now.getTime() - 3600000);
    var end1 = new Date(now.getTime() - 1800000);
    var start2 = new Date(now.getTime() - 1800000);
    var end2 = now;
    function iso(d) { return d.toISOString(); }
    return {
      groups: [{
        title: '群组 1', description: '',
        channels: [{
          title: '通道 1', description: '', footer: '',
          blocks: [
            { start: iso(start1), end: iso(end1), heightPercent: 40,
              color: '#4A90D9', text: '事项 A', textConfig: { show: true }, properties: null },
            { start: iso(start2), end: iso(end2), heightPercent: 80,
              color: '#FF6B6B', text: '事项 B', textConfig: { show: true }, properties: null },
          ],
          events: [
            { time: iso(new Date(now.getTime() - 600000)), text: '标记事件', color: '#FF6B6B' },
          ],
        }],
      }],
      config: blankConfig(),
    };
  }

  // ── State ─────────────────────────────────────────────────
  let data = blankData();
  let flatRows = [];         // [{ gIdx, cIdx, type:'B'|'E', ... }]
  let propsEditing = null;   // { rowIdx, propsObj }
  let selectedRowIdx = -1;
  let sortCol = '';
  let sortDir = '';
  let filters = { group: '', channel: '', type: '', start: '', end: '', text: '', tshow: '' };
  let dirty = false;

  function resetFilters() {
    sortCol = ''; sortDir = '';
    filters = { group: '', channel: '', type: '', start: '', end: '', text: '', tshow: '' };
  }

  // ── Chart ─────────────────────────────────────────────────
  let chart = null;

  function initChart() {
    chart = new TimelineChart(previewCanvas, {
      onTimeChange: function () {},
      onHover: function (block) {
        if (!block) {
          tooltip.classList.remove('visible');
          return;
        }
        var name = block.text || '未知事项';
        var startStr = formatTimeShort(block.start);
        var endStr = formatTimeShort(block.end);
        var html = '<div class="tt-title">' + esc(name) + '</div>';
        html += '<div class="tt-row"><span class="tt-label">时间</span><span class="tt-value">' + startStr + ' - ' + endStr + '</span></div>';
        if (block._groupTitle) {
          html += '<div class="tt-row"><span class="tt-label">组</span><span class="tt-value">' + esc(block._groupTitle) + '</span></div>';
        }
        if (block.properties) {
          var keys = Object.keys(block.properties);
          for (var pi = 0; pi < keys.length; pi++) {
            var k = keys[pi];
            html += '<div class="tt-row"><span class="tt-label">' + esc(k) + '</span><span class="tt-value">' + esc(String(block.properties[k])) + '</span></div>';
          }
        }
        tooltip.innerHTML = html;
        tooltip.classList.add('visible');
      },
      onClick: function (block) {
        if (!block || !block._channel) return;
        var ch = block._channel;
        var gTitle = ch._groupTitle || '';
        var cTitle = ch.title || '';
        // Find matching row in flatRows
        buildFlatRows();
        for (var i = 0; i < flatRows.length; i++) {
          var r = flatRows[i];
          if (r.type !== 'B') continue;
          if (r.start !== block.start || r.end !== block.end) continue;
          if ((r.group || '').trim() !== gTitle) continue;
          if ((r.channel || '').trim() !== cTitle) continue;
          // Match found - select row and scroll into view
          if (!tabData.classList.contains('active')) showTab('data');
          selectRow(i);
          var rowEl = dataTbody.querySelector('tr[data-row="' + i + '"]');
          if (rowEl) rowEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          return;
        }
      },
    });
  }

  function refreshPreview() {
    if (!chart) return;
    var savedViewStart = chart.viewStart;
    var savedViewEnd = chart.viewEnd;
    var payload = {
      groups: JSON.parse(JSON.stringify(data.groups)),
      config: JSON.parse(JSON.stringify(data.config)),
    };
    chart.loadData(payload);
    if (savedViewStart != null && payload.groups.length > 0) {
      chart.viewStart = savedViewStart;
      chart.viewEnd = savedViewEnd;
      chart.render();
    }
    updateStats();
  }

  let refreshTimer = 0;
  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshPreview, 300);
    dirty = true;
  }

  function updateStats() {
    if (!chart) return;
    const g = chart.totalGroupCount;
    const c = chart.totalChannelCount;
    const b = chart.totalBlockCount;
    let e = 0;
    for (const grp of data.groups) {
      for (const ch of grp.channels || []) {
        e += (ch.events || []).length;
      }
    }
    infoStats.textContent = g + ' 组 · ' + c + ' 通道 · ' + b + ' 色块 · ' + e + ' 事件';
  }

  // ── Tab switching ─────────────────────────────────────────
  function showTab(name) {
    if (name === 'config') {
      tabConfig.classList.add('active');
      tabData.classList.remove('active');
      configPanel.style.display = '';
      dataPanel.style.display = 'none';
      renderConfigTable();
    } else {
      tabConfig.classList.remove('active');
      tabData.classList.add('active');
      configPanel.style.display = 'none';
      dataPanel.style.display = '';
      renderDataTable();
    }
  }

  tabConfig.addEventListener('click', function () { showTab('config'); });
  tabData.addEventListener('click', function () { showTab('data'); });

  // ── Config table ──────────────────────────────────────────
  const CONFIG_SPEC = [
    { sec: '基础', key: 'chartTitle', label: '图表标题', type: 'text' },
    { sec: '基础', key: 'timeFormat', label: '时间格式', type: 'select', opts: ['HH:mm', 'HH:mm:ss', 'MM-DD HH:mm', 'YYYY-MM-DD'] },
    { sec: '基础', key: 'labelWidth', label: '标签宽度', type: 'range', min: 60, max: 300, step: 1 },
    { sec: '通道', key: 'channelHeight', label: '通道高度', type: 'range', min: 20, max: 400, step: 1 },
    { sec: '通道', key: 'channelGap', label: '通道间距', type: 'range', min: 0, max: 20, step: 1 },
    { sec: '通道', key: 'headerHeight', label: '头部高度', type: 'range', min: 10, max: 80, step: 1 },
    { sec: '通道', key: 'footerHeight', label: '底部高度', type: 'range', min: 0, max: 40, step: 1 },
    { sec: '通道', key: 'groupHeaderHeight', label: '分组头高度', type: 'range', min: 10, max: 60, step: 1 },
    { sec: '通道', key: 'chartTitleHeight', label: '标题区高度', type: 'range', min: 10, max: 60, step: 1 },
    { sec: '时间轴', key: 'timeAxisHeight', label: '时间轴高度', type: 'range', min: 24, max: 80, step: 1 },
    { sec: '时间轴', key: 'showGridLines', label: '显示网格线', type: 'bool' },
    { sec: '时间轴', key: 'showCurrentTimeLine', label: '显示当前时间线', type: 'bool' },
    { sec: '时间轴', key: 'timeFontSize', label: '时间字号', type: 'range', min: 8, max: 24, step: 1 },
    { sec: '色块', key: 'blockTextShow', label: '显示色块文字', type: 'bool' },
    { sec: '色块', key: 'blockTextPosition', label: '文字位置', type: 'select', opts: ['center', 'top', 'bottom', 'above'] },
    { sec: '色块', key: 'defaultBlockColor', label: '默认色块颜色', type: 'color' },
    { sec: '色块', key: 'blockFontSize', label: '色块字号', type: 'range', min: 6, max: 24, step: 1 },
    { sec: '色块', key: 'blockBorderRadius', label: '圆角半径', type: 'range', min: 0, max: 20, step: 1 },
    { sec: '色块', key: 'blockBorderWidth', label: '边框宽度', type: 'range', min: 0, max: 6, step: 1 },
    { sec: '色块', key: 'blockBorderColor', label: '边框颜色', type: 'color' },
    { sec: '色块', key: 'minBlockHeightPx', label: '最小色块高(px)', type: 'range', min: 0, max: 10, step: 1 },
    { sec: '色块', key: 'minBlockWidthPx', label: '最小色块宽(px)', type: 'range', min: 0, max: 10, step: 1 },
    { sec: '事件', key: 'showEvents', label: '显示事件', type: 'bool' },
    { sec: '事件', key: 'eventFontSize', label: '事件字号', type: 'range', min: 6, max: 24, step: 1 },
    { sec: '高级', key: 'fontFamily', label: '字体', type: 'text' },
    { sec: '高级', key: 'zoomMin', label: '最小缩放', type: 'number', step: 0.01 },
    { sec: '高级', key: 'zoomMax', label: '最大缩放', type: 'number', step: 1 },
    { sec: '高级', key: 'exportScale', label: '导出倍率', type: 'number', step: 0.5 },
  ];

  const THEME_KEYS = [
    { key: 'backgroundColor', label: '背景色' },
    { key: 'labelBgColor', label: '标签背景' },
    { key: 'channelBgColor', label: '通道背景' },
    { key: 'channelBgAltColor', label: '通道交替背景' },
    { key: 'groupHeaderBgColor', label: '分组头背景' },
    { key: 'groupHeaderTextColor', label: '分组头文字' },
    { key: 'baselineColor', label: '基线颜色' },
    { key: 'timeAxisColor', label: '时间轴颜色' },
    { key: 'timeTextColor', label: '时间文字' },
    { key: 'timeTickColor', label: '刻度线颜色' },
    { key: 'headerTitleColor', label: '头部标题' },
    { key: 'headerDescColor', label: '头部说明' },
    { key: 'footerColor', label: '底部文字' },
    { key: 'gridLineColor', label: '网格线颜色' },
    { key: 'eventMarkerColor', label: '事件标记色' },
    { key: 'hoverBorderColor', label: '悬停边框' },
    { key: 'labelSeparatorColor', label: '分隔线颜色' },
  ];

  function renderConfigTable() {
    let lastSec = '';
    let html = '<table class="cfg-table"><tbody>';

    for (const spec of CONFIG_SPEC) {
      if (spec.sec !== lastSec) {
        lastSec = spec.sec;
        html += '<tr><td class="cfg-section" colspan="2">' + esc(lastSec) + '</td></tr>';
      }
      html += '<tr>';
      html += '<td class="cfg-label">' + esc(spec.label) + '</td>';
      html += '<td>' + cfgInput(spec) + '</td>';
      html += '</tr>';
    }

    // Theme section
    html += '<tr><td class="cfg-section" colspan="2">主题色</td></tr>';
    html += '<tr><td class="cfg-label">预设主题</td><td><div class="theme-row">' +
      '<button data-theme="dark">暗色</button>' +
      '<button data-theme="light">亮色</button>' +
      '<button data-theme="blue">蓝色</button>' +
      '<button data-theme="green">绿色</button>' +
      '<button data-theme="warm">暖色</button>' +
      '</div></td></tr>';

    for (const tk of THEME_KEYS) {
      html += '<tr>';
      html += '<td class="cfg-label">' + esc(tk.label) + '</td>';
      html += '<td>' + themeColorInput(tk.key, data.config.theme[tk.key]) + '</td>';
      html += '</tr>';
    }

    html += '</tbody></table>';
    configPanel.innerHTML = html;

    bindConfigEvents();
  }

  function cfgInput(spec) {
    var key = spec.key;
    var val = data.config[key];
    switch (spec.type) {
      case 'text':
        return '<input type="text" data-cfg="' + key + '" value="' + escAttr(String(val)) + '">';
      case 'number':
        return '<input type="number" data-cfg="' + key + '" value="' + val + '" step="' + (spec.step || 1) + '">';
      case 'range':
        return '<input type="range" data-cfg="' + key + '" min="' + (spec.min || 0) + '" max="' + (spec.max || 100) + '" step="' + (spec.step || 1) + '" value="' + val + '"><span class="cfg-val-num" data-cfgv="' + key + '">' + val + '</span>';
      case 'bool':
        return '<input type="checkbox" data-cfg="' + key + '" ' + (val ? 'checked' : '') + '>';
      case 'select':
        var s = '<select data-cfg="' + key + '">';
        for (var i = 0; i < spec.opts.length; i++) {
          s += '<option value="' + spec.opts[i] + '"' + (val === spec.opts[i] ? ' selected' : '') + '>' + spec.opts[i] + '</option>';
        }
        s += '</select>';
        return s;
      case 'color':
        return '<input type="color" data-cfg="' + key + '" value="' + escAttr(String(val)) + '">';
      default:
        return '';
    }
  }

  function themeColorInput(key, val) {
    return '<input type="color" data-theme="' + key + '" value="' + escAttr(String(val || '')) + '">';
  }

  function bindConfigEvents() {
    // Text / Number / Select / Color inputs for top-level config
    var inputs = configPanel.querySelectorAll('input[data-cfg], select[data-cfg]');
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].addEventListener('change', onCfgChange);
      if (inputs[i].type === 'range') {
        inputs[i].addEventListener('input', onCfgChange);
      }
    }

    // Theme color inputs
    var themeInputs = configPanel.querySelectorAll('input[data-theme]');
    for (var j = 0; j < themeInputs.length; j++) {
      themeInputs[j].addEventListener('change', onThemeColorChange);
    }

    // Theme preset buttons
    var presetBtns = configPanel.querySelectorAll('.theme-row button');
    for (var k = 0; k < presetBtns.length; k++) {
      presetBtns[k].addEventListener('click', onThemePreset);
    }
  }

  function onCfgChange(e) {
    var key = e.target.getAttribute('data-cfg');
    var tag = e.target.tagName;
    var type = e.target.type;
    var val;
    if (tag === 'SELECT') {
      val = e.target.value;
    } else if (type === 'checkbox') {
      val = e.target.checked;
    } else if (type === 'range' || type === 'number') {
      val = parseFloat(e.target.value);
    } else {
      val = e.target.value;
    }
    data.config[key] = val;

    // Update range display
    if (type === 'range') {
      var span = e.target.nextElementSibling;
      if (span && span.getAttribute('data-cfgv') === key) {
        span.textContent = val;
      }
    }

    // Live update chart for config changes
    if (chart) {
      if (['channelHeight', 'channelGap', 'headerHeight', 'footerHeight',
        'groupHeaderHeight', 'chartTitleHeight', 'labelWidth', 'timeAxisHeight',
        'minBlockHeightPx', 'minBlockWidthPx', 'blockBorderRadius',
        'blockBorderWidth'].indexOf(key) >= 0) {
        chart.updateConfig(key, val);
      } else {
        scheduleRefresh();
      }
    }
  }

  function onThemeColorChange(e) {
    var key = e.target.getAttribute('data-theme');
    data.config.theme[key] = e.target.value;
    scheduleRefresh();
  }

  function onThemePreset(e) {
    var name = e.target.getAttribute('data-theme');
    var presets = {
      dark: {
        backgroundColor: '#1a1a2e', labelBgColor: '#16162a',
        channelBgColor: '#1b1c30', channelBgAltColor: '#1d1e32',
        groupHeaderBgColor: 'rgba(255,255,255,0.05)', groupHeaderTextColor: '#ddd',
        baselineColor: 'rgba(255,255,255,0.12)', timeAxisColor: '#888',
        timeTextColor: '#aaa', timeTickColor: 'rgba(255,255,255,0.15)',
        headerTitleColor: '#eee', headerDescColor: '#999', footerColor: '#666',
        gridLineColor: 'rgba(255,255,255,0.04)', eventMarkerColor: '#FF6B6B',
        hoverBorderColor: '#fff', labelSeparatorColor: 'rgba(255,255,255,0.08)',
        defaultBlockColor: '#4A90D9',
      },
      light: {
        backgroundColor: '#f5f5f5', labelBgColor: '#eeeeee',
        channelBgColor: '#fafafa', channelBgAltColor: '#ffffff',
        groupHeaderBgColor: '#e8e8e8', groupHeaderTextColor: '#555',
        baselineColor: 'rgba(0,0,0,0.1)', timeAxisColor: '#555',
        timeTextColor: '#333', timeTickColor: 'rgba(0,0,0,0.12)',
        headerTitleColor: '#222', headerDescColor: '#666', footerColor: '#999',
        gridLineColor: 'rgba(0,0,0,0.06)', eventMarkerColor: '#E74C3C',
        hoverBorderColor: '#333', labelSeparatorColor: 'rgba(0,0,0,0.08)',
        defaultBlockColor: '#4A90D9',
      },
      blue: {
        backgroundColor: '#0d1b2a', labelBgColor: '#0a1522',
        channelBgColor: '#0e1d2d', channelBgAltColor: '#101f30',
        groupHeaderBgColor: 'rgba(93,173,226,0.12)', groupHeaderTextColor: '#a0c8e8',
        baselineColor: 'rgba(255,255,255,0.1)', timeAxisColor: '#5DADE2',
        timeTextColor: '#a0c8e8', timeTickColor: 'rgba(255,255,255,0.12)',
        headerTitleColor: '#d0e4f8', headerDescColor: '#7a9fbf', footerColor: '#5a7a9a',
        gridLineColor: 'rgba(255,255,255,0.04)', eventMarkerColor: '#5DADE2',
        hoverBorderColor: '#a0d8f8', labelSeparatorColor: 'rgba(255,255,255,0.06)',
        defaultBlockColor: '#5DADE2',
      },
      green: {
        backgroundColor: '#0f1a14', labelBgColor: '#0c1610',
        channelBgColor: '#101c15', channelBgAltColor: '#121e18',
        groupHeaderBgColor: 'rgba(102,187,106,0.12)', groupHeaderTextColor: '#a5d6a7',
        baselineColor: 'rgba(255,255,255,0.1)', timeAxisColor: '#66BB6A',
        timeTextColor: '#a5d6a7', timeTickColor: 'rgba(255,255,255,0.1)',
        headerTitleColor: '#c8e6c9', headerDescColor: '#6a9a6e', footerColor: '#5a8a5e',
        gridLineColor: 'rgba(255,255,255,0.03)', eventMarkerColor: '#81C784',
        hoverBorderColor: '#a5d6a7', labelSeparatorColor: 'rgba(255,255,255,0.05)',
        defaultBlockColor: '#66BB6A',
      },
      warm: {
        backgroundColor: '#1e1814', labelBgColor: '#191411',
        channelBgColor: '#1f1a15', channelBgAltColor: '#211c17',
        groupHeaderBgColor: 'rgba(255,138,101,0.12)', groupHeaderTextColor: '#ffccbc',
        baselineColor: 'rgba(255,255,255,0.1)', timeAxisColor: '#FF8A65',
        timeTextColor: '#ffccbc', timeTickColor: 'rgba(255,255,255,0.1)',
        headerTitleColor: '#ffe0b2', headerDescColor: '#a68a6d', footerColor: '#8a6a4d',
        gridLineColor: 'rgba(255,255,255,0.03)', eventMarkerColor: '#FFAB91',
        hoverBorderColor: '#ffccbc', labelSeparatorColor: 'rgba(255,255,255,0.05)',
        defaultBlockColor: '#FF8A65',
      },
    };
    var preset = presets[name];
    if (!preset) return;
    for (var k in preset) {
      if (k === 'defaultBlockColor') {
        data.config.defaultBlockColor = preset[k];
      } else {
        data.config.theme[k] = preset[k];
      }
    }
    renderConfigTable();
    scheduleRefresh();
  }

  // ── Flat rows ─────────────────────────────────────────────
  function buildFlatRows() {
    flatRows = [];
    for (var gi = 0; gi < data.groups.length; gi++) {
      var g = data.groups[gi];
      if (!g.channels) g.channels = [];
      for (var ci = 0; ci < g.channels.length; ci++) {
        var ch = g.channels[ci];
        if (!ch.blocks) ch.blocks = [];
        for (var bi = 0; bi < ch.blocks.length; bi++) {
          var b = ch.blocks[bi];
          var tc = b.textConfig || {};
          flatRows.push({
            type: 'B', _gIdx: gi, _cIdx: ci, _bIdx: bi,
            _block: b,
            group: g.title || '',
            channel: ch.title || '',
            start: b.start || '',
            end: b.end || '',
            hp: b.heightPercent != null ? b.heightPercent : 0,
            color: b.color || '',
            text: b.text || '',
            tshow: tc.show !== false,
            tsize: tc.size != null ? tc.size : data.config.blockFontSize,
            props: b.properties || null,
          });
        }
        if (!ch.events) ch.events = [];
        for (var ei = 0; ei < ch.events.length; ei++) {
          var ev = ch.events[ei];
          flatRows.push({
            type: 'E', _gIdx: gi, _cIdx: ci, _eIdx: ei,
            _event: ev,
            group: g.title || '',
            channel: ch.title || '',
            start: ev.time || '',
            end: '',
            hp: 0,
            color: ev.color || '',
            text: ev.text || '',
            tshow: false,
            tsize: ev.size != null ? ev.size : data.config.eventFontSize,
            props: null,
          });
        }
      }
    }
  }

  function applyFlatEdits() {
    // Collect all edits from flatRows into the data hierarchy
    // Preserve existing group/channel metadata where possible
    var oldGroupMap = new Map();
    var oldChanMap = new Map(); // 'groupTitle|channelTitle' -> channel
    for (var gi = 0; gi < data.groups.length; gi++) {
      var oldG = data.groups[gi];
      oldGroupMap.set(oldG.title, oldG);
      if (oldG.channels) {
        for (var ci = 0; ci < oldG.channels.length; ci++) {
          var oldCh = oldG.channels[ci];
          oldChanMap.set(oldG.title + '|' + oldCh.title, oldCh);
        }
      }
    }

    var newGroups = [];
    var groupMap = new Map();

    for (var i = 0; i < flatRows.length; i++) {
      var r = flatRows[i];
      var gTitle = (r.group || '').trim() || 'Untitled';
      var cTitle = (r.channel || '').trim() || '通道';

      if (!groupMap.has(gTitle)) {
        var existingG = oldGroupMap.get(gTitle);
        var newG = {
          title: gTitle,
          description: existingG ? existingG.description || '' : '',
          channels: []
        };
        groupMap.set(gTitle, { g: newG, channels: new Map() });
        newGroups.push(newG);
      }
      var gm = groupMap.get(gTitle);

      if (!gm.channels.has(cTitle)) {
        var existingCh = oldChanMap.get(gTitle + '|' + cTitle);
        var newCh = {
          title: cTitle,
          description: existingCh ? existingCh.description || '' : '',
          footer: existingCh ? existingCh.footer || '' : '',
          blocks: [],
          events: []
        };
        gm.g.channels.push(newCh);
        gm.channels.set(cTitle, { c: newCh });
      }
      var cm = gm.channels.get(cTitle);

      if (r.type === 'B') {
        var block = {
          start: r.start || '',
          end: r.end || '',
          heightPercent: r.hp,
          color: r.color || undefined,
          text: r.text || undefined,
          textConfig: undefined,
          properties: r.props || undefined,
        };
        if (r.text && (r.tshow || r.tsize !== data.config.blockFontSize)) {
          block.textConfig = {
            show: r.tshow,
            size: r.tsize,
          };
        }
        cm.c.blocks.push(block);
      } else if (r.type === 'E') {
        var evt = {
          time: r.start || '',
          text: r.text || undefined,
          color: r.color || undefined,
          size: r.tsize !== data.config.eventFontSize ? r.tsize : undefined,
        };
        cm.c.events.push(evt);
      }
    }

    data.groups = newGroups.length > 0 ? newGroups : [{ title: '群组 1', description: '', channels: [] }];
    scheduleRefresh();
  }

  // ── Data table rendering ──────────────────────────────────
  function renderDataTable() {
    buildFlatRows();
    // Apply filter
    var filtered = flatRows.filter(function (r) {
      if (filters.group && (r.group || '').toLowerCase().indexOf(filters.group.toLowerCase()) === -1) return false;
      if (filters.channel && (r.channel || '').toLowerCase().indexOf(filters.channel.toLowerCase()) === -1) return false;
      if (filters.type && r.type !== filters.type) return false;
      if (filters.start && (r.start || '').toLowerCase().indexOf(filters.start.toLowerCase()) === -1) return false;
      if (filters.end && (r.end || '').toLowerCase().indexOf(filters.end.toLowerCase()) === -1) return false;
      if (filters.text && (r.text || '').toLowerCase().indexOf(filters.text.toLowerCase()) === -1) return false;
      if (filters.tshow === 'true' && !r.tshow) return false;
      if (filters.tshow === 'false' && r.tshow) return false;
      return true;
    });
    // Apply sort
    if (sortCol && sortDir) {
      var asc = sortDir === 'asc';
      filtered.sort(function (a, b) {
        var va = (a[sortCol] != null ? String(a[sortCol]) : '');
        var vb = (b[sortCol] != null ? String(b[sortCol]) : '');
        var cmp = va.localeCompare(vb);
        return asc ? cmp : -cmp;
      });
    }

    var html = '';
    for (var i = 0; i < filtered.length; i++) {
      var r = filtered[i];
      var origIdx = flatRows.indexOf(r); // for row data-row reference
      var isE = r.type === 'E';
      html += '<tr data-row="' + origIdx + '" data-type="' + r.type + '">';
      html += '<td class="col-group"><input class="type-group" value="' + escAttr(r.group) + '" data-col="group"></td>';
      html += '<td class="col-chan"><input class="type-channel" value="' + escAttr(r.channel) + '" data-col="channel"></td>';
      html += '<td class="col-type"><select data-col="type">' +
        '<option value="B"' + (r.type === 'B' ? ' selected' : '') + '>B</option>' +
        '<option value="E"' + (r.type === 'E' ? ' selected' : '') + '>E</option>' +
        '</select></td>';
      html += '<td class="col-start"><input type="text" value="' + escAttr(r.start) + '" data-col="start" placeholder="' + (isE ? 'event time' : 'start') + '"></td>';
      html += '<td class="col-end"><input type="text" value="' + escAttr(r.end) + '" data-col="end" placeholder="end"' + (isE ? ' disabled style="opacity:0.3"' : '') + '></td>';
      html += '<td class="col-hp"><input type="number" value="' + r.hp + '" data-col="hp" placeholder="0"' + (isE ? ' disabled style="opacity:0.3"' : '') + '></td>';
      html += '<td class="col-color"><input type="color" value="' + escAttr(r.color || '#4A90D9') + '" data-col="color"></td>';
      html += '<td class="col-text"><input type="text" value="' + escAttr(r.text) + '" data-col="text" placeholder="text"></td>';
      html += '<td class="col-show"><input type="checkbox" data-col="tshow"' + (r.tshow ? ' checked' : '') + (isE ? ' disabled style="opacity:0.3"' : '') + '></td>';
      html += '<td class="col-size"><input type="number" value="' + r.tsize + '" data-col="tsize" min="6" max="24"' + (isE ? '' : '') + '></td>';
      html += '<td class="col-props">' + (isE ? '' : '<button class="btn-props" data-col="props">' + (r.props ? Object.keys(r.props).length + 'kv' : '+') + '</button>') + '</td>';
      html += '<td class="col-del"><button class="btn-del" data-col="del">✕</button></td>';
      html += '</tr>';
    }
    dataTbody.innerHTML = html;

    // Render filter row in thead
    var theadEl = document.getElementById('data-table').querySelector('thead');
    var existingFilterRow = theadEl.querySelector('.filter-row');
    if (existingFilterRow) existingFilterRow.remove();
    var filterHtml = renderFilterRow();
    theadEl.insertAdjacentHTML('beforeend', filterHtml);

    bindDataTableEvents();

    // Restore selection
    if (selectedRowIdx >= 0 && selectedRowIdx < flatRows.length) {
      var selRow = dataTbody.querySelector('tr[data-row="' + selectedRowIdx + '"]');
      if (selRow) {
        selRow.classList.add('selected');
      } else {
        selectedRowIdx = -1;
      }
    }
  }

  function renderFilterRow() {
    var makeInput = function (col) {
      return '<input type="text" class="filter-input" data-filter="' + col + '" value="' + escAttr(filters[col] || '') + '" placeholder="...">';
    };
    var h = '<tr class="filter-row">';
    h += '<td class="col-group">' + makeInput('group') + '</td>';
    h += '<td class="col-chan">' + makeInput('channel') + '</td>';
    h += '<td class="col-type"><select class="filter-select" data-filter="type">' +
      '<option value="">-</option>' +
      '<option value="B"' + (filters.type === 'B' ? ' selected' : '') + '>B</option>' +
      '<option value="E"' + (filters.type === 'E' ? ' selected' : '') + '>E</option>' +
      '</select></td>';
    h += '<td class="col-start">' + makeInput('start') + '</td>';
    h += '<td class="col-end">' + makeInput('end') + '</td>';
    h += '<td class="col-hp"></td>';
    h += '<td class="col-color"></td>';
    h += '<td class="col-text">' + makeInput('text') + '</td>';
    h += '<td class="col-show"><select class="filter-select" data-filter="tshow">' +
      '<option value="">-</option>' +
      '<option value="true"' + (filters.tshow === 'true' ? ' selected' : '') + '>✓</option>' +
      '<option value="false"' + (filters.tshow === 'false' ? ' selected' : '') + '>✗</option>' +
      '</select></td>';
    h += '<td class="col-size"></td>';
    h += '<td class="col-props"></td>';
    h += '<td class="col-del"></td>';
    h += '</tr>';
    return h;
  }

  function bindDataTableEvents() {
    dataTbody.addEventListener('change', onCellChange);
    dataTbody.addEventListener('dblclick', onRowDblClick);

    // Delete buttons
    var delBtns = dataTbody.querySelectorAll('.btn-del');
    for (var i = 0; i < delBtns.length; i++) {
      delBtns[i].addEventListener('click', onDeleteRow);
    }

    // Props buttons
    var propBtns = dataTbody.querySelectorAll('.btn-props');
    for (var j = 0; j < propBtns.length; j++) {
      propBtns[j].addEventListener('click', onEditProps);
    }

    // Sort: click column headers
    var thEls = document.querySelectorAll('#data-table thead tr:first-child th');
    for (var k = 0; k < thEls.length; k++) {
      thEls[k].addEventListener('click', onSortClick);
      // Show sort indicator
      var col = thEls[k].className.replace(/^col-/, '');
      updateSortIndicator(thEls[k], col);
    }

    // Filter: change events on filter inputs
    var filterInputs = document.querySelectorAll('#data-table .filter-input, #data-table .filter-select');
    for (var m = 0; m < filterInputs.length; m++) {
      filterInputs[m].addEventListener('input', onFilterChange);
      filterInputs[m].addEventListener('change', onFilterChange);
    }
  }

  function onSortClick(e) {
    var th = e.currentTarget;
    var col = th.className.replace(/^col-/, '');
    if (!col) return;
    var sortColMap = {
      group: 'group', chan: 'channel', type: 'type', start: 'start', end: 'end',
      hp: 'hp', color: 'color', text: 'text', show: 'tshow', size: 'tsize',
      props: '', del: ''
    };
    var mappedCol = sortColMap[col] || col;
    if (!mappedCol || mappedCol === 'props' || mappedCol === 'del' || mappedCol === 'color') return;

    if (sortCol === mappedCol) {
      if (sortDir === 'asc') { sortDir = 'desc'; }
      else if (sortDir === 'desc') { sortCol = ''; sortDir = ''; }
    } else {
      sortCol = mappedCol;
      sortDir = 'asc';
    }
    renderDataTable();
  }

  function updateSortIndicator(th, col) {
    // Remove existing indicators
    var existing = th.querySelector('.sort-arrow');
    if (existing) existing.remove();
    var sortColMap = {
      group: 'group', chan: 'channel', type: 'type', start: 'start', end: 'end',
      hp: 'hp', color: 'color', text: 'text', show: 'tshow', size: 'tsize'
    };
    var mapped = sortColMap[col] || col;
    if (sortCol === mapped && sortDir) {
      var arrow = document.createElement('span');
      arrow.className = 'sort-arrow';
      arrow.textContent = sortDir === 'asc' ? ' ▲' : ' ▼';
      arrow.style.color = '#4A90D9';
      arrow.style.fontSize = '10px';
      th.appendChild(arrow);
    }
  }

  function onFilterChange(e) {
    var col = e.target.getAttribute('data-filter');
    if (!col) return;
    filters[col] = e.target.value;
    renderDataTable();
  }

  function getRowInputs(row) {
    var groups = row.querySelectorAll('input[data-col="group"]')[0];
    var channel = row.querySelectorAll('input[data-col="channel"]')[0];
    var typeSel = row.querySelectorAll('select[data-col="type"]')[0];
    var start = row.querySelectorAll('input[data-col="start"]')[0];
    var end = row.querySelectorAll('input[data-col="end"]')[0];
    var hp = row.querySelectorAll('input[data-col="hp"]')[0];
    var color = row.querySelectorAll('input[data-col="color"]')[0];
    var text = row.querySelectorAll('input[data-col="text"]')[0];
    var tshow = row.querySelectorAll('input[data-col="tshow"]')[0];
    var tsize = row.querySelectorAll('input[data-col="tsize"]')[0];
    return { groups, channel, typeSel, start, end, hp, color, text, tshow, tsize };
  }

  function readRow(rowIdx) {
    var rowEl = dataTbody.querySelector('tr[data-row="' + rowIdx + '"]');
    if (!rowEl) return;
    var r = flatRows[rowIdx];
    var els = getRowInputs(rowEl);
    r.group = els.groups.value;
    r.channel = els.channel.value;
    r.type = els.typeSel.value;
    r.start = els.start.value;
    r.end = els.end.value;
    r.hp = parseFloat(els.hp.value) || 0;
    r.color = els.color.value;
    r.text = els.text.value;
    r.tshow = els.tshow.checked;
    r.tsize = parseInt(els.tsize.value) || data.config.blockFontSize;
    applyFlatEdits();
  }

  function onCellChange(e) {
    var rowEl = e.target.closest('tr');
    if (!rowEl) return;
    var rowIdx = parseInt(rowEl.getAttribute('data-row'));
    if (isNaN(rowIdx)) return;
    var col = e.target.getAttribute('data-col');

    if (col === 'type') {
      // Toggle event/block fields
      var r = flatRows[rowIdx];
      r.type = e.target.value;
      readRow(rowIdx);
      renderDataTable();
      return;
    }
    readRow(rowIdx);
  }

  function onRowDblClick(e) {
    var tag = e.target.tagName;
    if (tag === 'BUTTON' || tag === 'SELECT') return;

    var rowEl = e.target.closest('tr');
    if (!rowEl) {
      deselectRow();
      return;
    }
    var rowIdx = parseInt(rowEl.getAttribute('data-row'));
    if (isNaN(rowIdx)) return;

    if (selectedRowIdx === rowIdx) {
      deselectRow();
    } else {
      selectRow(rowIdx);
    }
  }

  function selectRow(rowIdx) {
    // Remove old selection CSS
    var oldSel = dataTbody.querySelector('tr.selected');
    if (oldSel) oldSel.classList.remove('selected');

    selectedRowIdx = rowIdx;
    var rowEl = dataTbody.querySelector('tr[data-row="' + rowIdx + '"]');
    if (rowEl) rowEl.classList.add('selected');

    var r = flatRows[rowIdx];
    if (r && r.type === 'B' && chart) {
      var selStart = r.start || '';
      var selEnd = r.end || '';
      var selChanTitle = (r.channel || '').trim();
      var selGroupTitle = (r.group || '').trim();
      if (selStart && selEnd && selChanTitle) {
        chart.selectBlock(selStart, selEnd, selGroupTitle, selChanTitle);
      }
    }
  }

  function deselectRow() {
    var oldSel = dataTbody.querySelector('tr.selected');
    if (oldSel) oldSel.classList.remove('selected');
    selectedRowIdx = -1;
    if (chart) chart.deselectBlock();
  }

  function onDeleteRow(e) {
    e.stopPropagation();
    var rowEl = e.target.closest('tr');
    if (!rowEl) return;
    var rowIdx = parseInt(rowEl.getAttribute('data-row'));
    if (isNaN(rowIdx)) return;
    var wasSelected = selectedRowIdx === rowIdx;
    flatRows.splice(rowIdx, 1);
    if (wasSelected) deselectRow();
    applyFlatEdits();
    renderDataTable();
  }

  function onEditProps(e) {
    var rowEl = e.target.closest('tr');
    if (!rowEl) return;
    var rowIdx = parseInt(rowEl.getAttribute('data-row'));
    if (isNaN(rowIdx)) return;
    propsEditing = { rowIdx: rowIdx, propsObj: flatRows[rowIdx].props || {} };
    openPropsDialog();
  }

  // ── Properties dialog ─────────────────────────────────────
  function openPropsDialog() {
    if (!propsEditing) return;
    var obj = propsEditing.propsObj;
    var html = '';
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      html += '<div class="props-row">' +
        '<input type="text" class="prop-key" value="' + escAttr(k) + '" placeholder="key">' +
        '<input type="text" class="prop-val" value="' + escAttr(String(obj[k])) + '" placeholder="value">' +
        '<button class="btn-del-prop" data-idx="' + i + '">✕</button>' +
        '</div>';
    }
    propsList.innerHTML = html;

    // Bind delete buttons
    var delBtns = propsList.querySelectorAll('.btn-del-prop');
    for (var j = 0; j < delBtns.length; j++) {
      delBtns[j].addEventListener('click', function () {
        var idx = parseInt(this.getAttribute('data-idx'));
        var ks = Object.keys(propsEditing.propsObj);
        if (idx >= 0 && idx < ks.length) {
          delete propsEditing.propsObj[ks[idx]];
          openPropsDialog();
        }
      });
    }

    propsOverlay.classList.add('show');
  }

  function closePropsDialog(save) {
    if (!propsEditing) return;
    if (save) {
      var newObj = {};
      var rows = propsList.querySelectorAll('.props-row');
      for (var i = 0; i < rows.length; i++) {
        var keyInput = rows[i].querySelector('.prop-key');
        var valInput = rows[i].querySelector('.prop-val');
        var key = (keyInput.value || '').trim();
        if (key) {
          newObj[key] = valInput.value;
        }
      }
      propsEditing.propsObj = Object.keys(newObj).length > 0 ? newObj : null;
      flatRows[propsEditing.rowIdx].props = propsEditing.propsObj;
      applyFlatEdits();
      renderDataTable();
    }
    propsOverlay.classList.remove('show');
    propsEditing = null;
  }

  document.getElementById('props-save').addEventListener('click', function () { closePropsDialog(true); });
  document.getElementById('props-cancel').addEventListener('click', function () { closePropsDialog(false); });
  document.getElementById('props-add-kv').addEventListener('click', function () {
    if (!propsEditing) return;
    propsEditing.propsObj[''] = '';
    openPropsDialog();
  });
  propsOverlay.addEventListener('click', function (e) {
    if (e.target === propsOverlay) closePropsDialog(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && propsOverlay.classList.contains('show')) {
      closePropsDialog(false);
    }
  });

  // ── Add row ───────────────────────────────────────────────
  document.getElementById('add-row-btn').addEventListener('click', function () {
    // Determine default group/channel
    var lastGTitle = data.groups.length > 0 ? data.groups[data.groups.length - 1].title : '群组 1';
    var lastCTitle = '通道 1';
    if (data.groups.length > 0) {
      var lastG = data.groups[data.groups.length - 1];
      if (lastG.channels && lastG.channels.length > 0) {
        lastCTitle = lastG.channels[lastG.channels.length - 1].title;
      }
    }

    flatRows.push({
      type: 'B', _gIdx: -1, _cIdx: -1, _bIdx: -1,
      _block: null,
      group: lastGTitle,
      channel: lastCTitle,
      start: '', end: '', hp: 0, color: '#4A90D9', text: '',
      tshow: true, tsize: data.config.blockFontSize, props: null,
    });
    applyFlatEdits();
    renderDataTable();
    // Scroll to bottom
    var wrap = document.querySelector('.data-table-wrap');
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
  });

  // ── Import / Export ───────────────────────────────────────
  document.getElementById('btn-export').addEventListener('click', function () {
    var payload = {
      groups: JSON.parse(JSON.stringify(data.groups)),
      config: JSON.parse(JSON.stringify(data.config)),
    };
    var json = JSON.stringify(payload, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'data.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('btn-import').addEventListener('click', function () {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', function () {
      var file = input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var parsed = JSON.parse(reader.result);
          loadData(parsed);
        } catch (err) {
          alert('JSON 解析失败: ' + err.message);
        }
      };
      reader.readAsText(file);
    });
    input.click();
  });

  document.getElementById('btn-clear').addEventListener('click', function () {
    if (confirm('确定清空所有数据？')) {
      deselectRow();
      resetFilters();
      data = blankData();
      flatRows = [];
      refreshPreview();
      if (chart) chart.fitAll();
      if (tabData.classList.contains('active')) {
        renderDataTable();
      } else {
        renderConfigTable();
      }
    }
  });

  // ── Load sample ───────────────────────────────────────────
  document.getElementById('sel-sample').addEventListener('change', function () {
    var val = this.value;
    if (!val) return;
    this.value = '';
    if (val === 'blank') {
      deselectRow();
      resetFilters();
      data = blankData();
      flatRows = [];
      refreshPreview();
      if (chart) chart.fitAll();
      if (tabData.classList.contains('active')) {
        renderDataTable();
      } else {
        renderConfigTable();
      }
      return;
    }
    var dataFile = 'data-' + val + '.json';
    fetch(dataFile)
      .then(function (r) { return r.json(); })
      .then(function (loaded) {
        loadData(loaded);
      })
      .catch(function (err) {
        alert('加载失败: ' + err.message);
      });
  });

  function loadData(incoming) {
    var cfg = incoming.config || {};
    // Deep merge config
    data.config = { ...blankConfig(), ...cfg };
    if (cfg.theme) {
      data.config.theme = { ...blankConfig().theme, ...cfg.theme };
    }
    data.groups = [];
    if (incoming.groups && incoming.groups.length > 0) {
      data.groups = incoming.groups;
    } else if (incoming.channels) {
      data.groups = [{ title: '', description: '', channels: incoming.channels }];
    }
    // Normalize data
    for (var gi = 0; gi < data.groups.length; gi++) {
      var g = data.groups[gi];
      if (!g.channels) g.channels = [];
      for (var ci = 0; ci < g.channels.length; ci++) {
        var ch = g.channels[ci];
        if (!ch.blocks) ch.blocks = [];
        if (!ch.events) ch.events = [];
        for (var bi = 0; bi < ch.blocks.length; bi++) {
          if (ch.blocks[bi].textConfig == null) ch.blocks[bi].textConfig = { show: true };
        }
      }
    }
    deselectRow();
    resetFilters();
    flatRows = [];
    refreshPreview();
    if (chart) chart.fitAll();
    if (tabData.classList.contains('active')) {
      renderDataTable();
    } else {
      renderConfigTable();
    }
  }

  // ── Preview toolbar ───────────────────────────────────────
  document.getElementById('btn-fit').addEventListener('click', function () {
    if (chart) chart.fitAll();
  });
  document.getElementById('btn-zoomin').addEventListener('click', function () {
    if (chart) chart.zoomIn();
  });
  document.getElementById('btn-zoomout').addEventListener('click', function () {
    if (chart) chart.zoomOut();
  });
  document.getElementById('btn-svg').addEventListener('click', function () {
    if (chart) chart.exportSVG();
  });
  document.getElementById('btn-png').addEventListener('click', function () {
    if (chart) chart.exportPNG();
  });

  // ── Resize handle ─────────────────────────────────────────
  var resizeHandle = document.getElementById('resize-handle');
  var resizing = false;
  var resizeStartY = 0;
  var resizeStartH = 0;

  resizeHandle.addEventListener('mousedown', function (e) {
    resizing = true;
    resizeStartY = e.clientY;
    resizeStartH = previewArea.getBoundingClientRect().height;
    resizeHandle.classList.add('resizing');
    e.preventDefault();
  });

  document.addEventListener('mousemove', function (e) {
    if (!resizing) return;
    var dy = e.clientY - resizeStartY;
    var newH = Math.max(120, Math.min(window.innerHeight * 0.8, resizeStartH + dy));
    previewArea.style.flex = 'none';
    previewArea.style.height = newH + 'px';
  });

  document.addEventListener('mouseup', function () {
    if (resizing) {
      resizing = false;
      resizeHandle.classList.remove('resizing');
    }
  });

  // ── Tooltip position ───────────────────────────────────────
  document.addEventListener('mousemove', function (e) {
    var tx = Math.min(e.clientX + 16, window.innerWidth - 260);
    var ty = Math.min(e.clientY + 16, window.innerHeight - 100);
    tooltip.style.left = tx + 'px';
    tooltip.style.top = ty + 'px';
  });

  // ── Init ──────────────────────────────────────────────────
  function init() {
    initChart();
    refreshPreview();

    // Try loading from query param
    var params = new URLSearchParams(location.search);
    var sampleName = params.get('sample');
    if (sampleName) {
      var dataFile = sampleName === 'blank' ? null : 'data-' + sampleName + '.json';
      if (dataFile) {
        fetch(dataFile)
          .then(function (r) { return r.json(); })
          .then(function (loaded) { loadData(loaded); })
          .catch(function () {
            loadData(blankData());
          });
      } else {
        loadData(blankData());
      }
    } else {
      loadData(blankData());
    }
  }

  // ── Helpers ───────────────────────────────────────────────
  function formatTimeShort(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    var h = String(d.getHours()).padStart(2, '0');
    var m = String(d.getMinutes()).padStart(2, '0');
    var M = String(d.getMonth() + 1).padStart(2, '0');
    var D = String(d.getDate()).padStart(2, '0');
    return M + '-' + D + ' ' + h + ':' + m;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Boot ──────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
