const canvas = document.getElementById('chart');
const tooltip = document.getElementById('tooltip');
const infoTime = document.getElementById('info-time');
const chartWrap = document.getElementById('chart-wrap');

const chart = new TimelineChart(canvas, {
  onHover(block) {
    if (!block) {
      tooltip.classList.remove('visible');
      return;
    }
    const name = block.text || '未知事项';
    const startStr = formatTimeShort(block.start);
    const endStr = formatTimeShort(block.end);
    let html = `<div class="tt-title">${escapeHtml(name)}</div>`;
    html += `<div class="tt-row"><span class="tt-label">时间</span><span class="tt-value">${startStr} - ${endStr}</span></div>`;
    if (block._groupTitle) {
      html += `<div class="tt-row"><span class="tt-label">组</span><span class="tt-value">${escapeHtml(block._groupTitle)}</span></div>`;
    }
    if (block.properties) {
      for (const [key, val] of Object.entries(block.properties)) {
        html += `<div class="tt-row"><span class="tt-label">${escapeHtml(key)}</span><span class="tt-value">${escapeHtml(String(val))}</span></div>`;
      }
    }
    tooltip.innerHTML = html;
    tooltip.classList.add('visible');
  },
  onTimeChange(viewStart, viewEnd) {
    updateTimeInfo(viewStart, viewEnd);
  },
  onGroupToggle(groupIdx, collapsed) {
    updateInfo();
  },
  onClick(block) {
    if (block) { console.log('Block clicked:', block); }
  },
});

document.addEventListener('mousemove', (e) => {
  const tx = Math.min(e.clientX + 16, window.innerWidth - 260);
  const ty = Math.min(e.clientY + 16, window.innerHeight - 100);
  tooltip.style.left = tx + 'px';
  tooltip.style.top = ty + 'px';
});

const params = new URLSearchParams(location.search);
const sampleName = params.get('sample') || null;
const dataFile = sampleName ? `data-${sampleName}.json` : 'data.json';

document.title = sampleName
    ? { taxi: '出租车营收', reading: '学生阅读', airport: '机场跑道', restaurant: '饭店餐桌', smt: 'SMT产线' }[sampleName] + ' — TimeLane'
    : 'TimeLane — 时间轴图';

const dataConfig = {
  timeFormat: 'MM-DD HH:mm',
  channelHeight: 60,
  timeFontSize: 11,
  blockFontSize: 10,
  eventFontSize: 10,
  labelWidth: 140,
};
let dataLoaded = false;

fetch(dataFile)
  .then(r => r.json())
  .then(data => {
    if (data.config) {
      Object.assign(dataConfig, data.config);
    }
    data.config = dataConfig;
    chart.loadData(data);
    updateTimeInfo(chart.viewStart, chart.viewEnd);
    updateInfo();
    syncControls();
    dataLoaded = true;
  })
  .catch(err => { console.error(`Failed to load ${dataFile}:`, err); });

document.getElementById('btn-fit').addEventListener('click', () => {
  chart.fitAll();
  updateTimeInfo(chart.viewStart, chart.viewEnd);
});
document.getElementById('btn-zoomin').addEventListener('click', () => {
  chart.zoomIn(); updateTimeInfo(chart.viewStart, chart.viewEnd);
});
document.getElementById('btn-zoomout').addEventListener('click', () => {
  chart.zoomOut(); updateTimeInfo(chart.viewStart, chart.viewEnd);
});
document.getElementById('btn-svg').addEventListener('click', () => chart.exportSVG());
document.getElementById('btn-png').addEventListener('click', () => chart.exportPNG());

let cursor1On = false, cursor2On = false;
document.getElementById('btn-cursor').addEventListener('click', function () {
  cursor1On = !cursor1On;
  chart.setCursor1(cursor1On);
  this.classList.toggle('active', cursor1On);
});
document.getElementById('btn-cursor2').addEventListener('click', function () {
  cursor2On = !cursor2On;
  chart.setCursor2(cursor2On);
  this.classList.toggle('active', cursor2On);
});

