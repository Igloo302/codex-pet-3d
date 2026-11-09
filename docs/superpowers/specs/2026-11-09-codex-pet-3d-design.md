# Codex Pet 3D 架构设计与技术方案规范 (Design Document)

- **文档状态**：待评审 (Draft)
- **创建日期**：2026-11-09
- **作者**：jyshen & Antigravity
- **代码仓库**：`codex-pet-3d` (Monorepo)

---

## 1. 意图与背景 (Intent & The Why)

AI 辅助编程桌面生态（如 OpenAI Codex 桌面端、TokenTracker、CC Switch 等）目前已经广泛支持基于像素网格图集的 2D 桌面宠物（Codex Pets，以 `legeling/awesome-codex-pet` 为核心社区集散地）。

然而，当前生态存在三大明显痛点：
1. **纯 2D 表现受限**：2D 序列帧无法实现自由旋转观察、实时光影变化、平滑动作过渡以及多自由度的视角跟随（3D LookAt）。
2. **创作者制作成本高昂**：创作者即便在 Blender 中建立了 3D 模型，仍需耗费大量精力手动设置角度、烘焙、切片、对齐并排版为 1536×2288 的庞大网格图，且边缘极易残留色键杂边。
3. **缺乏事实上的 3D 标准**：下游各应用（TokenTracker、Codex 客户端插件等）各自为政，生态缺乏一套通用的、轻量的、面向未来的开放 3D 宠物文件协议与解析运行时。

**项目宗旨**：打造 **`codex-pet-3d`**——首个面向 AI 编程助手生态的原生 3D 宠物标准与全栈工具链。既通过“统一规范 + Three.js 核心引擎 + Web 交互展台”定义下一代 3D 桌宠，又通过“一键无缝烘焙 2D”向下兼容现有 Codex 与 TokenTracker 生态。

---

## 2. 目标、非目标与反目标 (Goals, Non-Goals, Anti-Goals)

### 2.1 目标 (Goals)
1. **开放规范定义**：制定首个 3D Codex Pet 物理包格式规范与 `pet-3d.json` JSON Schema，标准化 9 组核心动作（`idle`, `running`, `jumping`, `failed`, `waiting`, `review`, `waving`, `running-left`, `running-right`）与骨骼/视线追踪（LookAt）映射。
2. **跨平台核心渲染器 (`@codex-pet-3d/core`)**：基于 Three.js / WebGL 打造零额外依赖的轻量 3D 宠物控制器，负责模型加载、动作平滑过渡（Cross-fade）、骨骼视线追随与相机适配。
3. **Web 3D 检视与交互展台 (`@codex-pet-3d/web`)**：提供开箱即用的 Web 检视台，支持拖拽本地 `.glb` 预览、动作实时触发、灯光/着色切换与视线跟踪测试。
4. **生产力 CLI 工具 (`@codex-pet-3d/cli`)**：
   - `codex-pet-3d validate`：静态校验 `.glb` 顶点面数、材质贴图、动画 Clips 是否合规；
   - `codex-pet-3d preview`：启动本地热重载 3D 预览服务器；
   - `codex-pet-3d bake-2d`：核心兼容杀手锏，使用无头离线渲染，将 3D 模型自动烘焙生成完全合规的 1536×2288 `spritesheet.webp`（含 16 方向注视）与 `pet.json`，直接兼容现有 Codex 客户端与 `awesome-codex-pet`。
5. **官方合规参考模型 (`sample-pet`)**：提供一个开箱即用的标准低模 3D 宠物示例（包含全部标准 Clips），作为验证基准。

### 2.2 非目标 (Non-Goals)
1. **不自研 3D 图形引擎**：严格基于开放行业标准 WebGL 与成熟的 Three.js，不发明私有图形管线。
2. **不入侵或逆向修改 Codex 官方客户端二进制**：不通过注入动态链接库或篡改 Codex 安装包来实现功能，保持纯净外挂/工具链属性。
3. **不构建复杂的云端 SaaS 后端**：所有校验、预览与 2D 烘焙工具均支持本地离线运行（Local-first）。

