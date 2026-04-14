# BeatDrop Babylon.js 重构设计

## 概述

将现有 Three.js 游戏迁移到 Babylon.js 框架，使用 Vite 作为构建工具，以获得更好的视觉效果（粒子系统、后期处理、Shader 编辑器）和代码组织。

## 技术栈

- **3D 引擎**: Babylon.js 7.x
- **构建工具**: Vite 5.x
- **语言**: JavaScript (ES Modules)
- **CDN**: Babylon.js CDN (用于稳定加载)

## 项目结构

```
ball-game/
├── index.html              # 入口 HTML
├── package.json             # 依赖配置
├── vite.config.js          # Vite 配置
├── src/
│   ├── main.js             # 应用入口
│   ├── game/
│   │   ├── Game.js         # 游戏主循环、状态管理
│   │   ├── Ball.js         # 球体（物理、外观、特效）
│   │   ├── Track.js        # 轨道段（生成、类型、碰撞）
│   │   ├── Level.js        # 关卡配置与解锁
│   │   ├── Effects.js       # 特效管理（粒子、后期处理）
│   │   └── BlackHole.js    # 黑洞效果
│   ├── shaders/
│   │   └── ripple.js       # 涟漪着色器（Babylon.js ShaderMaterial）
│   └── ui/
│       └── UI.js           # HTML overlay 管理
└── public/
    └── (静态资源)
```

## 核心功能映射

### 物理系统

| 现有实现 | Babylon.js 实现 |
|---------|----------------|
| 手动 Euler 积分弹跳 | 自实现物理（保持精确控制）或 Babylon Physics (Rapier) |
| 重力常量 GRAVITY=25 | 同上 |
| 速度共享 sharedVelocity | 轨道移动速度控制 |

**决定**: 保持自实现物理，因为游戏需要精确的速度同步到轨道位置。

### 轨道系统

| 轨道类型 | Babylon.js Mesh |
|---------|----------------|
| straight | Plane + ShaderMaterial (涟漪效果) |
| double | 2x Box + ShaderMaterial |
| triple | 3x Box + ShaderMaterial |
| speedBoost | Plane + Glow Layer |

### 视觉效果

| 效果 | Babylon.js 实现 |
|-----|----------------|
| 球体涟漪 | **ParticleSystem** (球形爆炸粒子) 或 ShaderMaterial |
| 球体碎裂 | **ParticleSystem** (数百个小碎片) |
| 黑洞吸积盘 | **ShaderMaterial** + **GlowLayer** + **ParticleSystem** |
| Bloom 泛光 | **DefaultRenderingPipeline** |
| 加速光环 | **GlowLayer** + 粒子环绕 |
| 颜色匹配高亮 | **HighlightLayer** |

### 后期处理

使用 `DefaultRenderingPipeline`:
- **Bloom**: 泛光效果
- **Chromatic Aberration**: 色差效果
- **Vignette**: 暗角
- **Glow Layer**: 发光物体

## 游戏状态

```javascript
{
  currentLevel: number,      // 当前关卡 1-5
  unlockedLevels: number[],   // 已解锁关卡
  collisionCount: number,    // 已完成碰撞数
  collisionsToWin: number,    // 胜利所需碰撞数
  speedBoostActive: boolean, // 加速状态
  speedBoostTimer: number,   // 加速剩余时间
  gameState: 'playing' | 'paused' | 'gameOver' | 'victory',
  ballColor: Color3,
  continueCount: number
}
```

## 关卡配置

```javascript
const LEVELS = [
  { id: 1, name: "Miller's Planet", trackTypes: ['straight'], jumpsToWin: 1 },
  { id: 2, name: "Mann's World", trackTypes: ['straight', 'double', 'speedBoost'], jumpsToWin: 10 },
  { id: 3, name: "Edmunds' Planet", trackTypes: ['straight', 'double', 'triple', 'speedBoost'], jumpsToWin: 20 },
  { id: 4, name: "Gargantua's Edge", trackTypes: ['straight', 'double', 'triple', 'speedBoost'], jumpsToWin: 200 },
  { id: 5, name: "The Tesseract", trackTypes: ['straight', 'double', 'triple', 'speedBoost'], jumpsToWin: 1000 }
];
```

## 关键实现细节

### 涟漪 Shader (Babylon.js)

```javascript
// 使用 BABYLON.Effect.ShadersStore 注册 shader
BABYLON.Effect.ShadersStore["rippleVertexShader"] = `...`;
BABYLON.Effect.ShadersStore["rippleFragmentShader"] = `...`;

// 创建 ShaderMaterial
const rippleMaterial = new BABYLON.ShaderMaterial("ripple", scene, {
  vertex: "ripple",
  fragment: "ripple"
}, {
  attributes: ["position", "normal", "uv"],
  uniforms: ["world", "viewProjection", "uTime", "uImpactTime", "uColor"]
});
```

### 粒子系统

```javascript
// 球体碎裂粒子
const shatterParticles = new BABYLON.ParticleSystem("shatter", 500, scene);
shatterParticles.particleTexture = new BABYLON.Texture("particle.png", scene);
shatterParticles.emitRate = 500;
shatterParticles.minLifeTime = 0.5;
shatterParticles.maxLifeTime = 1.5;
// ... 更多配置
```

### Glow Layer

```javascript
const gl = new BABYLON.GlowLayer("glow", scene);
gl.intensity = 0.8;
// 自动让发光材质产生光晕
```

### DefaultRenderingPipeline

```javascript
const pipeline = new BABYLON.DefaultRenderingPipeline("pipeline", true, scene, [camera]);
pipeline.bloomEnabled = true;
pipeline.bloomThreshold = 0.5;
pipeline.bloomWeight = 0.5;
pipeline.chromaticAberrationEnabled = true;
pipeline.chromaticAberration.aberrationAmount = 30;
```

## 待验证问题

1. **粒子系统性能**: 500+ 粒子在移动场景中的性能表现
2. **Shader 换 Babylon.js 语法**: 需要验证与现有 GLSL 语法的对应关系
3. **碰撞检测**: Box vs Sphere 的精确碰撞边界

## 实施步骤

1. 创建项目骨架 (Vite + Babylon.js)
2. 实现基础场景 (球、相机、光照)
3. 实现轨道系统和物理
4. 添加粒子系统和后期处理
5. 实现 UI 和关卡系统
6. 调参优化视觉效果

## 验收标准

- [ ] 球体弹跳物理与原版一致
- [ ] 加速效果正确（落在轨道中心）
- [ ] 颜色匹配逻辑正确
- [ ] 球体碎裂、涟漪、黑洞视觉效果明显优于原版
- [ ] 60 FPS 流畅运行
- [ ] 关卡解锁、继续功能正常