// Compact mode
let compactOn = false;
let savedCompactCfg = null;
document.getElementById('btn-compact').addEventListener('click', function () {
  compactOn = !compactOn;
  var cfg = chart.config;
  if (compactOn) {
    savedCompactCfg = {
      channelGap: cfg.channelGap, footerHeight: cfg.footerHeight,
      groupHeaderHeight: cfg.groupHeaderHeight,
      showFooter: cfg.showFooter,
      showEvents: cfg.showEvents, blockTextPosition: cfg.blockTextPosition
    };
    chart.updateConfig('channelGap', 0);
    chart.updateConfig('footerHeight', 0);
    chart.updateConfig('groupHeaderHeight', 0);
    chart.updateConfig('showFooter', false);
    chart.updateConfig('showEvents', false);
    chart.updateConfig('blockTextPosition', 'center');
  } else if (savedCompactCfg) {
    chart.updateConfig('channelGap', savedCompactCfg.channelGap);
    chart.updateConfig('footerHeight', savedCompactCfg.footerHeight);
    chart.updateConfig('groupHeaderHeight', savedCompactCfg.groupHeaderHeight);
    chart.updateConfig('showFooter', savedCompactCfg.showFooter);
    chart.updateConfig('showEvents', savedCompactCfg.showEvents);
    chart.updateConfig('blockTextPosition', savedCompactCfg.blockTextPosition);
    savedCompactCfg = null;
  }
  syncControls();
  this.classList.toggle('active', compactOn);
});

const chHeightSlider = document.getElementById('cfg-chHeight');
const valChHeight = document.getElementById('val-chHeight');
chHeightSlider.addEventListener('input', () => {
  const v = parseInt(chHeightSlider.value);
  valChHeight.textContent = v;
  chart.updateConfig('channelHeight', v);
});

document.getElementById('cfg-textShow').addEventListener('change', (e) => {
  chart.updateConfig('blockTextShow', e.target.checked);
});

document.getElementById('cfg-textPos').addEventListener('change', (e) => {
  chart.updateConfig('blockTextPosition', e.target.value);
});

const blockFontSlider = document.getElementById('cfg-blockFont');
const valBlockFont = document.getElementById('val-blockFont');
blockFontSlider.addEventListener('input', () => {
  const v = parseInt(blockFontSlider.value);
  valBlockFont.textContent = v;
  chart.updateConfig('blockFontSize', v);
});

document.getElementById('cfg-wireframe').addEventListener('change', (e) => {
  chart.updateConfig('wireframe', e.target.checked);
});

const wireframeWidthSlider = document.getElementById('cfg-wireframeWidth');
const valWireframeWidth = document.getElementById('val-wireframeWidth');
wireframeWidthSlider.addEventListener('input', () => {
  const v = parseInt(wireframeWidthSlider.value);
  valWireframeWidth.textContent = v;
  chart.updateConfig('wireframeWidth', v);
});

const timeFontSlider = document.getElementById('cfg-timeFont');
const valTimeFont = document.getElementById('val-timeFont');
timeFontSlider.addEventListener('input', () => {
  const v = parseInt(timeFontSlider.value);
  valTimeFont.textContent = v;
  chart.updateConfig('timeFontSize', v);
});

const eventFontSlider = document.getElementById('cfg-eventFont');
const valEventFont = document.getElementById('val-eventFont');
eventFontSlider.addEventListener('input', () => {
  const v = parseInt(eventFontSlider.value);
  valEventFont.textContent = v;
  chart.updateConfig('eventFontSize', v);
});

const hdrFontSlider = document.getElementById('cfg-hdrFont');
const valHdrFont = document.getElementById('val-hdrFont');
hdrFontSlider.addEventListener('input', () => {
  const v = parseInt(hdrFontSlider.value);
  valHdrFont.textContent = v;
  chart.updateConfig('headerFontSize', v);
});

document.getElementById('cfg-timeFmt').addEventListener('change', (e) => {
  chart.updateConfig('timeFormat', e.target.value);
});

document.getElementById('cfg-events').addEventListener('change', (e) => {
  chart.updateConfig('showEvents', e.target.checked);
});