### 2.3 反目标 (Anti-Goals)
1. **反“生态割裂”**：绝对不做一个“破坏现有 2D 社区生态、导致用户装上报错”的孤立项目；必须具备一键生成 2D 回退资产的能力。
2. **反“显卡杀手”**：桌面辅助工具必须轻量节能，严禁放任几十万面的影视级模型涌入，必须在规范与 CLI 层面实施严格的性能预算控制。

---

## 3. 约束与性能预算 (Constraints & Performance Budgets)

| 维度 | 规范与限制标准 | 说明 |
| :--- | :--- | :--- |
| **运行时环境** | Node.js ≥ 20，现代 Web 浏览器 (WebGL 2.0) | 跨平台支持 macOS / Linux / Windows |
| **3D 资产格式** | 单文件 `.glb` (glTF 2.0 Binary，纯几何/材质，禁用 Draco/KTX2 压缩以保证无头及多环境纯净加载) | 自带 Mesh、Material、Texture 与 Animations |
| **顶点/面数限制** | 推荐 ≤ 10,000 面（超限发出警告），硬性上限 ≤ 25,000 顶点（超限直接拦截） | 保证桌面端低能耗常驻 |
| **贴图分辨率** | 最大单张贴图宽/高 ≤ 1024×1024 | 节约显存与无头渲染内存 |
| **文件体积** | 单个 `.glb` ≤ 5 MB | 便于网络分发与 CLI 快速拉取 |
| **动画帧率与命名** | 30 FPS 采样；必须包含标准 9 状态：`idle`, `running-right`, `running-left`, `waving`, `jumping`, `failed`, `waiting`, `running`, `review` | 保证动作语义对齐 |
| **2D 烘焙产物** | WebP 格式，严格符合 v2 协议（1536×2288，8列×11行），无损压缩与抗锯齿处理 | 100% 兼容 Codex 桌面端与 TokenTracker |

---

## 4. 备选方案对比与决策 (Approaches)

在方案立项阶段，共深入评估了三种不同的架构路径：

| 路径 | 核心方案描述 | 优势 | 劣势 | 结论 |
| :--- | :--- | :--- | :--- | :--- |
| **方案 1：全栈基建流 (含桌面悬浮窗)** | **规范 + 核心渲染库 + Web 检视台 + 2D 自动烘焙 CLI + 极简桌面透明悬浮窗 Demo** | 既卡位下一代 3D 标准，又通过一键烘焙无缝反哺当前 2D 生态，同时提供开箱即用的原生桌面悬浮体验 | 模块较多，需兼顾 Web、CLI 与 Desktop 客户端 | **采纳 (Selected)** |
| **方案 2：纯独立桌面应用** | 纯粹打造一个跨平台透明悬浮窗桌面应用（Desktop App），不做规范与 CLI 烘焙 | 视觉反馈最快，但缺乏通用生态价值 | 弱化了开源基础设施和规范属性，变成单点工具 | 放弃 |
| **方案 3：纯创作者工具流** | 仅开发 Blender 导出插件将 3D 转为 2D 序列帧 | 最容易被现有 2D 社区合并 | 未实现真正的终端 3D 化，天花板过低 | 放弃 |

---

## 5. 详细架构与规范设计 (Detailed Architecture)

项目采用 **pnpm Monorepo** 架构，目录布局如下：

```text
codex-pet-3d/
├── packages/
│   ├── spec/           # 协议定义、TypeScript 类型、JSON Schema
│   │   ├── schemas/
│   │   │   └── pet-3d.schema.json
│   │   └── src/index.ts
│   ├── core/           # Three.js 核心运行时（无框架依赖，可用于 Web/Node/Electron）
│   │   ├── src/
│   │   │   ├── Pet3DRenderer.ts    # 视口、相机、三点光照、着色器配置
│   │   │   ├── Pet3DController.ts  # 状态机驱动、Clip 切换、CrossFade
│   │   │   └── LookAtTracker.ts    # 头部骨骼/视线追随光标算法
│   ├── cli/            # 开发者与创作者命令行工具
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   │   ├── validate.ts     # 模型合规性体检
│   │   │   │   ├── preview.ts      # 启动本地实时调试服务
│   │   │   │   └── bake-2d.ts      # 无头渲染生成 1536x2288 spritesheet.webp
│   ├── web/            # 在线 3D 宠物展馆与检视工具 (Vite + React)
│   └── desktop/        # 极简桌面透明悬浮窗客户端 (Electron + @codex-pet-3d/core)
│       ├── src/
│       │   ├── main.ts             # 透明置顶无边框窗口
│       │   └── renderer.ts         # 挂载 Pet3DRenderer，响应全局鼠标/状态
├── assets/             # 官方合规示例资产 (sample-pet)
│   └── cyber-cat/
│       ├── pet-3d.json
│       └── model.glb
├── docs/               # 详细中英文规范说明书
└── pnpm-workspace.yaml
```

