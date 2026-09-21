# Latticefolk 中文简介

Latticefolk 是一个开源的 3D Web 自主 NPC 小镇沙盒。项目把“世界模拟”和“决策模型”明确分离：NPC 的移动、碰撞、寻路、库存、数值变化和动作合法性由确定性的游戏系统负责；决策引擎只从游戏提供的合法候选中选择行为、目标、社交意图、状态倾向和台词。

当前内置本地规则 provider，并可选接入 Jev / TypeSafe System One。Jev 只是一个 adapter，核心架构不会与某个模型 API 绑定。

## 本地运行

```powershell
copy .env.example .env
npm install
npm run dev
```

Windows 也可以直接运行 `run.bat`。

## 关键设计

- 第一人称时玩家是 NPC 世界中的真实实体。
- 上帝视角是世界外观察者，NPC 完全感知不到玩家。
- 海量预制台词先通过本地标签索引召回，再由决策 provider 从小候选集选择。
- 远程 provider 失败时自动安全回退，不让小镇停止运行。
- 新模型接入放在 `server/decision/providers/`，不改模拟核心。

更完整说明请阅读根目录 `README.md` 和 `docs/`。