document.getElementById('cfg-grid').addEventListener('change', (e) => {
  chart.updateConfig('showGridLines', e.target.checked);
});

document.getElementById('cfg-footerShow').addEventListener('change', (e) => {
  chart.updateConfig('showFooter', e.target.checked);
});

const footerHSlider = document.getElementById('cfg-footerH');
const valFooterH = document.getElementById('val-footerH');
footerHSlider.addEventListener('input', () => {
  const v = parseInt(footerHSlider.value);
  valFooterH.textContent = v;
  chart.updateConfig('footerHeight', v);
});

const chGapSlider = document.getElementById('cfg-chGap');
const valChGap = document.getElementById('val-chGap');
chGapSlider.addEventListener('input', () => {
  const v = parseInt(chGapSlider.value);
  valChGap.textContent = v;
  chart.updateConfig('channelGap', v);
});

const labelWSlider = document.getElementById('cfg-labelW');
const valLabelW = document.getElementById('val-labelW');
labelWSlider.addEventListener('input', () => {
  const v = parseInt(labelWSlider.value);
  valLabelW.textContent = v;
  chart.updateConfig('labelWidth', v);
});

const timeAxisHSlider = document.getElementById('cfg-timeAxisH');
const valTimeAxisH = document.getElementById('val-timeAxisH');
timeAxisHSlider.addEventListener('input', () => {
  const v = parseInt(timeAxisHSlider.value);
  valTimeAxisH.textContent = v;
  chart.updateConfig('timeAxisHeight', v);
});

const grpHdrHSlider = document.getElementById('cfg-grpHdrH');
const valGrpHdrH = document.getElementById('val-grpHdrH');
grpHdrHSlider.addEventListener('input', () => {
  const v = parseInt(grpHdrHSlider.value);
  valGrpHdrH.textContent = v;
  chart.updateConfig('groupHeaderHeight', v);
});

const grpHdrFontSlider = document.getElementById('cfg-grpHdrFont');
const valGrpHdrFont = document.getElementById('val-grpHdrFont');
grpHdrFontSlider.addEventListener('input', () => {
  const v = parseInt(grpHdrFontSlider.value);
  valGrpHdrFont.textContent = v;
  chart.updateConfig('groupHeaderFontSize', v);
});

const chartTitleFontSlider = document.getElementById('cfg-chartTitleFont');
const valChartTitleFont = document.getElementById('val-chartTitleFont');
chartTitleFontSlider.addEventListener('input', () => {
  const v = parseInt(chartTitleFontSlider.value);
  valChartTitleFont.textContent = v;
  chart.updateConfig('chartTitleFontSize', v);
});

document.querySelectorAll('.theme-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const name = btn.dataset.theme;
    chart.setTheme(name);
    applyPageTheme(name);
  });
});

const helpOverlay = document.getElementById('help-overlay');
document.getElementById('btn-help').addEventListener('click', () => {
  helpOverlay.classList.add('show');
});
document.getElementById('help-close').addEventListener('click', () => {
  helpOverlay.classList.remove('show');
});
helpOverlay.addEventListener('click', (e) => {
  if (e.target === helpOverlay) helpOverlay.classList.remove('show');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') helpOverlay.classList.remove('show');
});