### 5.1 3D 配置文件规范：`pet-3d.json`

规范字段全量采用统一的 `snake_case`，并在 Schema 中启用 `additionalProperties: false`：

```json
{
  "$schema": "https://codex-pet-3d.net/schemas/pet-3d.schema.json",
  "spec_version": "3d-v1.0",
  "id": "cyber-cat--jyshen",
  "display_name": "Cyber Cat",
  "author": "jyshen",
  "description": "A futuristic low-poly 3D companion for Codex.",
  "model": "model.glb",
  "scale": 1.0,
  "camera": {
    "fov": 45,
    "position": [0, 1.2, 2.5],
    "target": [0, 0.4, 0]
  },
  "look_at": {
    "enabled": true,
    "head_bone": "Head",
    "max_yaw_deg": 45,
    "max_pitch_deg": 30
  },
  "animations": {
    "idle": { "clip": "Idle", "loop": true },
    "running-right": { "clip": "Run_Right", "loop": true },
    "running-left": { "clip": "Run_Left", "loop": true },
    "waving": { "clip": "Wave", "loop": false },
    "jumping": { "clip": "Jump", "loop": false },
    "failed": { "clip": "Failed", "loop": true },
    "waiting": { "clip": "Waiting", "loop": true },
    "running": { "clip": "Work", "loop": true },
    "review": { "clip": "Review", "loop": true }
  }
}
```

### 5.2 2D 烘焙采样与帧数对齐规范 (Baking Specification)

为了保证 `codex-pet-3d bake-2d` 导出的图集 100% 符合 Codex 官方与社区 v2 协议，烘焙器遵循以下硬性网格映射表：

| 行号 (Row) | 动作状态 (State) | 帧数 (Frames) | 列占用区间 (Cols) | 采样时间计算公式 |
| :--- | :--- | :--- | :--- | :--- |
| **Row 0** | `idle` | 6 帧 | 0 ~ 5 列 (6 ~ 7 列透明) | $t_i = (i / 6) \times T$ (循环) |
| **Row 1** | `running-right` | 8 帧 | 0 ~ 7 列 (满列) | $t_i = (i / 8) \times T$ (循环) |
| **Row 2** | `running-left` | 8 帧 | 0 ~ 7 列 (满列) | $t_i = (i / 8) \times T$ (循环) |
| **Row 3** | `waving` | 4 帧 | 0 ~ 3 列 (4 ~ 7 列透明) | $t_i = (i / 3) \times T$ (非循环) |
| **Row 4** | `jumping` | 5 帧 | 0 ~ 4 列 (5 ~ 7 列透明) | $t_i = (i / 4) \times T$ (非循环) |
| **Row 5** | `failed` | 8 帧 | 0 ~ 7 列 (满列) | $t_i = (i / 8) \times T$ (循环) |
| **Row 6** | `waiting` | 6 帧 | 0 ~ 5 列 (6 ~ 7 列透明) | $t_i = (i / 6) \times T$ (循环) |
| **Row 7** | `running` | 6 帧 | 0 ~ 5 列 (6 ~ 7 列透明) | $t_i = (i / 6) \times T$ (循环) |
| **Row 8** | `review` | 6 帧 | 0 ~ 5 列 (6 ~ 7 列透明) | $t_i = (i / 6) \times T$ (循环) |
| **Row 9** | `look 000°~157.5°` | 8 帧 | 0 ~ 7 列 (8 个注视方位) | $\theta_k = k \times 22.5^\circ$ ($k \in [0, 7]$) |
| **Row 10** | `look 180°~337.5°` | 8 帧 | 0 ~ 7 列 (8 个注视方位) | $\theta_k = k \times 22.5^\circ$ ($k \in [8, 15]$) |

