# Latticefolk

<p align="center"><img src="assets/cover.svg" alt="Latticefolk" width="100%"></p>

<p align="center"><strong>自律 NPC、町の社会、進化する世界のためのオープンソース 3D Web シミュレーション。</strong></p>

<p align="center"><a href="../README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <b>日本語</b> · <a href="README.es.md">Español</a></p>

Latticefolk は「会話できる NPC デモ」だけを目指していません。NPC は仕事、採集、製作、取引、贈り物、配達、水汲み、巡回、訪問、休息、睡眠、探索を行い、その結果が所持品・経済・関係・世界状態に反映されます。遠方地域も粗粒度 chunk として継続的にシミュレーションされ、意思決定 provider が地域方針に参加できます。

プロジェクトは **Jev に依存しません**。Jev / TypeSafe System One は現在の最初のリモート adapter であり、コアは汎用 `DecisionProvider` を使用します。

## 現在の主な機能

- Three.js の一人称 3D 町と、世界外観察者としての God View。
- 約 20 種類の bounded NPC action。
- 建物、井戸、市場、収納、荷車、木、岩、花、道具などを統一した `WorldObject + capabilities` 方式で操作。
- deterministic fallback と optional Jev provider。
- 遠方 chunk の人口・資源・生態・繁栄の粗シミュレーションと batched decision。
- God View コンソールから input-token / 日次費用 / confidence / cache / call budget を管理。
- 完全な authored line または fragment 組み合わせによる会話。
- 简体中文 / English / 日本語 / Español の UI・会話コーパス。
- Quaternius の CC0 low-poly assets。
- 永続的な野生動物系譜と進化観測。死亡・unload 後も祖先記録を SQLite に保持し、founder と実際の繁殖出生を区別、死亡原因・子孫数・繁殖成功率・世代別 trait 平均/分散/傾向を God View から確認できます。
- biome 別の選択圧観測。出生/死亡時の habitat を系譜に保存し、繁殖個体と cohort の標準化 trait 差、世代間の方向一致率、サンプル数を God View に表示します。相関を因果として断定しません。
- 生涯 habitat 曝露。個体が実際に fine simulation されている時間だけ、環境の時間加重平均、biome/chunk 滞在日数、観測された遷移を記録します。coarse 区間を個体履歴として捏造せず、出生 biome と lifetime dominant biome の選択証拠を God View で比較できます。
- 身元を保持する fine wildlife migration。名前付き個体は合法な隣接 chunk のみへ移動でき、entity ID、親、世代、traits、妊娠、habitat history を保持します。carrying capacity、coarse 数量保存、代表重み、transit persistence、移動 provenance は deterministic simulation が管理します。

## 起動

Node.js 20+：

```bash
git clone https://github.com/wangfumin1/Latticefolk.git
cd Latticefolk
cp .env.example .env
npm install
npm run dev
```

Jev Key がなくても fallback で動作します。Jev を使う場合はサーバー側の `.env` に `TYPESAFE_API_KEY` を設定してください。

## 設計原則

意思決定モデルは **意図を選択**し、シミュレーション側が **合法な状態変化を実行**します。モデルが任意の数値や存在しない事実を直接生成する設計にはしません。

God View も世界外の観察者であり、NPC の知覚対象には入りません。

## ロードマップ

✅ coarse↔fine → ✅ SQLite → ✅ conserved chunk flows → ✅ Region / World decisions → ✅ dynamic streaming → ✅ semantic procedural settlements → ✅ production chains → ✅ first lifecycle ecology → ✅ durable ancestry / evolution statistics → ✅ selection pressure / biome adaptation observability → ✅ observed lifetime habitat exposure → ✅ identity-preserving fine migration → **niche competition / seasonal movement / disease transmission / more species** → richer ecology → physics。

詳細は [Roadmap](roadmap.md) と [Architecture](architecture.md) を参照してください。

## 貢献・ライセンス

[CONTRIBUTING.md](../CONTRIBUTING.md) を参照してください。コードは [MIT](../LICENSE)。同梱アセットのライセンスは [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) に記録しています。引用情報は [CITATION.cff](../CITATION.cff) にあります。
