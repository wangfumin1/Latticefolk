# 帧阶段计时诊断候选

目标：在不改变移动、物理、worldStatus 语义的前提下测量 home-oven 等 Playwright 超时场景中的帧阶段成本。

采样默认关闭。

覆盖阶段：

- raw frame delta：clock.getDelta() 原值
- clamped dt：Math.min(.05, rawDelta)
- updatePlayer
- persistenceReady 下的世界更新阶段
- updateUi
- renderer.render

约束：

- 默认关闭时不调用额外 performance.now()。
- 默认关闭时不分配帧记录数组。
- 固定容量 ring buffer。
- 异常不捕获替代原行为；原异常继续传播。
- 不节流或缓存动态骨骼、位置、碰撞诊断。
- 不改变 firstPerson 与 persistenceReady 条件。

预期验证：

1. 开启时产生 bounded samples。
2. 关闭时保持零采样。
3. 超容量覆盖旧样本。
4. updatePlayer/world/updateUi/render 调用顺序保持不变。
