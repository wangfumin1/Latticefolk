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

✅ coarse↔fine chunk materialization → ✅ SQLite 永続化 → **chunk 間の人口・資源・交易・生態フロー** → Region/World decision → dynamic streaming → procedural settlement/environment → 生産とインタラクション → 生態系 → 生命周期・繁殖・遺伝・進化 → physics。

詳細は [Roadmap](roadmap.md) と [Architecture](architecture.md) を参照してください。

## 貢献・ライセンス

[CONTRIBUTING.md](../CONTRIBUTING.md) を参照してください。コードは [MIT](../LICENSE)。同梱アセットのライセンスは [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) に記録しています。引用情報は [CITATION.cff](../CITATION.cff) にあります。
