# TimeLane

纯前端时间轴可视化工具，类似甘特图但色块高度和颜色可变，用于表达多维度属性在时间轴上的关系。每条通道像一条由色块组成的"彩带"（Lane），随时间轴（Chrono）延展。

> **在线演示**：https://wangjiati.github.io/TimeLane/

---

## 功能

### 图表查看器 (`chart.html`)

- **多通道时间轴** — 多个通道垂直堆叠，分组管理，支持折叠/展开
- **色块三维度** — X轴 = 时间，Y轴 = 属性值(百分比)，颜色 = 自定义属性
- **事件标注** — 时间点上的文字标记，三角箭头指向色块
- **交互** — Ctrl+滚轮缩放，拖拽平移，悬停查看详情
- **双游标测量** — 两根独立游标线(A蓝色/B红色)，点击锁定/解锁，双线显示时间差值
- **右侧设置面板** — 实时调整通道、色块、事件、分组等 30+ 项参数
- **紧凑模式** — 一键最小化所有间距，通道紧贴排列
- **导出** — SVG 矢量图、PNG 位图
- **5 套主题** — 暗色 / 亮色 / 蓝色 / 墨绿 / 暖棕

### 数据编辑器 (`editor.html`)

- **实时预览** — 上方 Canvas 图表，下方数据编辑，变更即时刷新
- **Tab 页签** — 配置表(30+ 项) + 数据表(统一表格，Group/Channel 作为列)
- **列筛选排序** — 列头点击排序(▲/▼)，各行输入框模糊筛选
- **双击选中** — 双击数据行高亮对应色块；点击色块高亮对应行并滚入视野
- **导入/导出** — JSON 文件加载、下载，5 个示例数据快速切换

---

## 快速开始

