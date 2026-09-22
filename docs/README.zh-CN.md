# Latticefolk

<p align="center"><img src="assets/cover.svg" alt="Latticefolk" width="100%"></p>

<p align="center">
<strong>一个面向自主 NPC、小镇社会与演化世界的 3D Web 开源模拟项目。</strong>
</p>

<p align="center"><a href="../README.md">English</a> · <b>简体中文</b> · <a href="README.ja.md">日本語</a> · <a href="README.es.md">Español</a></p>

Latticefolk 的目标不是做“会聊天的 NPC 演示”，而是让决策模型真正参与一个持续运行的世界：NPC 会工作、采集、制作、交易、赠礼、送货、取水、巡逻、拜访、休息、睡眠、探索并建立关系；远处区域也会以粗粒度 chunk 状态持续演化，并由可插拔决策引擎参与区域策略。

项目**不绑定 Jev**。Jev / TypeSafe System One 是当前第一个远程决策适配器，核心模拟只依赖通用的 `DecisionProvider`。

## 当前已经实现

- Three.js 第一人称 3D 小镇与真正的观察者上帝视角。
- 约 20 种有界 NPC 行为，行为会真实改变库存、金钱、关系和需求。
- 统一 `WorldObject + capabilities` 交互体系：房屋、水井、市场、箱桶、推车、树木、岩石、花、工具、床、工作台等都属于真实世界对象，而不是单纯装饰。
- 本地 deterministic fallback + 可选 Jev provider。
- 远区 chunk 粗模拟与批量 Jev 策略 / 迁徙 / 生态决策。
- SQLite 持久化：远区状态、访问过的细粒度 chunk、中心小镇、玩家背包/位置、时间和天气可跨重启恢复。
- 跨 chunk 守恒流：人口迁徙、食物/木材/水贸易和生态传播都有明确来源、目的地和数量。
- Region / World 层决策：决策范围越大、频率越低，只选择有界策略，数值结算仍由确定性模拟负责。
- 上帝控制台 Jev input-token 与费用预算：分钟 / 小时 / 每日 token、每日 USD 上限、置信度阈值、缓存、调用类型统计和省流 / 平衡 / 高质量预设。
- 检索优先的预制台词库，支持完整台词和 opener/body/closer 片段组合。
- 简体中文、English、日本語、Español UI 与语料支持。
- Quaternius CC0 低多边形角色、建筑和道具素材。
- 野生动物永久谱系与进化观测：死亡或卸载后的祖先仍保存在 SQLite；区分 founder 与真实繁殖出生，统计死亡原因、后代数、繁殖成功率、代际 trait 均值/方差/趋势，并在 God View 中查看谱系和进化数据。
- biome 选择压力观测：谱系记录出生/死亡环境，God View 按 biome 展示繁殖者相对 cohort 的标准化 trait 差值、跨代同向一致性、样本量及“样本不足/弱信号/持续信号”，不把相关性直接写成因果。
- 生命周期 habitat 暴露：个体只在实际 fine simulation 期间累计环境暴露天数、时间加权 ecology/food/water/danger、biome/chunk 时长和已观测迁移；coarse 时段不会伪造为命名个体轨迹，并可在 God View 对比出生 biome 与 lifetime dominant biome 的选择证据。
- 可保留身份的 fine wildlife migration：命名个体只能迁往合法相邻 chunk，保留 entity ID、父母、代数、traits、妊娠和 habitat history；确定性模拟负责 carrying capacity、coarse 数量守恒、代表权重、transit persistence 与迁徙 provenance。
- 确定性生态位竞争：兔/鹿/野猪/狐狸使用固定资源 profile 计算 pairwise niche overlap，并结合其他物种密度形成 competition pressure；压力会有界降低有效 carrying capacity、影响健康，并进入 God View 与 lineage habitat exposure。

## 本地运行

需要 Node.js 20+：

```bash
git clone https://github.com/wangfumin1/Latticefolk.git
cd Latticefolk
cp .env.example .env
npm install
npm run dev
```

Windows 可以直接使用 `run.bat` 或 `run.ps1`。

没有 Jev Key 时游戏仍会使用本地 fallback。需要启用 Jev 时：

```dotenv
DECISION_PROVIDER=jev
TYPESAFE_API_KEY=your_server_side_key
JEV_ENDPOINT=https://api.typesafe.ai/v1/systemone
JEV_MODEL=jev-latest
```

API Key 只应存在于服务端环境变量。

## 核心原则

**决策模型负责选择意图，模拟器负责执行世界事实。**

例如 Jev 可以选择“去采矿”“向某人赠礼”“这个 chunk 采取资源保护策略”，但不能直接凭空把石料改成 999、生成不存在的人、跳过库存守恒或修改非法状态。

上帝视角同样是严格的世界外观察者：进入上帝视角后，玩家实体不会出现在 NPC 感知或 Jev 候选中。

## 开发路线

当前顺序为：✅ coarse↔fine chunk 双向转换 → ✅ SQLite 世界持久化 → ✅ 跨 chunk 守恒流 → ✅ Region / World 决策层 → ✅ 动态 chunk streaming → ✅ 语义化程序聚落 → ✅ 生产链 → ✅ 第一版生态与生命周期 → ✅ durable ancestry / evolution statistics → ✅ 环境选择压力与 biome adaptation 可观测性 → ✅ 实际观测的 lifetime habitat exposure → ✅ 可保留个体身份的 fine migration / transfer → ✅ 生态位竞争 → **季节迁徙驱动、疾病传播与更多物种** → 更完整生态 → 完整物理层。

完整内容见 [Roadmap](roadmap.md)、[长期愿景](long-term-vision.md)、[架构](architecture.md)、[Decision Provider](decision-providers.md)、[语料库](dialogue-library.md) 和 [国际化](i18n.md)。

## 参与贡献

欢迎新增决策 provider、交互能力、语料、翻译、世界系统、生态模型和素材适配。请先阅读 [CONTRIBUTING.md](../CONTRIBUTING.md)。

## 致谢与许可

感谢 Three.js、Quaternius、TypeSafe/Jev 以及所有贡献者。源码采用 [MIT](../LICENSE)；随仓库分发的第三方素材许可详见 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。研究或演示引用可使用 [CITATION.cff](../CITATION.cff)。
