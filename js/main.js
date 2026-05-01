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

document.getElementById('cfg-timeFmt').addEventListener('change', (e) => {
  chart.updateConfig('timeFormat', e.target.value);
});

document.getElementById('cfg-events').addEventListener('change', (e) => {
  chart.updateConfig('showEvents', e.target.checked);
});

document.getElementById('cfg-grid').addEventListener('change', (e) => {
  chart.updateConfig('showGridLines', e.target.checked);
});

const labelWSlider = document.getElementById('cfg-labelW');
const valLabelW = document.getElementById('val-labelW');
labelWSlider.addEventListener('input', () => {
  const v = parseInt(labelWSlider.value);
  valLabelW.textContent = v;
  chart.updateConfig('labelWidth', v);
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
  document.getElementById('cfg-timeFmt').value = cfg.timeFormat;
  document.getElementById('cfg-events').checked = cfg.showEvents;
  document.getElementById('cfg-grid').checked = cfg.showGridLines;
  document.getElementById('cfg-labelW').value = cfg.labelWidth;
  document.getElementById('val-labelW').textContent = cfg.labelWidth;
}

function applyPageTheme(name) {
  const themes = {
    dark:  { bodyBg: '#0f0f23', toolbarBg: '#1a1a2e', panelBg: '#16162a', text: '#ccc', panelText: '#aaa', borderColor: 'rgba(255,255,255,0.08)' },
    light: { bodyBg: '#e8e8e8', toolbarBg: '#f0f0f0', panelBg: '#f5f5f5', text: '#333', panelText: '#555', borderColor: 'rgba(0,0,0,0.1)' },
    blue:  { bodyBg: '#08111a', toolbarBg: '#0d1b2a', panelBg: '#0a1522', text: '#a0c8e8', panelText: '#7a9fbf', borderColor: 'rgba(255,255,255,0.08)' },
    green: { bodyBg: '#0a140e', toolbarBg: '#0f1a14', panelBg: '#0c1610', text: '#a5d6a7', panelText: '#6a9a6e', borderColor: 'rgba(255,255,255,0.06)' },
    warm:  { bodyBg: '#16100e', toolbarBg: '#1e1814', panelBg: '#191411', text: '#ffccbc', panelText: '#a68a6d', borderColor: 'rgba(255,255,255,0.06)' },
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
      b.style.background = '#4A90D9'; b.style.color = '#fff';
    } else {
      b.style.background = name === 'light' ? '#e0e0e0' : '#2a2a4a';
      b.style.color = t.text;
    }
    b.style.borderColor = t.borderColor;
  });

  const selectEls = document.querySelectorAll('#settings-panel select');
  selectEls.forEach(s => {
    s.style.background = name === 'light' ? '#e0e0e0' : '#2a2a4a';
    s.style.color = t.text;
    s.style.borderColor = 'rgba(128,128,128,0.2)';
  });

  const sections = document.querySelectorAll('#settings-panel .section');
  sections.forEach(sec => {
    sec.style.background = name === 'light' ? '#ffffff' : 'rgba(255,255,255,0.025)';
    sec.style.borderColor = name === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)';
  });

  const h3s = document.querySelectorAll('#settings-panel .section h3');
  h3s.forEach(h => {
    h.style.color = name === 'light' ? '#333' : '#eee';
    h.style.background = name === 'light' ? '#f0f0f0' : 'rgba(255,255,255,0.04)';
    h.style.borderBottomColor = name === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
  });

  document.querySelectorAll('#settings-panel label').forEach(l => {
    l.style.color = name === 'light' ? '#555' : '#bbb';
  });

  const helpDlg = document.getElementById('help-dialog');
  if (helpDlg) {
    helpDlg.style.background = name === 'light' ? '#f8f8f8' : '#1a1a2e';
    helpDlg.style.borderColor = name === 'light' ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)';
    helpDlg.style.color = name === 'light' ? '#333' : '#ccc';
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
