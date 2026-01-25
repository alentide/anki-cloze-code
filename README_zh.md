# Anki Cloze Code

[English](./README.md) | **中文**

Anki Cloze Code 是一个强大的工具，用于从源代码生成 **Anki 填空 (Cloze Deletion)** 卡片。它具备语法高亮、基于 AST (语法树) 的智能填空生成以及智能卡片拆分功能。

## 核心理念 (Philosophy)

本项目不仅仅是一个代码转卡片的工具，它背后有一套关于“代码直觉”构建的完整方法论。

### 1. 目标：代码直觉 (Code Intuition)
我们的目标不是为了“背诵”代码，而是为了将核心源码逻辑刻入大脑，建立“代码直觉”。

- **非逻辑推演 (System 1)**：传统的代码阅读往往依赖深度的逻辑推演 (System 2)。而我们通过极高密度的挖空训练，旨在训练“看一眼就填出”的视觉和肌肉直觉。
- **模拟工作 (Simulated Work)**：不仅是记忆，更是模拟。把每一张卡片视为一个微型工单 (Ticket) 或代码卡塔 (Code Kata)。每天刷卡就是“上班”写代码。

### 2. 方法：高密度代码填空 (High-Density Code Cloze)
- **弃阅读，求模拟**：单纯阅读源码是低带宽输入。通过填空（包括变量名、方法名、标点、关键字）模拟“编写过程”，才是高带宽的具身认知 (Embodied Cognition) 输入。
- **全量覆盖**：对关键逻辑进行几乎全量的 Token 级挖空，迫使你关注代码的每一个细节结构。

### 3. 复习：自然重复 (Natural Repetition)
- **对抗遗忘算法**：传统的间隔重复算法 (如 FSRS) 可能不完全适用于有强上下文关联的代码库学习。
- **自然频率 (Zipf Law)**：我们更倾向于利用代码库本身的 Zipf 定律 —— 核心逻辑（如 `ctx.save`）会天然地高频出现，边缘逻辑自然出现少。让代码本身的结构来决定复习频率。
- **快速建立痕迹**：重点在于新卡片学习阶段的三次高频撞击，建立初始记忆痕迹。

### 4. 动力：秩序感与掌控感
在面对庞大复杂的代码库或技术焦虑时，这种“通过刷卡建立连接”的行为，是在绝境中寻找“秩序感”和“掌控感”的生存策略。将复杂的工程内化为可掌控的原子知识。

---

## 功能特性

- **基于 AST 的填空生成**：使用 `ts-morph` 智能识别并隐藏：
    - 变量标识符
    - 关键控制流 (`if`, `for`, `while`)
    - 逻辑与比较操作符 (`&&`, `||`, `===`)
- **语法高亮**：基于 `shiki` 的深夜模式语法高亮。
- **智能上下文**：
    - **吸顶标题 (Sticky Headers)**：滚动时始终显示当前函数/类作用域。
    - **面包屑导航 (Breadcrumbs)**：动态显示当前代码块的路径。
- **自动拆分**：自动将大文件拆分为多个 Anki 卡片，同时保留上下文。
- **Anki 集成**：通过 `AnkiConnect` 直接与 Anki 通信，自动创建牌组和笔记类型。

## 前置要求

1. 安装 **Anki Desktop**。
2. 安装 **AnkiConnect** 插件 (代码: `2055492159`)。
3. 确保 **Anki** 正在运行，且 AnkiConnect 监听 `http://127.0.0.1:8765`。

## 安装

```bash
git clone https://github.com/alentide/anki-cloze-code.git
cd anki-cloze-code
pnpm install
```

## 使用方法

### 1. CLI 模式 (命令行)

直接从本地文件 (`input.ts`) 生成卡片。

1. 将你的代码放入 `input.ts`。
2. 运行生成器：

```bash
# 默认配置 (牌组: dev, 标签: anki-cloze-code)
pnpm start

# 自定义牌组和标签
pnpm start --deck="MyAlgorithmDeck" --tags="algo,js"
```

### 2. Server 模式 (服务器)

启动本地服务器通过 HTTP 请求接收代码（适用于 IDE 插件或其他集成）。

1. 启动服务器：
```bash
pnpm serve
```
服务器将监听 `http://localhost:4000`。

2. 发送 POST 请求到 `/generate`：

```json
POST http://localhost:4000/generate
Content-Type: application/json

{
  "code": "function sum(a, b) { return a + b; }",
  "title": "Sum Function",
  "deck": "MyDeck",
  "tags": ["javascript", "basic"]
}
```

## 配置

- **拆分 (Splitting)**：默认情况下，大文件会按每张卡片 50 个填空进行拆分。
- **模板 (Model)**：自动在 Anki 中创建/更新 `anki-cloze-code` 笔记类型，包含定制的语法高亮 CSS。
