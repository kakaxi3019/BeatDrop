# BeatDrop - 星际穿越 游戏功能文档

## 游戏概述

一款基于 Three.js 的 3D 弹球游戏，玩家控制球体在轨道上弹跳，通过选择正确颜色的轨道来生存。

---

## 核心功能

### 1. 游戏引擎与渲染
- **Three.js r128** - 3D 渲染引擎
- **WebGLRenderer** - 抗锯齿渲染
- **PerspectiveCamera** - 固定视角摄像机 (位置: 0, 6, 15)

### 2. 球体控制
- **物理属性**:
  - 半径: 0.9
  - 材质: MeshPhysicalMaterial (透明、厚度1.5)
  - 初始颜色: #3498db (蓝色)

- **运动控制**:
  - X轴: 鼠标/触摸控制左右移动
  - Y轴: 自动弹跳 (重力驱动)
  - Z轴: 固定 (轨道向球移动)

### 3. 物理系统
```
GRAVITY = 25
bounceHeight = 1.5
groundY = 0
sphereRadius = 0.9
```

- 弹跳速度: `vy = sqrt(2 * gravity * bounceHeight)`
- 每帧重力衰减: `vy -= gravity * dt`
- 落地检测: `sphere.position.y <= groundY + sphereRadius`

---

## 轨道系统

### 轨道类型

| 类型 | 颜色 | 效果 |
|------|------|------|
| **straight** | 随机粉/黄/蓝 | 改变球体颜色，吸附到中心 |
| **double** | 两个色块 | 颜色匹配，否则游戏结束 |
| **triple** | 三个色块 | 颜色匹配，否则游戏结束 |
| **speedBoost** | 白色发光 | 激活10秒加速 |

### 颜色定义
```javascript
COLORS = {
  pink: 0xff68fd,    // 粉红
  yellow: 0xffe528,  // 黄色
  blue: 0x15befc     // 蓝色
}
```

### 轨道生成规则
- 每4个轨道有1个 straight
- 20% 概率生成 speedBoost
- straight 轨道会随机改变颜色
- 双色/三色轨道颜色随机打乱

### 轨道碰撞块位置
- **double**: 2个块，间距2.5，位置 -1.25 和 1.25
- **triple**: 3个块，间距2.2，位置 -2.2, 0, 2.2
- 块宽度: 2.0

---

## 关卡系统

| 关卡 | 名称 | 轨道类型 | 通关所需跳跃 |
|------|------|----------|-------------|
| 1 | Miller's Planet | straight only | 1 |
| 2 | Mann's World | straight, double, speedBoost | 10 |
| 3 | Edmunds' Planet | straight, double, triple, speedBoost | 20 |
| 4 | Gargantua's Edge | 全部类型 | 200 |
| 5 | The Tesseract | 全部类型 | 1000 |

### 关卡解锁
- 默认解锁第1关
- 通关后解锁下一关
- 未解锁关卡显示锁定图标

---

## 游戏状态

### 状态类型
- **gamePaused**: 暂停，显示关卡选择
- **gameOver**: 失败，显示继续/返回选项
- **playing**: 正常游戏

### 继续系统
- 每关3次继续机会
- 继续后球体在当前轨道上方重生
- 速度加成和连击重置

---

## 特效系统

### 1. 涟漪特效 (Ripple Effect)
触发条件: 球体落在轨道上

**组成**:
- 5个扩展圆环 (RingGeometry)
- 20个粒子喷射 (Spray particles)
- 1个白色闪光 (Glow flash)

**参数**:
```javascript
ringCount = 5
maxRadius = 4 + ring * 0.5
speed = 3.5
life = 1.2秒
delay = ring * 0.08秒
```

### 2. 轨道下陷动画
触发条件: 球体落在 double/triple 轨道

**参数**:
```javascript
pressDuration = 0.15秒
pressDepth = 0.12
动画: ease-out cubic 曲线
```

### 3. 加速粒子特效
触发条件: 激活 speedBoost

**组成**: 30个白色球体粒子