**在线体验**：访问 [https://wangjiati.github.io/TimeLane/](https://wangjiati.github.io/TimeLane/) 即可使用，无需安装。

本地运行：

```
python -m http.server 8080
# 浏览器打开 http://localhost:8080
```

- 示例列表：`index.html`
- 图表查看器：`chart.html?sample=taxi`
- 数据编辑器：`editor.html`

---

## 示例场景

| 示例 | 数据文件 | 通道 | 时间 | 说明 |
|------|---------|------|------|------|
| 🍽️ 饭店餐桌 | `data.json` | 20桌 5组 | 72h | 高度=消费额，颜色=满意度 |
| 🚕 出租车营收 | `data-taxi.json` | 6车 1组 | 24h | 高度=收入，颜色=盈利评级 |
| 📚 学生阅读 | `data-reading.json` | 10人 2组 | 30天 | 高度=字数，颜色=阅读量 |
| ✈️ 机场跑道 | `data-airport.json` | 4跑道 1组 | 24h | 高度=延误，颜色=航空公司 |
| 🏭 SMT产线 | `data-smt.json` | 12通道 3组 | 48h | 高度=速度，颜色=状态 |
| 🛵 美团骑手 | `data-meituan.json` | 20骑手 4组 | 7天 | 高度=收入，颜色=收入等级 |
| 🏥 护士值班 | `data-nurse.json` | 18护士 3组 | 7天 | 白→中→夜轮转，24h覆盖 |

---

## 文件结构

```
TimeLane/
├── index.html              # 主页 (示例列表)
├── chart.html              # 图表查看器 + 设置面板
├── editor.html             # 数据编辑器 (实时预览)
├── README.md
├── LICENSE
├── data.json               # 默认数据 (饭店)
├── data-taxi.json          # 出租车数据
├── data-reading.json       # 学生阅读数据
├── data-airport.json       # 机场跑道数据
├── data-restaurant.json    # 饭店餐桌数据
├── data-smt.json           # SMT产线数据
├── data-meituan.json       # 美团骑手数据
├── data-nurse.json         # 护士值班数据
├── 头脑风暴.txt             # 设计文档
├── .github/workflows/      # GitHub Pages 部署
└── js/
    ├── chart.js            # 图表引擎 (TimelineChart 类)
    ├── main.js             # 图表查看器页面逻辑
    └── editor.js           # 数据编辑器逻辑
```

---

## JSON 数据格式

```json
{
  "groups": [{
    "title": "分组名称",
    "description": "分组说明",
    "channels": [{
      "title": "通道标题",
      "description": "通道说明",
      "footer": "底部文字(可选)",
      "blocks": [{
        "start": "2024-05-01T09:30:00",
        "end": "2024-05-01T10:45:00",
        "heightPercent": 24,
        "color": "#FF6B6B",
        "text": "色块文字",
        "textConfig": { "show": true, "color": "#fff" },
        "properties": { "收入": "¥480" }
      }],
      "events": [{
        "time": "2024-05-01T11:10:00",
        "text": "上菜",
        "color": "#FF6B6B"
      }]
    }]
  }],
  "config": {
    "chartTitle": "图表标题",
    "channelHeight": 100,
    "timeFormat": "HH:mm",
    "showEvents": true
  }
}
```

> **注意**：即使只提供 `channels` 数组（不包 `groups`），引擎会自动包装为单分组。

---

## 配置参考

以下为 `data.config` 完整可配置项及默认值：

| 分类 | 配置项 | 默认值 | 说明 |
|------|--------|--------|------|
| 基础 | `chartTitle` | `''` | 图表顶部标题 |
| | `chartTitleHeight` | `32` | 标题区高度 |
| | `chartTitleFontSize` | `14` | 图表标题字号 |
| | `labelWidth` | `140` | 左侧标签列宽度 |
| | `timeFormat` | `'HH:mm'` | HH:mm / HH:mm:ss / MM-DD HH:mm / YYYY-MM-DD |
| 通道 | `channelHeight` | `100` | 色块区域高度 |
| | `channelGap` | `2` | 通道间距 |
| | `headerFontSize` | `12` | 通道标题/说明字号 |
| | `footerHeight` | `16` | 底部说明区高度 |
| | `showFooter` | `true` | 显示底部说明 |
| | `groupHeaderHeight` | `28` | 分组标题栏高度 |
| | `groupHeaderFontSize` | `11` | 分组头字号 |
| 色块 | `blockTextShow` | `true` | 显示色块文字 |
| | `blockTextPosition` | `'center'` | center / top / bottom / above / below |
| | `blockFontSize` | `12` | 色块文字字号 |
| | `defaultBlockColor` | `'#4A90D9'` | 色块默认颜色 |
| | `blockBorderRadius` | `3` | 色块圆角半径 |
| | `blockBorderWidth` | `0` | 色块边框宽度 |
| | `blockBorderColor` | `'rgba(0,0,0,0.2)'` | 色块边框颜色 |
| | `minBlockHeightPx` | `2` | 最小色块高度(像素) |
| | `minBlockWidthPx` | `2` | 最小色块宽度(像素) |
| 事件 | `showEvents` | `true` | 显示事件标注 |
| | `eventFontSize` | `10` | 事件文字字号 |
| 时间轴 | `timeAxisHeight` | `48` | 时间轴区域高度 |
| | `timeFontSize` | `12` | 时间刻度文字字号 |
| | `showGridLines` | `true` | 显示纵向网格线 |
| | `showCurrentTimeLine` | `false` | 显示当前时间线 |
| 缩放 | `zoomMin` | `0.05` | 最小缩放比例 |
| | `zoomMax` | `50` | 最大缩放比例 |
| | `exportScale` | `2` | 导出图片倍率 |
| 字体 | `fontFamily` | `'Microsoft YaHei...'` | 全局字体 |

主题色（`config.theme`）包含 17 个颜色属性 + `defaultBlockColor`，支持 `dark/light/blue/green/warm` 5 套预设。

---

## TimelineChart API

```js
const chart = new TimelineChart(canvas, { onHover, onClick, onTimeChange, onGroupToggle });
```

| 方法 | 说明 |
|------|------|
| `loadData(data)` | 加载 JSON 数据 |
| `fitAll()` | 缩放至全部数据可见 |
| `zoomIn()` / `zoomOut()` | 放大 / 缩小 |
| `updateConfig(key, value)` | 更新单个配置项并重绘 |
| `setTheme(name)` | 切换主题预设 (`dark/light/blue/green/warm`) |
| `selectBlock(start, end, groupTitle, channelTitle)` | 高亮指定色块(蓝色虚线) |
| `deselectBlock()` | 取消色块高亮 |
| `setCursor1(on)` / `setCursor2(on)` | 开关游标线(A/B)，跟随鼠标 |
| `toggleGroup(idx)` | 折叠/展开分组 |
| `exportSVG()` / `exportPNG()` | 导出图片 |

---

## 技术栈

- 纯前端 (HTML + CSS + JavaScript)
- HTML5 Canvas 2D 渲染
- SVG 导出（原生构建，非 Canvas 转码）
- 无外部依赖
- 无构建工具，零配置开箱即用