- **全局统一相机取景 (Global Union AABB Framing)**：烘焙前先预遍历所有 9 个动作完整动画周期，计算所有姿态的几何包围盒并求并集（Union Bounding Box），加 10% 安全边距锁定统一相机视锥，彻底杜绝跳跃出画或动作切换时模型尺寸忽大忽小的问题。
- **注视方位映射机制**：以观察者视线面对角色为基准，屏幕正上方为北 (0°)，按顺时针旋转，每 22.5° 放置虚拟光标。调用纯函数 `calculateAngles(yaw, pitch)` 直驱头部骨骼（绕过动态平滑阻尼 lerp），在 Idle 第 0 帧姿态下采集 16 个固定方位的头部朝向。
- **渲染质量与透明度处理**：采用 2× 超采样（即单格以 384×416 渲染），使用 `sharp` 以 Lanczos3 算法降采样至标准 192×208，显式配置 `alphaQuality: 100` 与无损 WebP 编码，杜绝边缘黑边与半透明光晕。未占用单元格严格保证 Alpha=0。

### 5.3 核心模块交互流程 (Flow)

```
[创作者 3D 模型 (.glb)]
        │
        ├──> [CLI: validate] ──> 校验面数 / 动作 Clips / 贴图尺寸
        │
        ├──> [Web / Inspector] ──> Three.js 实时渲染 / 交互调试 / 动作预览
        │
        └──> [CLI: bake-2d] ──> 无头渲染器 (Offscreen / Puppeteer)
                                       │
                                       ├──> 导出 1536x2288 spritesheet.webp (严格遵循5.2表)
                                       └──> 导出标准 pet.json
                                       │
                                       └──> 100% 兼容投入 Codex Desktop / TokenTracker
```

---

## 6. 实施路线图 (Milestones)

1. **Phase 1: 工程基建与规范发布 (Day 1)**
   - 建立 pnpm monorepo 仓库结构与 TypeScript 构建环境；
   - 编写 `packages/spec` 与完整的 JSON Schema；
   - 创建标准示例模型与目录。
2. **Phase 2: 核心渲染引擎封装 (`@codex-pet-3d/core`) (Day 2)**
   - 实现 Three.js 加载器、三点布光系统与卡通着色（Toon Shader）模式；
   - 实现 9 动作状态机调度与动作淡入淡出（CrossFade）；
   - 实现鼠标视线跟随（LookAt）平滑插值算法。
3. **Phase 3: Web 检视台构建 (`@codex-pet-3d/web`) (Day 3)**
   - 搭建轻量 Vite + React Web 视口，提供动作面板、光照调试、全屏与背景透明切换；
   - 支持拖入第三方 `.glb` 即时分析并生成推荐配置。
4. **Phase 4: CLI 校验与 2D 自动烘焙管道 (`@codex-pet-3d/cli`) (Day 4)**
   - 实现 `validate` 命令行体检逻辑；
   - 编写离线无头多角度摄影机旋转与帧捕捉脚本，自动拼合生成 1536×2288 WebP 图集。
5. **Phase 5: 极简桌面悬浮窗客户端 (`@codex-pet-3d/desktop`) (Day 5)**
   - 基于 Electron 构建跨平台透明、无边框、置顶的桌面悬浮小窗口；
   - 挂载 `@codex-pet-3d/core` 运行时，响应全局鼠标悬停/拖拽与动作切换交互；
   - 支持读取本地 `~/.codex/` 会话状态或通过快捷键切换 3D 宠物。
6. **Phase 6: 社区生态对接与开源发布 (Day 6)**
   - 在 `legeling/awesome-codex-pet` 提交 RFC Issue，附带 Web 演示、桌面悬浮体验及 2D 烘焙成果；
   - 发布 npm 包与开源代码。

---

## 7. 留给构建者的细节 (Left to the Builder)
- 烘焙管线底层选择（推荐优先使用 Node.js + Three.js + `sharp` / `canvas` 纯软件渲染，无需用户本地配置复杂的 Blender 环境）。
- 卡通描边（Outline Shader）算法具体选用法线外扩（Inverted Hull）还是 Sobel 屏幕后处理边缘检测。