function syncControls() {
  const cfg = chart.config;
  document.getElementById('cfg-chHeight').value = cfg.channelHeight;
  document.getElementById('val-chHeight').textContent = cfg.channelHeight;
  document.getElementById('cfg-textShow').checked = cfg.blockTextShow;
  document.getElementById('cfg-textPos').value = cfg.blockTextPosition;
  document.getElementById('cfg-blockFont').value = cfg.blockFontSize;
  document.getElementById('val-blockFont').textContent = cfg.blockFontSize;
  document.getElementById('cfg-timeFont').value = cfg.timeFontSize;
  document.getElementById('val-timeFont').textContent = cfg.timeFontSize;
  document.getElementById('cfg-eventFont').value = cfg.eventFontSize;
  document.getElementById('val-eventFont').textContent = cfg.eventFontSize;
  document.getElementById('cfg-hdrFont').value = cfg.headerFontSize;
  document.getElementById('val-hdrFont').textContent = cfg.headerFontSize;
  document.getElementById('cfg-timeFmt').value = cfg.timeFormat;
  document.getElementById('cfg-events').checked = cfg.showEvents;
  document.getElementById('cfg-chGap').value = cfg.channelGap;
  document.getElementById('val-chGap').textContent = cfg.channelGap;
  document.getElementById('cfg-footerShow').checked = cfg.showFooter;
  document.getElementById('cfg-footerH').value = cfg.footerHeight;
  document.getElementById('val-footerH').textContent = cfg.footerHeight;
  document.getElementById('cfg-grpHdrH').value = cfg.groupHeaderHeight;
  document.getElementById('val-grpHdrH').textContent = cfg.groupHeaderHeight;
  document.getElementById('cfg-grpHdrFont').value = cfg.groupHeaderFontSize;
  document.getElementById('val-grpHdrFont').textContent = cfg.groupHeaderFontSize;
  document.getElementById('cfg-chartTitleFont').value = cfg.chartTitleFontSize;
  document.getElementById('val-chartTitleFont').textContent = cfg.chartTitleFontSize;
  document.getElementById('cfg-grid').checked = cfg.showGridLines;
  document.getElementById('cfg-labelW').value = cfg.labelWidth;
  document.getElementById('val-labelW').textContent = cfg.labelWidth;
  document.getElementById('cfg-timeAxisH').value = cfg.timeAxisHeight;
  document.getElementById('val-timeAxisH').textContent = cfg.timeAxisHeight;
  document.getElementById('cfg-wireframe').checked = cfg.wireframe;
  document.getElementById('cfg-wireframeWidth').value = cfg.wireframeWidth;
  document.getElementById('val-wireframeWidth').textContent = cfg.wireframeWidth;
}

