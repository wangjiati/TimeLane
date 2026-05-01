# TimeLane

纯前端时间轴可视化工具，类似甘特图但色块高度和颜色可变，用于表达多维度属性在时间轴上的关系。每个通道像一条由无数色块组成的"彩带"（Lane），随时间轴（Chrono）延展。

## 功能

- **多通道时间轴**：多个通道垂直堆叠，分组管理
- **色块维度**：长度 = 时间，高度 = 属性值(百分比)，颜色 = 自定义属性
- **事件标注**：时间点上的文字标记
- **交互**：Ctrl+滚轮缩放，拖拽平移，悬停查看详情
- **分组折叠**：点击分组标题折叠/展开通道
- **导出**：SVG 矢量图、PNG 位图
- **5 套主题**：暗色/亮色/蓝色/墨绿/暖棕
- **设置面板**：实时调整通道高度、字号、文字位置等

## 快速开始

启动 HTTP 服务后打开 `samples.html` 选择示例，或直接访问：

```
python -m http.server 8080
# 浏览器打开 http://localhost:8080/samples.html
```

直接加载指定数据集：`index.html?sample=taxi`

## 示例场景

| 示例 | 数据 | 说明 |
|------|------|------|
| 🚕 出租车营收 | `data-taxi.json` | 6辆车24h，高度=收入 |
| 📚 学生阅读 | `data-reading.json` | 10人30天，高度=字数 |
| ✈️ 机场跑道 | `data-airport.json` | 4跑道24h，高度=延误 |
| 🍽️ 饭店餐桌 | `data-restaurant.json` | 20桌72h，高度=消费额 |
| 🏭 SMT产线 | `data-smt.json` | 3线×4设备，高度=速度 |

## 文件结构

```
时间轴图/
├── index.html            # 主可视化页面
├── samples.html          # 示例列表页面
├── README.md
├── data.json             # 默认数据 (饭店)
├── data-taxi.json        # 出租车数据
├── data-reading.json     # 学生阅读数据
├── data-airport.json     # 机场跑道数据
├── data-restaurant.json  # 饭店餐桌数据
├── data-smt.json         # SMT产线数据
├── 头脑风暴.txt           # 设计文档
└── js/
    ├── chart.js          # 图表引擎
    └── main.js           # 页面逻辑
```

## JSON 数据格式

```json
{
  "groups": [{
    "title": "分组名称",
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
        "textConfig": { "show": true, "color": "#fff", "size": 11 },
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
    "channelHeight": 60,
    "timeFormat": "HH:mm",
    "showEvents": true
  }
}
```

## 技术栈

- 纯前端 (HTML + CSS + JS)
- Canvas 渲染
- 无外部依赖
