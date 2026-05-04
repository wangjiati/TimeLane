class TimelineChart {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    this.callbacks = callbacks;

    this.data = null;
    this.channels = [];
    this.groups = [];
    this.config = {};

    this.viewStart = null;
    this.viewEnd = null;
    this._allDataStart = null;
    this._allDataEnd = null;
    this.hasNegatives = false;

    this.hoveredBlock = null;
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragViewStart = 0;
    this.dragViewEnd = 0;
    this.mouseX = 0;
    this.mouseY = 0;
    this._cursor1 = { on: false, following: true, pixelX: -1, time: 0 };
    this._cursor2 = { on: false, following: true, pixelX: -1, time: 0 };
    this._activeCursor = 1;

    this._collapsedGroups = new Set();
    this._visData = [];
    this._totalVisContentHeight = 0;
    this._rendering = false;

    this.config = this._mergeConfig({});

    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(this.canvas.parentElement);

    this._resize();
    this._bindEvents();
  }

  loadData(data) {
    this.data = data;
    this.groups = [];
    this.channels = [];
    this._collapsedGroups = new Set();

    if (data.groups && data.groups.length > 0) {
      this.groups = data.groups;
      for (const g of data.groups) {
        if (!g.channels || g.channels.length === 0) continue;
        for (const ch of g.channels) {
          ch._groupTitle = g.title || '';
          this.channels.push(ch);
        }
      }
    } else if (data.channels) {
      this.groups = [{ title: '', description: '', channels: data.channels }];
      this.channels = data.channels;
    }

    this.config = this._mergeConfig(data.config || {});

    if (this.channels.length > 0) {
      let allStart = Infinity, allEnd = -Infinity;
      for (const ch of this.channels) {
        for (const b of ch.blocks || []) {
          const s = new Date(b.start).getTime();
          const e = new Date(b.end).getTime();
          if (s < allStart) allStart = s;
          if (e > allEnd) allEnd = e;
        }
        for (const ev of ch.events || []) {
          const t = new Date(ev.time).getTime();
          if (t < allStart) allStart = t;
          if (t > allEnd) allEnd = t;
        }
      }
      this._allDataStart = allStart;
      this._allDataEnd = allEnd;
      const pad = (allEnd - allStart) * 0.05;
      this.viewStart = allStart - pad;
      this.viewEnd = allEnd + pad;
    }

    this.hasNegatives = false;
    for (const ch of this.channels) {
      for (const b of ch.blocks || []) {
        if (b.heightPercent < 0) { this.hasNegatives = true; break; }
      }
      if (this.hasNegatives) break;
    }

    this.render();
  }

  fitAll() {
    if (this._allDataStart == null) return;
    const pad = (this._allDataEnd - this._allDataStart) * 0.05;
    this.viewStart = this._allDataStart - pad;
    this.viewEnd = this._allDataEnd + pad;
    this.render();
  }

  zoomIn() { this._zoomAt(0.3, this.canvas.clientWidth / 2); }
  zoomOut() { this._zoomAt(-0.3, this.canvas.clientWidth / 2); }

  updateConfig(key, value) {
    this.config[key] = value;
    this._resize();
  }

  setTheme(name) {
    const preset = this._themePresets[name];
    if (!preset) return;
    this.config.theme = { ...this.config.theme, ...preset };
    this.config.defaultBlockColor = preset.defaultBlockColor || this.config.defaultBlockColor;
    this.render();
  }

  selectBlock(start, end, groupTitle, channelTitle) {
    this._selectedBlock = { start, end, groupTitle, channelTitle };
    this.render();
  }

  deselectBlock() {
    this._selectedBlock = null;
    this.render();
  }

  setCursorLine(on) {
    this._cursor1.on = on;
    this._cursor1.following = true;
    this._cursor1.pixelX = -1;
    this._cursor1.time = 0;
    this.render();
  }

  setCursor1(on) {
    this._cursor1.on = on;
    this._cursor1.following = true;
    this._cursor1.pixelX = -1;
    this._cursor1.time = 0;
    this._activeCursor = 1;
    this.render();
  }

  setCursor2(on) {
    this._cursor2.on = on;
    this._cursor2.following = true;
    this._cursor2.pixelX = -1;
    this._cursor2.time = 0;
    this._activeCursor = 2;
    this.render();
  }

  toggleGroup(groupIdx) {
    if (this._collapsedGroups.has(groupIdx)) {
      this._collapsedGroups.delete(groupIdx);
    } else {
      this._collapsedGroups.add(groupIdx);
    }
    this._resize();
  }

  isGroupCollapsed(groupIdx) {
    return this._collapsedGroups.has(groupIdx);
  }

  exportSVG() {
    const svg = this._buildSVG();
    this._downloadBlob(svg, 'timeline.svg', 'image/svg+xml');
  }

  exportPNG() {
    const scale = this.config.exportScale || 2;
    const w = this.canvas.clientWidth;
    const h = Math.max(this.canvas.clientHeight, this._totalContentHeight);
    const offCanvas = document.createElement('canvas');
    offCanvas.width = w * scale;
    offCanvas.height = h * scale;
    const offCtx = offCanvas.getContext('2d');
    const origCanvas = this.canvas;
    const origCtx = this.ctx;
    this.canvas = offCanvas;
    this.ctx = offCtx;
    this.dpr = scale;
    this.render();
    this.canvas = origCanvas;
    this.ctx = origCtx;
    this.dpr = window.devicePixelRatio || 1;
    this._resize();
    offCanvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'timeline.png'; a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

  render() {
    if (this._rendering) return;
    this._rendering = true;

    this._prepareLayout();
    this._resize();
    this._syncLockedCursors();

    const ctx = this.ctx;
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;

    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.clearRect(0, 0, w, h);

    this._drawBackground(w, h);
    this._drawChartTitle(w);
    this._drawLabels(w);
    this._drawGridLines(w);
    this._drawTimeAxis(w);
    this._drawAllChannels(w);
    this._drawHoverHighlight();
    this._drawSelectedHighlight();
    this._drawCursorLine();

    ctx.restore();

    this._rendering = false;
  }

  get totalBlockCount() {
    let count = 0;
    for (const ch of this.channels) {
      count += (ch.blocks || []).length;
    }
    return count;
  }

  get totalChannelCount() {
    return this.channels.length;
  }

  get totalGroupCount() {
    return this.groups.filter(g => g.channels && g.channels.length > 0).length;
  }

  _effectiveTextReserveHeight() {
    if (this.config.blockTextPosition !== 'above') return 0;
    const evShow = this.config.showEvents;
    const fs = this.config.timeFontSize;
    let lines = 0;
    if (evShow) lines++;
    lines++; // 'above' text
    return lines * (fs + 4);
  }

  get _headerBottom() {
    const base = this.config.timeAxisHeight;
    if (this.config.chartTitle) {
      return base + (this.config.chartTitleHeight || 30);
    }
    return base;
  }

  _prepareLayout() {
    this._visData = [];
    let y = this._headerBottom;
    const cfg = this.config;

    for (let gi = 0; gi < this.groups.length; gi++) {
      const g = this.groups[gi];
      if (!g.channels || g.channels.length === 0) continue;

      const collapsed = this._collapsedGroups.has(gi);

      this._visData.push({
        type: 'group-header',
        title: g.title || '',
        y,
        collapsed,
        groupIdx: gi,
      });
      y += cfg.groupHeaderHeight;

      if (collapsed) continue;

      for (const ch of g.channels) {
        this._visData.push({
          type: 'channel',
          channel: ch,
          y,
          groupTitle: g.title,
        });
        y += this._rowHeight();
      }
    }

    this._totalVisContentHeight = y + 20;
  }

  _mergeConfig(userConfig) {
    const defaults = {
      channelHeight: 100,
      channelGap: 2,
      footerHeight: 16,
      showFooter: true,
      groupHeaderHeight: 28,
      chartTitle: '',
      chartTitleHeight: 32,
      labelWidth: 140,
      timeAxisHeight: 48,
      defaultBlockColor: '#4A90D9',
      minBlockHeightPx: 2,
      minBlockWidthPx: 2,
      fontFamily: "'Microsoft YaHei', 'PingFang SC', sans-serif",
      timeFontSize: 12,
      blockFontSize: 12,
      eventFontSize: 10,
      headerFontSize: 12,
      groupHeaderFontSize: 11,
      chartTitleFontSize: 14,
      timeFormat: 'HH:mm',
      showGridLines: true,
      showCurrentTimeLine: false,
      showEvents: true,
      blockTextPosition: 'center',
      blockTextShow: true,
      zoomMin: 0.05,
      zoomMax: 50,
      exportScale: 2,
      blockBorderRadius: 3,
      blockBorderWidth: 0,
      blockBorderColor: 'rgba(0,0,0,0.2)',
      theme: {
        backgroundColor: '#1a1a2e',
        labelBgColor: '#16162a',
        channelBgColor: '#1b1c30',
        channelBgAltColor: '#1d1e32',
        groupHeaderBgColor: 'rgba(255,255,255,0.05)',
        groupHeaderTextColor: '#ddd',
        baselineColor: 'rgba(255,255,255,0.12)',
        timeAxisColor: '#888',
        timeTextColor: '#aaa',
        timeTickColor: 'rgba(255,255,255,0.15)',
        headerTitleColor: '#eee',
        headerDescColor: '#999',
        footerColor: '#666',
        gridLineColor: 'rgba(255,255,255,0.04)',
        eventMarkerColor: '#FF6B6B',
        hoverBorderColor: '#fff',
        labelSeparatorColor: 'rgba(255,255,255,0.08)',
      },
    };
    return {
      ...defaults,
      ...userConfig,
      theme: { ...defaults.theme, ...(userConfig.theme || {}) },
    };
  }

  _rowHeight() {
    const c = this.config;
    const ftH = c.showFooter ? c.footerHeight : 0;
    return this._effectiveTextReserveHeight() + c.channelHeight + ftH + c.channelGap;
  }

  _resize() {
    const parent = this.canvas.parentElement;
    const w = parent.clientWidth;
    const h = Math.max(parent.clientHeight, this._totalContentHeight);
    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    if (this.data) this.render();
  }

  _bindEvents() {
    this.canvas.addEventListener('wheel', e => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        this._zoomAt(-e.deltaY * 0.003, e.offsetX);
      }
    }, { passive: false });

    this.canvas.addEventListener('mousedown', e => {
      if (e.button === 0) {
        this.isDragging = true;
        this.dragStartX = e.offsetX;
        this.dragViewStart = this.viewStart;
        this.dragViewEnd = this.viewEnd;
        this.canvas.style.cursor = 'grabbing';
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.canvas.style.cursor = 'default';
      }
    });

    this.canvas.addEventListener('mousemove', e => {
      this.mouseX = e.offsetX;
      this.mouseY = e.offsetY;
      if (this.isDragging) {
        const dx = e.offsetX - this.dragStartX;
        const rangeMs = this.dragViewEnd - this.dragViewStart;
        const offsetMs = -(dx / this._chartAreaWidth()) * rangeMs;
        this.viewStart = this.dragViewStart + offsetMs;
        this.viewEnd = this.dragViewEnd + offsetMs;
        this.render();
        if (this.callbacks.onTimeChange) {
          this.callbacks.onTimeChange(this.viewStart, this.viewEnd);
        }
      } else {
        const block = this._findBlockAt(e.offsetX, e.offsetY);
        if (block !== this.hoveredBlock) {
          this.hoveredBlock = block;
          this.render();
          if (this.callbacks.onHover) this.callbacks.onHover(block);
        }
        const overHeader = this._findGroupHeaderAt(e.offsetX, e.offsetY);
        if (overHeader) {
          this.canvas.style.cursor = 'pointer';
        } else {
          this.canvas.style.cursor = this._canDrag(e.offsetX, e.offsetY) ? (this.isDragging ? 'grabbing' : 'grab') : (block ? 'pointer' : 'default');
        }
      }
      var c1 = this._cursor1, c2 = this._cursor2;
      if (c1.on && c1.following && c1.pixelX !== e.offsetX) {
        c1.pixelX = e.offsetX;
        c1.time = this._xToTime(e.offsetX);
        this.render();
      }
      if (c2.on && c2.following && c2.pixelX !== e.offsetX) {
        c2.pixelX = e.offsetX;
        c2.time = this._xToTime(e.offsetX);
        this.render();
      }
    });

    this.canvas.addEventListener('mouseleave', () => {
      if (this.hoveredBlock) {
        this.hoveredBlock = null;
        this.render();
        if (this.callbacks.onHover) this.callbacks.onHover(null);
      }
    });

    this.canvas.addEventListener('dblclick', e => {
      if (this._findBlockAt(e.offsetX, e.offsetY)) {
        this._zoomAt(-0.4, e.offsetX);
      }
    });

    this.canvas.addEventListener('click', e => {
      const gh = this._findGroupHeaderAt(e.offsetX, e.offsetY);
      if (gh) {
        const blockClicked = this._findBlockAt(e.offsetX, e.offsetY);
        if (!blockClicked) {
          const gIdx = gh.groupIdx;
          this.toggleGroup(gIdx);
          if (this.callbacks.onGroupToggle) {
            this.callbacks.onGroupToggle(gIdx, this.isGroupCollapsed(gIdx));
          }
          return;
        }
      }
      const block = this._findBlockAt(e.offsetX, e.offsetY);
      if (this.callbacks.onClick) this.callbacks.onClick(block);

      // Toggle active cursor following/locked
      var ac = this._activeCursor === 1 ? this._cursor1 : this._cursor2;
      if (ac.on) {
        ac.following = !ac.following;
        if (!ac.following) {
          ac.time = this._xToTime(e.offsetX);
          ac.pixelX = e.offsetX;
        }
        this.render();
      }
    });
  }

  _canDrag(x, y) {
    return x > this.config.labelWidth && y > 0 && y < this.canvas.clientHeight;
  }

  _chartAreaWidth() {
    return this.canvas.clientWidth - this.config.labelWidth;
  }

  _timeToX(time) {
    const chartW = this._chartAreaWidth();
    const rangeMs = this.viewEnd - this.viewStart;
    if (rangeMs <= 0) return this.config.labelWidth;
    return this.config.labelWidth + ((time - this.viewStart) / rangeMs) * chartW;
  }

  _xToTime(x) {
    const chartW = this._chartAreaWidth();
    const rangeMs = this.viewEnd - this.viewStart;
    return this.viewStart + ((x - this.config.labelWidth) / chartW) * rangeMs;
  }

  _zoomAt(delta, centerX) {
    const chartW = this._chartAreaWidth();
    const rangeMs = this.viewEnd - this.viewStart;
    const ratio = Math.max(0, Math.min(1, (centerX - this.config.labelWidth) / chartW));
    const timeAtCursor = this.viewStart + ratio * rangeMs;

    let factor;
    if (delta > 0) { factor = 1 / (1 + delta); }
    else { factor = 1 + Math.abs(delta); }
    let newRange = rangeMs * factor;
    newRange = Math.max((this._allDataEnd - this._allDataStart) * this.config.zoomMin, Math.min(newRange, (this._allDataEnd - this._allDataStart) * this.config.zoomMax));

    this.viewStart = timeAtCursor - ratio * newRange;
    this.viewEnd = this.viewStart + newRange;
    this.render();
    if (this.callbacks.onTimeChange) {
      this.callbacks.onTimeChange(this.viewStart, this.viewEnd);
    }
  }

  _drawBackground(w, h) {
    const ctx = this.ctx;
    const t = this.config.theme;
    ctx.fillStyle = t.backgroundColor;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = t.labelBgColor;
    ctx.fillRect(0, 0, this.config.labelWidth, h);
  }

  _drawChartTitle(w) {
    if (!this.config.chartTitle) return;
    const ctx = this.ctx;
    const titleH = this.config.chartTitleHeight || 30;
    const t = this.config.theme;

    ctx.fillStyle = t.headerTitleColor;
    ctx.font = `bold ${this.config.chartTitleFontSize}px ${this.config.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.config.chartTitle, w / 2, titleH / 2);
  }

  _drawLabels(w) {
    if (this._visData.length === 0) return;
    const ctx = this.ctx;
    const cfg = this.config;
    const t = cfg.theme;
    const labelW = cfg.labelWidth;
    const tFont = cfg.timeFontSize;
    const effReserve = this._effectiveTextReserveHeight();
    const rowH = this._rowHeight();

    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';

    let prevGroup = null;

    for (let i = 0; i < this._visData.length; i++) {
      const item = this._visData[i];

      if (item.type === 'group-header') {
        ctx.fillStyle = t.groupHeaderBgColor;
        ctx.fillRect(0, item.y, labelW, cfg.groupHeaderHeight);

        const icon = item.collapsed ? '\u25b6' : '\u25bc';
        ctx.fillStyle = t.groupHeaderTextColor;
        ctx.font = `${cfg.groupHeaderFontSize}px ${cfg.fontFamily}`;
        ctx.textBaseline = 'middle';
        ctx.fillText(icon + ' ' + this._truncateText(item.title, labelW - 24), 12, item.y + cfg.groupHeaderHeight / 2);
        ctx.textBaseline = 'bottom';
        prevGroup = item;
        continue;
      }

      if (item.type === 'channel') {
        const ch = item.channel;
        const blockAreaTop = item.y + effReserve;
        const blockAreaBottom = blockAreaTop + cfg.channelHeight;
        const hFont = cfg.headerFontSize;

        // Title/desc inside label column, bottom-aligned with baseline
        if (ch.description) {
          ctx.fillStyle = t.headerDescColor;
          ctx.font = `${hFont - 2}px ${cfg.fontFamily}`;
          ctx.fillText(this._truncateText(ch.description, labelW - 16), 12, blockAreaBottom - hFont - 6);
        }

        ctx.fillStyle = t.headerTitleColor;
        ctx.font = `bold ${hFont}px ${cfg.fontFamily}`;
        ctx.fillText(this._truncateText(ch.title, labelW - 16), 12, blockAreaBottom - 4);
      }
    }
  }

  _drawGridLines(w) {
    if (!this.config.showGridLines) return;
    const ticks = this._getTimeTicks();
    if (!ticks) return;
    const ctx = this.ctx;
    const t = this.config.theme;

    ctx.strokeStyle = t.gridLineColor;
    ctx.lineWidth = 1;

    const startY = this._headerBottom;
    const endY = this._totalVisContentHeight - 20;

    for (const tick of ticks.ticks) {
      const x = this._timeToX(tick);
      if (x < this.config.labelWidth || x > w) continue;
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
      ctx.stroke();
    }
  }

  _drawTimeAxis(w) {
    const ctx = this.ctx;
    const cfg = this.config;
    const t = cfg.theme;
    const bottomY = this._headerBottom;
    const tFont = cfg.timeFontSize;

    const ticks = this._getTimeTicks();
    if (!ticks) return;

    ctx.fillStyle = t.timeTextColor;
    ctx.font = `${tFont}px ${cfg.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    for (const tick of ticks.ticks) {
      const x = this._timeToX(tick);
      if (x < cfg.labelWidth || x > w) continue;
      ctx.strokeStyle = t.timeTickColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, bottomY - 16);
      ctx.lineTo(x, bottomY);
      ctx.stroke();
      ctx.fillStyle = t.timeTextColor;
      ctx.fillText(this._formatTime(tick, cfg.timeFormat), x, bottomY - 20);
    }

    ctx.strokeStyle = t.timeAxisColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cfg.labelWidth, bottomY);
    ctx.lineTo(w, bottomY);
    ctx.stroke();
  }

  _drawAllChannels(w) {
    if (this._visData.length === 0) return;
    const ctx = this.ctx;
    const cfg = this.config;
    const t = cfg.theme;
    const tFont = cfg.timeFontSize;
    const labelW = cfg.labelWidth;
    const effReserve = this._effectiveTextReserveHeight();

    ctx.save();
    ctx.beginPath();
    ctx.rect(labelW, this._headerBottom, w - labelW, this.canvas.height / this.dpr - this._headerBottom);
    ctx.clip();

    let chCount = 0;
    for (let i = 0; i < this._visData.length; i++) {
      const item = this._visData[i];

      if (item.type === 'group-header') {
        ctx.fillStyle = t.groupHeaderBgColor;
        ctx.fillRect(labelW, item.y, w - labelW, cfg.groupHeaderHeight);

        const icon = item.collapsed ? '\u25b6' : '\u25bc';
        ctx.fillStyle = t.groupHeaderTextColor;
        ctx.font = `bold ${cfg.groupHeaderFontSize}px ${cfg.fontFamily}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(icon + ' ' + item.title, labelW + 12, item.y + cfg.groupHeaderHeight / 2);
        continue;
      }

      if (item.type === 'channel') {
        const ch = item.channel;
        const blockAreaTop = item.y + effReserve;
        const blockAreaBottom = blockAreaTop + cfg.channelHeight;

        ctx.fillStyle = (chCount % 2 === 0) ? t.channelBgColor : t.channelBgAltColor;
        ctx.fillRect(labelW, item.y, w - labelW, blockAreaBottom - item.y);
        chCount++;

        const baseline = this.hasNegatives ? (blockAreaTop + cfg.channelHeight / 2) : blockAreaBottom;
        ctx.strokeStyle = t.baselineColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(labelW, baseline);
        ctx.lineTo(w, baseline);
        ctx.stroke();

        this._drawChannelBlocks(ch, baseline, blockAreaTop, cfg.channelHeight);
        this._drawChannelEvents(ch, baseline, blockAreaTop);
        this._drawChannelFooter(ch, blockAreaBottom);
      }
    }

    ctx.restore();
  }

  _drawChannelBlocks(channel, baseline, areaTop, areaHeight) {
    const ctx = this.ctx;
    const cfg = this.config;

    for (const block of channel.blocks || []) {
      const startTime = new Date(block.start).getTime();
      const endTime = new Date(block.end).getTime();

      let x = this._timeToX(startTime);
      let bw = this._timeToX(endTime) - x;
      if (bw < cfg.minBlockWidthPx) bw = cfg.minBlockWidthPx;

      const hPercent = block.heightPercent || 0;
      const maxBlockH = this.hasNegatives ? areaHeight / 2 : areaHeight;
      let bh = Math.abs(hPercent) / 100 * maxBlockH;
      if (bh < cfg.minBlockHeightPx) bh = cfg.minBlockHeightPx;

      let by;
      if (hPercent >= 0) { by = baseline - bh; }
      else { by = baseline; }

      const color = block.color || cfg.defaultBlockColor;
      this._drawRoundedRect(x, by, bw, bh, cfg.blockBorderRadius);
      ctx.fillStyle = color;
      ctx.fill();

      if (cfg.blockBorderWidth > 0) {
        ctx.strokeStyle = cfg.blockBorderColor;
        ctx.lineWidth = cfg.blockBorderWidth;
        ctx.stroke();
      }

      const tc = (block.textConfig || {});
      const blockShow = tc.show !== false && cfg.blockTextShow !== false;
      if (blockShow && block.text && bw > 30) {
        const fontSize = cfg.blockFontSize;
        const fontColor = tc.color || '#fff';
        ctx.fillStyle = fontColor;
        ctx.font = `${fontSize}px ${cfg.fontFamily}`;
        ctx.textAlign = 'center';

        const pos = cfg.blockTextPosition || 'center';
        const textX = x + bw / 2;
        let textY;

        switch (pos) {
          case 'top':
            ctx.textBaseline = 'top';
            textY = by + 3;
            break;
          case 'bottom':
            ctx.textBaseline = 'bottom';
            textY = by + bh - 3;
            break;
          case 'above':
            ctx.textBaseline = 'bottom';
            textY = areaTop - this._effectiveTextReserveHeight() + fontSize;
            break;
          case 'below':
            ctx.textBaseline = 'top';
            textY = by + bh + 3;
            break;
          default:
            ctx.textBaseline = 'middle';
            textY = by + bh / 2;
            break;
        }

        const txt = this._truncateText(block.text, bw - 4, `${fontSize}px ${cfg.fontFamily}`);
        ctx.fillText(txt, textX, textY);
      }
    }
  }

  _drawChannelEvents(channel, baseline, blockAreaTop) {
    if (!this.config.showEvents) return;
    const ctx = this.ctx;
    const cfg = this.config;
    const evFontSize = cfg.eventFontSize;

    for (const ev of channel.events || []) {
      const t = new Date(ev.time).getTime();
      const x = this._timeToX(t);
      if (x < cfg.labelWidth || x > this.canvas.clientWidth) continue;

      const color = ev.color || cfg.theme.eventMarkerColor;
      ctx.fillStyle = color;
      ctx.font = `${evFontSize}px ${cfg.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const textY = blockAreaTop - 5;
      ctx.fillText(ev.text, x, textY);

      const markerSize = 4;
      const triBaseY = textY + 2;
      const triTipY = triBaseY + markerSize + 3;
      ctx.beginPath();
      ctx.moveTo(x, triTipY);
      ctx.lineTo(x - markerSize, triBaseY);
      ctx.lineTo(x + markerSize, triBaseY);
      ctx.closePath();
      ctx.fill();
    }
  }

  _drawChannelFooter(channel, blockAreaBottom) {
    if (!channel.footer || !this.config.showFooter) return;
    const ctx = this.ctx;
    const cfg = this.config;
    const tFont = cfg.timeFontSize;
    const footerY = blockAreaBottom + 2;

    ctx.fillStyle = cfg.theme.footerColor;
    ctx.font = `${tFont - 2}px ${cfg.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(channel.footer, cfg.labelWidth + 8, footerY);
  }

  _drawHoverHighlight() {
    if (!this.hoveredBlock) return;
    const block = this.hoveredBlock;
    const ctx = this.ctx;
    const startTime = new Date(block.start).getTime();
    const endTime = new Date(block.end).getTime();

    let x = this._timeToX(startTime);
    let bw = this._timeToX(endTime) - x;
    if (bw < this.config.minBlockWidthPx) bw = this.config.minBlockWidthPx;

    const ch = block._channel;
    if (!ch) return;

    const item = this._visData.find(d => d.type === 'channel' && d.channel === ch);
    if (!item) return;

    const cfg = this.config;
    const areaTop = item.y + this._effectiveTextReserveHeight();
    const areaHeight = cfg.channelHeight;
    const baseline = this.hasNegatives ? (areaTop + areaHeight / 2) : (areaTop + areaHeight);

    const hPercent = block.heightPercent || 0;
    const maxBlockH = this.hasNegatives ? areaHeight / 2 : areaHeight;
    let bh = Math.abs(hPercent) / 100 * maxBlockH;
    if (bh < cfg.minBlockHeightPx) bh = cfg.minBlockHeightPx;

    let y;
    if (hPercent >= 0) { y = baseline - bh; }
    else { y = baseline; }

    ctx.strokeStyle = cfg.theme.hoverBorderColor;
    ctx.lineWidth = 2;
    this._drawRoundedRect(x - 1, y - 1, bw + 2, bh + 2, cfg.blockBorderRadius + 1);
    ctx.stroke();
  }

  _drawSelectedHighlight() {
    const sel = this._selectedBlock;
    if (!sel) return;

    const ctx = this.ctx;
    const cfg = this.config;
    const effReserve = this._effectiveTextReserveHeight();

    for (const item of this._visData) {
      if (item.type !== 'channel') continue;
      const ch = item.channel;
      if (!sel.channelTitle || ch.title !== sel.channelTitle) continue;
      if (sel.groupTitle != null && ch._groupTitle !== sel.groupTitle) continue;

      for (const block of ch.blocks || []) {
        if (block.start !== sel.start || block.end !== sel.end) continue;

        const startTime = new Date(block.start).getTime();
        const endTime = new Date(block.end).getTime();
        let x = this._timeToX(startTime);
        let bw = this._timeToX(endTime) - x;
        if (bw < cfg.minBlockWidthPx) bw = cfg.minBlockWidthPx;

        const areaTop = item.y + this._effectiveTextReserveHeight();
        const areaHeight = cfg.channelHeight;
        const baseline = this.hasNegatives ? (areaTop + areaHeight / 2) : (areaTop + areaHeight);

        const hPercent = block.heightPercent || 0;
        const maxBlockH = this.hasNegatives ? areaHeight / 2 : areaHeight;
        let bh = Math.abs(hPercent) / 100 * maxBlockH;
        if (bh < cfg.minBlockHeightPx) bh = cfg.minBlockHeightPx;

        let by;
        if (hPercent >= 0) { by = baseline - bh; }
        else { by = baseline; }

        ctx.save();
        ctx.strokeStyle = '#4A90D9';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([5, 3]);
        this._drawRoundedRect(x - 1, by - 1, bw + 2, bh + 2, cfg.blockBorderRadius + 1);
        ctx.stroke();
        ctx.restore();
        return;
      }
    }
  }

  _syncLockedCursors() {
    var c1 = this._cursor1, c2 = this._cursor2;
    if (c1.on && !c1.following && c1.time) {
      c1.pixelX = this._timeToX(c1.time);
    }
    if (c2.on && !c2.following && c2.time) {
      c2.pixelX = this._timeToX(c2.time);
    }
  }

  _drawCursorLine() {
    var c1 = this._cursor1, c2 = this._cursor2;
    var x1 = c1.pixelX, x2 = c2.pixelX;
    if ((!c1.on || x1 < 0) && (!c2.on || x2 < 0)) return;

    var ctx = this.ctx;
    var cfg = this.config;
    var w = this.canvas.width / this.dpr;
    var h = this.canvas.height / this.dpr;
    var hb = this._headerBottom;

    ctx.save();

    function drawCursor(c, x, color) {
      var locked = !c.following;
      ctx.strokeStyle = color;
      ctx.lineWidth = locked ? 2 : 1.5;
      ctx.setLineDash(locked ? [10, 3] : [6, 4]);
      ctx.beginPath();
      ctx.moveTo(x + 0.5, hb);
      ctx.lineTo(x + 0.5, h);
      ctx.stroke();

      // Time label at top
      var time = c.time || 0;
      var label = formatTimeLabel(time, cfg.timeFormat);
      var fontSize = 10;
      ctx.font = fontSize + 'px ' + cfg.fontFamily;
      var textW = ctx.measureText(label).width + 8;
      var textH = fontSize + 5;
      var tx = x - textW / 2;
      var ty = hb - textH - 2;

      // Clamp label within canvas
      if (tx < 4) tx = 4;
      if (tx + textW > w - 4) tx = w - textW - 4;

      // Arrow point
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, hb - 4);
      ctx.lineTo(x - 5, hb - textH - 6);
      ctx.lineTo(x + 5, hb - textH - 6);
      ctx.closePath();
      ctx.fill();

      // Label background
      ctx.fillStyle = 'rgba(20,20,40,0.9)';
      ctx.fillRect(tx, ty, textW, textH);
      ctx.strokeStyle = locked ? color : 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeRect(tx, ty, textW, textH);

      // Label text
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, ty + textH / 2);
    }

    if (c1.on && x1 >= 0) {
      drawCursor.call(this, c1, x1, 'rgba(74,144,217,0.7)');
    }
    if (c2.on && x2 >= 0) {
      drawCursor.call(this, c2, x2, 'rgba(255,107,107,0.7)');
    }

    // Delta bracket + duration label when both active
    if (c1.on && c2.on && x1 >= 0 && x2 >= 0 && x1 !== x2) {
      var lx = Math.min(x1, x2), rx = Math.max(x1, x2);
      var midX = (lx + rx) / 2;
      var bracketY = hb + 2;

      var time1 = this._xToTime(lx);
      var time2 = this._xToTime(rx);
      var deltaMs = time2 - time1;
      var deltaStr = formatDuration(deltaMs);

      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lx, bracketY);
      ctx.lineTo(lx, bracketY + 8);
      ctx.moveTo(lx, bracketY + 8);
      ctx.lineTo(rx, bracketY + 8);
      ctx.moveTo(rx, bracketY + 8);
      ctx.lineTo(rx, bracketY);
      ctx.stroke();

      ctx.font = 'bold 11px ' + cfg.fontFamily;
      var tW = ctx.measureText(deltaStr).width + 10;
      var tH = 16;
      var tX = midX - tW / 2;
      var tY = bracketY + 8;

      ctx.fillStyle = 'rgba(20,20,40,0.9)';
      ctx.fillRect(tX, tY, tW, tH);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.strokeRect(tX, tY, tW, tH);
      ctx.fillStyle = '#4A90D9';
      ctx.fillText(deltaStr, midX, tY + tH / 2);
    }

    ctx.restore();
  }

  _xToTime(x) {
    if (this.viewStart == null) return 0;
    var labelW = this.config.labelWidth;
    var chartW = this.canvas.width / this.dpr - labelW;
    var ratio = (x - labelW) / chartW;
    return this.viewStart + ratio * (this.viewEnd - this.viewStart);
  }

  _drawRoundedRect(x, y, w, h, r) {
    const ctx = this.ctx;
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  _findBlockAt(mx, my) {
    if (this._visData.length === 0) return null;
    const cfg = this.config;

    const hb = this._headerBottom;
    if (mx < cfg.labelWidth || my < hb) return null;

    const effReserve = this._effectiveTextReserveHeight();

    for (let i = this._visData.length - 1; i >= 0; i--) {
      const item = this._visData[i];
      if (item.type !== 'channel') continue;

      const areaTop = item.y + this._effectiveTextReserveHeight();
      const areaBottom = areaTop + cfg.channelHeight;
      if (my < areaTop || my > areaBottom) continue;

      const ch = item.channel;
      const blocks = ch.blocks || [];
      const areaHeight = cfg.channelHeight;
      const baseline = this.hasNegatives ? (areaTop + areaHeight / 2) : areaBottom;
      const maxBlockH = this.hasNegatives ? areaHeight / 2 : areaHeight;

      for (let j = blocks.length - 1; j >= 0; j--) {
        const b = blocks[j];
        const sx = this._timeToX(new Date(b.start).getTime());
        const ex = this._timeToX(new Date(b.end).getTime());
        let bx = sx;
        let bw = ex - sx;
        if (bw < cfg.minBlockWidthPx) bw = cfg.minBlockWidthPx;

        const hp = b.heightPercent || 0;
        let bh = Math.abs(hp) / 100 * maxBlockH;
        if (bh < cfg.minBlockHeightPx) bh = cfg.minBlockHeightPx;

        let by;
        if (hp >= 0) { by = baseline - bh; }
        else { by = baseline; }

        if (mx >= bx && mx <= bx + bw && my >= by && my <= by + bh) {
          b._channel = ch;
          return b;
        }
      }
    }
    return null;
  }

  _findGroupHeaderAt(mx, my) {
    if (this._visData.length === 0) return null;
    const cfg = this.config;
    const w = this.canvas.clientWidth;

    for (const item of this._visData) {
      if (item.type !== 'group-header') continue;
      if (mx >= 0 && mx <= w && my >= item.y && my <= item.y + cfg.groupHeaderHeight) {
        return item;
      }
    }
    return null;
  }

  get _totalContentHeight() {
    return this._totalVisContentHeight || this._headerBottom + 20;
  }

  _getTimeTicks() {
    if (this.viewStart == null) return null;
    const rangeMs = this.viewEnd - this.viewStart;
    if (rangeMs <= 0) return null;
    const targetTicks = 14;
    const roughMs = rangeMs / targetTicks;

    const intervals = [
      1000, 2000, 5000, 10000, 15000, 30000,
      60000, 120000, 300000, 600000, 900000, 1800000,
      3600000, 7200000, 10800000, 14400000, 21600000, 43200000,
      86400000, 172800000, 604800000
    ];

    let niceIv = intervals[0];
    for (const iv of intervals) {
      niceIv = iv;
      if (iv >= roughMs) break;
    }

    const startTime = Math.floor(this.viewStart / niceIv) * niceIv;
    const ticks = [];
    for (let t = startTime; t <= this.viewEnd; t += niceIv) {
      ticks.push(t);
    }
    return { ticks, interval: niceIv };
  }

  _formatTime(timestamp, format) {
    const d = new Date(timestamp);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');

    switch (format) {
      case 'HH:mm': return `${h}:${m}`;
      case 'HH:mm:ss': return `${h}:${m}:${s}`;
      case 'MM-DD HH:mm': return `${d.getMonth() + 1}/${d.getDate()} ${h}:${m}`;
      case 'YYYY-MM-DD': return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      default: return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${h}:${m}`;
    }
  }

  _truncateText(text, maxWidth, fontStr) {
    if (!text) return '';
    const ctx = this.ctx;
    if (fontStr) { ctx.save(); ctx.font = fontStr; }
    const w = ctx.measureText(text).width;
    if (fontStr) ctx.restore();
    if (w <= maxWidth) return text;

    let lo = 0, hi = text.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const sub = text.substring(0, mid) + '\u2026';
      if (fontStr) { ctx.save(); ctx.font = fontStr; }
      const sw = ctx.measureText(sub).width;
      if (fontStr) ctx.restore();
      if (sw <= maxWidth) { lo = mid; }
      else { hi = mid - 1; }
    }
    return text.substring(0, lo) + '\u2026';
  }

  _buildSVG() {
    if (!this.data || this._visData.length === 0) return '';
    const cfg = this.config;
    const t = cfg.theme;
    const tFont = cfg.timeFontSize;
    const effReserve = this._effectiveTextReserveHeight();
    const svgW = this.canvas.clientWidth;
    const svgH = this._totalContentHeight;
    const labelW = cfg.labelWidth;
    const hb = this._headerBottom;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" font-family="${cfg.fontFamily}">\n`;
    svg += `<rect width="${svgW}" height="${svgH}" fill="${t.backgroundColor}" />\n`;
    svg += `<rect width="${labelW}" height="${svgH}" fill="${t.labelBgColor}" />\n`;

    if (cfg.chartTitle) {
      svg += `<text x="${svgW / 2}" y="${cfg.chartTitleHeight / 2}" text-anchor="middle" dominant-baseline="central" fill="${t.headerTitleColor}" font-size="${cfg.chartTitleFontSize}" font-weight="bold">${this._escapeXml(cfg.chartTitle)}</text>\n`;
    }

    const ticks = this._getTimeTicks();
    if (ticks) {
      for (const tick of ticks.ticks) {
        const x = this._timeToX(tick);
        if (x < labelW || x > svgW) continue;
        svg += `<line x1="${x}" y1="${hb - 16}" x2="${x}" y2="${hb}" stroke="${t.timeTickColor}" stroke-width="1" />\n`;
        svg += `<text x="${x}" y="${hb - 22}" text-anchor="middle" fill="${t.timeTextColor}" font-size="${tFont}">${this._formatTime(tick, cfg.timeFormat)}</text>\n`;

        if (cfg.showGridLines) {
          svg += `<line x1="${x}" y1="${hb}" x2="${x}" y2="${this._totalVisContentHeight - 20}" stroke="${t.gridLineColor}" stroke-width="1" />\n`;
        }
      }
    }

    svg += `<line x1="${labelW}" y1="${hb}" x2="${svgW}" y2="${hb}" stroke="${t.timeAxisColor}" stroke-width="1" />\n`;

    let svgChCount = 0;
    for (const item of this._visData) {
      if (item.type === 'group-header') {
        svg += `<rect x="${0}" y="${item.y}" width="${labelW}" height="${cfg.groupHeaderHeight}" fill="${t.groupHeaderBgColor}" />\n`;
        svg += `<rect x="${labelW}" y="${item.y}" width="${svgW - labelW}" height="${cfg.groupHeaderHeight}" fill="${t.groupHeaderBgColor}" />\n`;
        svg += `<text x="${labelW + 12}" y="${item.y + cfg.groupHeaderHeight / 2}" text-anchor="start" dominant-baseline="central" fill="${t.groupHeaderTextColor}" font-size="${cfg.groupHeaderFontSize}" font-weight="bold">${this._escapeXml(item.title)}</text>\n`;
        continue;
      }

      if (item.type === 'channel') {
        const ch = item.channel;
        const blockAreaTop = item.y + effReserve;
        const areaHeight = cfg.channelHeight;
        const areaBottom = blockAreaTop + areaHeight;
        const baseline = this.hasNegatives ? (blockAreaTop + areaHeight / 2) : areaBottom;
        const maxBlockH = this.hasNegatives ? areaHeight / 2 : areaHeight;

        const bgColor = (svgChCount % 2 === 0) ? t.channelBgColor : t.channelBgAltColor;
        svg += `<rect x="${labelW}" y="${item.y}" width="${svgW - labelW}" height="${areaBottom - item.y}" fill="${bgColor}" />\n`;
        svgChCount++;

        svg += `<text x="12" y="${areaBottom - 4}" text-anchor="start" dominant-baseline="baseline" fill="${t.headerTitleColor}" font-size="${cfg.headerFontSize}" font-weight="bold">${this._escapeXml(ch.title)}</text>\n`;
        if (ch.description) {
          svg += `<text x="12" y="${areaBottom - cfg.headerFontSize - 6}" text-anchor="start" dominant-baseline="baseline" fill="${t.headerDescColor}" font-size="${cfg.headerFontSize - 2}">${this._escapeXml(ch.description)}</text>\n`;
        }

        svg += `<line x1="${labelW}" y1="${baseline}" x2="${svgW}" y2="${baseline}" stroke="${t.baselineColor}" stroke-width="1" />\n`;

        for (const block of ch.blocks || []) {
          const sx = this._timeToX(new Date(block.start).getTime());
          const ex = this._timeToX(new Date(block.end).getTime());
          let bx = sx;
          let bw = ex - sx;
          if (bw < cfg.minBlockWidthPx) bw = cfg.minBlockWidthPx;

          const hp = block.heightPercent || 0;
          let bh = Math.abs(hp) / 100 * maxBlockH;
          if (bh < cfg.minBlockHeightPx) bh = cfg.minBlockHeightPx;

          let by;
          if (hp >= 0) { by = baseline - bh; }
          else { by = baseline; }

          const color = block.color || cfg.defaultBlockColor;
          const r = cfg.blockBorderRadius;
          svg += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${r}" ry="${r}" fill="${color}" stroke="${cfg.blockBorderColor}" stroke-width="${cfg.blockBorderWidth}" />\n`;

          const tc = block.textConfig || {};
          const blockShow = tc.show !== false && cfg.blockTextShow !== false;
          if (blockShow && block.text && bw > 30) {
            const fs = cfg.blockFontSize;
            const fc = tc.color || '#fff';
            const pos = cfg.blockTextPosition || 'center';
            const textX = bx + bw / 2;
            let textY, anchor, dv;

            switch (pos) {
              case 'top':
                textY = by + 3 + fs; anchor = 'middle'; dv = 'hanging'; break;
              case 'bottom':
                textY = by + bh - 3; anchor = 'middle'; dv = 'baseline'; break;
              case 'above':
                textY = blockAreaTop - effReserve + fs; anchor = 'middle'; dv = 'baseline'; break;
              case 'below':
                textY = by + bh + 3 + fs; anchor = 'middle'; dv = 'hanging'; break;
              default:
                textY = by + bh / 2; anchor = 'middle'; dv = 'central'; break;
            }
            svg += `<text x="${textX}" y="${textY}" text-anchor="${anchor}" dominant-baseline="${dv}" fill="${fc}" font-size="${fs}">${this._escapeXml(block.text)}</text>\n`;
          }
        }

        if (cfg.showEvents) {
          for (const ev of ch.events || []) {
            const evTime = new Date(ev.time).getTime();
            const ex2 = this._timeToX(evTime);
            if (ex2 < labelW || ex2 > svgW) continue;
            const ms = 4;
            const color = ev.color || t.eventMarkerColor;
            const evTextY = blockAreaTop - 5;
            const triBaseY = evTextY + 2;
            const triTipY = triBaseY + ms + 3;
            svg += `<text x="${ex2}" y="${evTextY}" text-anchor="middle" dominant-baseline="baseline" fill="${ev.color || t.eventMarkerColor}" font-size="${cfg.eventFontSize}">${this._escapeXml(ev.text)}</text>\n`;
            svg += `<polygon points="${ex2},${triTipY} ${ex2 - ms},${triBaseY} ${ex2 + ms},${triBaseY}" fill="${color}" />\n`;
          }
        }

        if (ch.footer) {
          svg += `<text x="${labelW + 8}" y="${areaBottom + 12}" fill="${t.footerColor}" font-size="${tFont - 2}">${this._escapeXml(ch.footer)}</text>\n`;
        }
      }
    }

    svg += '</svg>';
    return svg;
  }

  _escapeXml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  _downloadBlob(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  get _themePresets() {
    return {
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
  }
}

function formatDuration(ms) {
  if (ms < 0) ms = -ms;
  var totalSec = Math.round(ms / 1000);
  var h = Math.floor(totalSec / 3600);
  var m = Math.floor((totalSec % 3600) / 60);
  var s = totalSec % 60;
  var parts = [];
  if (h > 0) parts.push(h + 'h');
  if (m > 0 || h > 0) parts.push(m + 'm');
  parts.push(s + 's');
  return parts.join(' ');
}

function formatTimeLabel(ts, fmt) {
  if (!ts) return '';
  var d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  var h = String(d.getHours()).padStart(2, '0');
  var m = String(d.getMinutes()).padStart(2, '0');
  var s = String(d.getSeconds()).padStart(2, '0');
  var M = String(d.getMonth() + 1).padStart(2, '0');
  var D = String(d.getDate()).padStart(2, '0');
  var Y = d.getFullYear();
  switch (fmt) {
    case 'HH:mm':        return h + ':' + m;
    case 'HH:mm:ss':     return h + ':' + m + ':' + s;
    case 'MM-DD HH:mm':  return M + '-' + D + ' ' + h + ':' + m;
    case 'YYYY-MM-DD':   return Y + '-' + M + '-' + D;
    default:             return M + '-' + D + ' ' + h + ':' + m;
  }
}