function applyPageTheme(name) {
  const themes = {
    dark: {
      bodyBg: '#0f0f23', toolbarBg: '#1a1a2e', panelBg: '#16162a',
      text: '#ccc', panelText: '#aaa', borderColor: 'rgba(255,255,255,0.08)',
      btnBg: '#2a2a4a', btnHoverBg: '#3a3a5a', activeBtnBg: '#4A90D9', activeBtnText: '#fff',
      selectBg: '#2a2a4a', sectionBg: 'rgba(255,255,255,0.025)', sectionBorder: 'rgba(255,255,255,0.06)',
      h3Color: '#eee', h3Bg: 'rgba(255,255,255,0.04)', h3Border: 'rgba(255,255,255,0.06)',
      h3HoverBg: 'rgba(255,255,255,0.07)', labelColor: '#bbb',
      toggleBg: '#16162a', toggleHoverBg: '#1e1e38', toggleColor: '#888',
      helpBg: '#1a1a2e', helpBorder: 'rgba(255,255,255,0.15)', helpColor: '#ccc',
      accentColor: '#4A90D9',
    },
    light: {
      bodyBg: '#e8e8e8', toolbarBg: '#f0f0f0', panelBg: '#f5f5f5',
      text: '#333', panelText: '#555', borderColor: 'rgba(0,0,0,0.1)',
      btnBg: '#e0e0e0', btnHoverBg: '#d0d0d0', activeBtnBg: '#4A90D9', activeBtnText: '#fff',
      selectBg: '#e0e0e0', sectionBg: '#ffffff', sectionBorder: 'rgba(0,0,0,0.08)',
      h3Color: '#333', h3Bg: '#f0f0f0', h3Border: 'rgba(0,0,0,0.06)',
      h3HoverBg: '#e8e8e8', labelColor: '#555',
      toggleBg: '#f0f0f0', toggleHoverBg: '#e0e0e0', toggleColor: '#888',
      helpBg: '#f8f8f8', helpBorder: 'rgba(0,0,0,0.15)', helpColor: '#333',
      accentColor: '#4A90D9',
    },
    blue: {
      bodyBg: '#08111a', toolbarBg: '#0d1b2a', panelBg: '#0a1522',
      text: '#a0c8e8', panelText: '#7a9fbf', borderColor: 'rgba(93,173,226,0.15)',
      btnBg: '#0e2035', btnHoverBg: '#122a42', activeBtnBg: '#5DADE2', activeBtnText: '#0d1b2a',
      selectBg: '#0e2035', sectionBg: 'rgba(93,173,226,0.04)', sectionBorder: 'rgba(93,173,226,0.1)',
      h3Color: '#d0e4f8', h3Bg: 'rgba(93,173,226,0.08)', h3Border: 'rgba(93,173,226,0.1)',
      h3HoverBg: 'rgba(93,173,226,0.12)', labelColor: '#8ab8d8',
      toggleBg: '#0a1522', toggleHoverBg: '#0e2035', toggleColor: '#5DADE2',
      helpBg: '#0d1b2a', helpBorder: 'rgba(93,173,226,0.2)', helpColor: '#a0c8e8',
      accentColor: '#5DADE2',
    },
    green: {
      bodyBg: '#0a140e', toolbarBg: '#0f1a14', panelBg: '#0c1610',
      text: '#a5d6a7', panelText: '#6a9a6e', borderColor: 'rgba(102,187,106,0.15)',
      btnBg: '#0e1e14', btnHoverBg: '#122518', activeBtnBg: '#66BB6A', activeBtnText: '#0f1a14',
      selectBg: '#0e1e14', sectionBg: 'rgba(102,187,106,0.04)', sectionBorder: 'rgba(102,187,106,0.1)',
      h3Color: '#c8e6c9', h3Bg: 'rgba(102,187,106,0.08)', h3Border: 'rgba(102,187,106,0.1)',
      h3HoverBg: 'rgba(102,187,106,0.12)', labelColor: '#88b88a',
      toggleBg: '#0c1610', toggleHoverBg: '#0e1e14', toggleColor: '#66BB6A',
      helpBg: '#0f1a14', helpBorder: 'rgba(102,187,106,0.2)', helpColor: '#a5d6a7',
      accentColor: '#66BB6A',
    },
    warm: {
      bodyBg: '#16100e', toolbarBg: '#1e1814', panelBg: '#191411',
      text: '#ffccbc', panelText: '#a68a6d', borderColor: 'rgba(255,138,101,0.15)',
      btnBg: '#241c16', btnHoverBg: '#2c221a', activeBtnBg: '#FF8A65', activeBtnText: '#1e1814',
      selectBg: '#241c16', sectionBg: 'rgba(255,138,101,0.04)', sectionBorder: 'rgba(255,138,101,0.1)',
      h3Color: '#ffe0b2', h3Bg: 'rgba(255,138,101,0.08)', h3Border: 'rgba(255,138,101,0.1)',
      h3HoverBg: 'rgba(255,138,101,0.12)', labelColor: '#c8a080',
      toggleBg: '#191411', toggleHoverBg: '#241c16', toggleColor: '#FF8A65',
      helpBg: '#1e1814', helpBorder: 'rgba(255,138,101,0.2)', helpColor: '#ffccbc',
      accentColor: '#FF8A65',
    },
  };
  const t = themes[name] || themes.dark;
  document.body.style.background = t.bodyBg;
  document.getElementById('toolbar').style.background = t.toolbarBg;
  document.getElementById('toolbar').style.borderBottomColor = t.borderColor;
  document.getElementById('settings-panel').style.background = t.panelBg;
  document.getElementById('settings-panel').style.borderLeftColor = t.borderColor;
  document.getElementById('chart-wrap').style.background = t.toolbarBg;
  document.body.style.color = t.text;

  const toolbarBtns = document.querySelectorAll('#toolbar button');
  toolbarBtns.forEach(b => {
    if (b.classList.contains('active')) {
      b.style.background = t.activeBtnBg; b.style.color = t.activeBtnText;
    } else {
      b.style.background = t.btnBg;
      b.style.color = t.text;
    }
    b.style.borderColor = t.borderColor;
  });

  const selectEls = document.querySelectorAll('#settings-panel select');
  selectEls.forEach(s => {
    s.style.background = t.selectBg;
    s.style.color = t.text;
    s.style.borderColor = t.borderColor;
  });

  const sections = document.querySelectorAll('#settings-panel .section');
  sections.forEach(sec => {
    sec.style.background = t.sectionBg;
    sec.style.borderColor = t.sectionBorder;
  });

  const h3s = document.querySelectorAll('#settings-panel .section h3');
  h3s.forEach(h => {
    h.style.color = t.h3Color;
    h.style.background = t.h3Bg;
    h.style.borderBottomColor = t.h3Border;
  });

  document.querySelectorAll('#settings-panel label').forEach(l => {
    l.style.color = t.labelColor;
  });

  // Settings toggle button
  const toggle = document.getElementById('settings-toggle');
  if (toggle) {
    toggle.style.background = t.toggleBg;
    toggle.style.borderColor = t.borderColor;
    toggle.style.color = t.toggleColor;
  }

  // Range inputs accent
  document.querySelectorAll('#settings-panel input[type="range"]').forEach(r => {
    r.style.accentColor = t.accentColor;
  });
  document.querySelectorAll('#settings-panel input[type="checkbox"]').forEach(c => {
    c.style.accentColor = t.accentColor;
  });

  // Theme buttons
  document.querySelectorAll('#settings-panel .theme-btn').forEach(b => {
    if (b.classList.contains('active')) {
      b.style.borderColor = t.accentColor;
      b.style.background = t.activeBtnBg;
      b.style.color = t.activeBtnText;
    } else {
      b.style.borderColor = t.borderColor;
      b.style.background = t.btnBg;
      b.style.color = t.text;
    }
  });

  const helpDlg = document.getElementById('help-dialog');
  if (helpDlg) {
    helpDlg.style.background = t.helpBg;
    helpDlg.style.borderColor = t.helpBorder;
    helpDlg.style.color = t.helpColor;
  }

  // Tooltip
  const tooltip = document.getElementById('tooltip');
  if (tooltip) {
    tooltip.style.background = name === 'light' ? 'rgba(255,255,255,0.95)' : t.helpBg;
    tooltip.style.borderColor = t.helpBorder;
    tooltip.style.color = t.text;
    const ttTitle = tooltip.querySelector('.tt-title');
    if (ttTitle) ttTitle.style.color = t.h3Color;
    const ttLabels = tooltip.querySelectorAll('.tt-label');
    ttLabels.forEach(l => l.style.color = t.panelText);
    const ttValues = tooltip.querySelectorAll('.tt-value');
    ttValues.forEach(v => v.style.color = t.text);
  }
}