**行为**:
- 围绕球体旋转
- 随机轨道半径 (1-2.5)
- 垂直方向振荡
- 脉冲透明度 (0.4-0.7)

### 4. 破碎特效 (Shatter Effect)
触发条件: 游戏失败

**组成**: 100个球体碎片

**行为**:
- 随机初速度
- 重力下落
- 旋转动画
- 1秒后淡出

### 5. 黑洞特效 (Black Hole)
触发条件: 达到通关所需跳跃数

**组成**:
- 核心球体 (半径2.5，螺旋着色器)
- 3个旋转光环
- 200个粒子点云

**着色器效果**:
- 旋转螺旋图案
- 吸积环
- 中心黑洞
- 脉冲动画

**行为**:
- 向摄像机移动
- 接近时吸引球体
- 被吸收后触发胜利

---

## UI 系统

### 元素列表

| ID | 类型 | 位置 | 功能 |
|----|------|------|------|
| gameOver | 遮罩 | 居中 | 失败界面 |
| victory | 遮罩 | 居中 | 胜利界面 |
| comboDisplay | 文字 | 顶部15% | PERFECT/GREAT + 连击数 |
| distanceDisplay | 文字 | 右上 | 当前/目标距离 |
| levelName | 文字 | 左上 | 关卡名称 |
| menuBtn | 按钮 | 左上 | 打开关卡选择 |
| levelSelect | 遮罩 | 全屏 | 关卡选择界面 |

### Combo 显示
- 80% 概率显示 "PERFECT"
- 20% 概率显示 "GREAT"
- 发光颜色跟随球体颜色
- 0.8秒后自动隐藏

---

## 控制方式

### 鼠标控制
```javascript
mouseSensitivity = 6
mouseX = (e.clientX / window.innerWidth - 0.5) * 2
sphere.position.x = clamp(mouseX * 6, -3, 3)
```

### 触摸控制
- 使用 touchmove 事件
- 映射逻辑与鼠标相同

---

## 后期处理

### 灯光
- 环境光: 0x404040, 强度0.5
- 点光源1: 0x3498db, 强度2, 位置(5,5,5)
- 点光源2: 0xe74c3c, 强度1.5, 位置(-5,-3,-5)

---

## 数据结构

### 游戏状态变量
```javascript
currentLevel          // 当前关卡 (1-5)
unlockedLevels        // 已解锁关卡列表
continueCount         // 剩余继续次数
collisionCount        // 当前跳跃计数
collisionsToWin       // 通关所需跳跃
sphereVY              // 球体垂直速度
onGround              // 是否在地面上
currentSegmentIndex    // 当前轨道索引
sharedVelocity        // 轨道移动速度
ballColor             // 球体当前颜色
speedBoostActive      // 加速是否激活
speedBoostTimer       // 加速剩余时间
comboCount            // 连击数
blackHoleActive       // 黑洞是否激活
```

### 轨道数据结构
```javascript
segment.userData = {
  type: 'straight/double/triple/speedBoost',
  length: 8,
  color: 0xffffff,
  mesh: Mesh,
  ripples: [] // 关联的涟漪对象
}
```

---

## 游戏流程

1. **启动**: 显示关卡选择界面
2. **选择关卡**: 初始化轨道和球体位置
3. **游戏循环**:
   - 更新物理 (重力、弹跳)
   - 更新球体位置
   - 碰撞检测
   - 更新轨道位置
   - 回收过期轨道
   - 更新特效
4. **游戏结束**:
   - 颜色不匹配 → 破碎特效 → 继续/返回
   - 完成跳跃数 → 黑洞出现 → 被吸收 → 胜利

---

## 帧率控制

```javascript
dt = Math.min((currentTime - lastTime) / 1000, 0.05)
```
- 最大 deltaTime 限制为 50ms
- 防止硬件差异导致的物理异常

---

## 清理机制

### disposeObject()
- 清理 geometry
- 清理 material

### cleanupArray()
- 从场景移除对象
- 遍历清理子对象

### 涟漪清理
- 随轨道回收时清理
- 超时自动清理