function updateTimeInfo(viewStart, viewEnd) {
  if (viewStart == null) return;
  const str = `${formatTimeShort(viewStart)} ~ ${formatTimeShort(viewEnd)}`;
  infoTime.textContent = str;
  document.getElementById('info-range').textContent = str;
}

function updateInfo() {
  document.getElementById('info-groups').textContent = chart.totalGroupCount;
  document.getElementById('info-channels').textContent = chart.totalChannelCount;
  document.getElementById('info-blocks').textContent = chart.totalBlockCount;
  if (chart.viewStart) {
    document.getElementById('info-range').textContent = `${formatTimeShort(chart.viewStart)} ~ ${formatTimeShort(chart.viewEnd)}`;
  }
}

function formatTimeShort(ts) {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  return `${M}-${D} ${h}:${m}`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Settings panel collapse/expand
const settingsPanel = document.getElementById('settings-panel');
const settingsToggle = document.getElementById('settings-toggle');
settingsToggle.addEventListener('click', () => {
  const collapsed = settingsPanel.classList.toggle('collapsed');
  settingsToggle.textContent = collapsed ? '▶' : '◀';
});

// Section collapse/expand
document.querySelectorAll('#settings-panel .section h3').forEach(h3 => {
  h3.addEventListener('click', () => {
    h3.parentElement.classList.toggle('collapsed');
  });
});
