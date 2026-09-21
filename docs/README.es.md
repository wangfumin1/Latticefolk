# Latticefolk

<p align="center"><img src="assets/cover.svg" alt="Latticefolk" width="100%"></p>

<p align="center"><strong>Una simulación web 3D de código abierto para NPC autónomos, sociedades y mundos en evolución.</strong></p>

<p align="center"><a href="../README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <b>Español</b></p>

Latticefolk no pretende ser solo una demostración de NPC que conversan. Los habitantes trabajan, recolectan, fabrican, comercian, entregan objetos, sacan agua, patrullan, visitan, descansan, duermen y exploran; esas decisiones modifican inventarios, economía, relaciones y el estado del mundo. Las regiones lejanas siguen simulándose como chunks de baja resolución y también pueden recibir decisiones de política regional.

El proyecto **no está acoplado a Jev**. Jev / TypeSafe System One es el primer adaptador remoto, mientras el núcleo usa el contrato genérico `DecisionProvider`.

## Funciones actuales

- Pueblo 3D con Three.js, primera persona y God View como observador externo.
- Unas 20 acciones acotadas para NPC.
- Sistema unificado `WorldObject + capabilities` para edificios, pozo, mercado, almacenamiento, carros, árboles, rocas, flores y herramientas.
- Fallback determinista y provider Jev opcional.
- Simulación gruesa de chunks lejanos con población, recursos, ecología, prosperidad y decisiones por lotes.
- Presupuesto de tokens/coste de Jev administrable desde God View.
- Diálogo escrito previamente con recuperación local y selección de líneas o fragmentos.
- UI y corpus en chino simplificado, inglés, japonés y español.
- Recursos low-poly CC0 de Quaternius.

## Inicio rápido

Requiere Node.js 20+:

```bash
git clone https://github.com/wangfumin1/Latticefolk.git
cd Latticefolk
cp .env.example .env
npm install
npm run dev
```

Sin clave Jev se usa el fallback local. Para Jev, configure `TYPESAFE_API_KEY` únicamente en el servidor.

## Principio de diseño

El modelo elige **intenciones acotadas**; el simulador aplica **consecuencias legales y deterministas**. El modelo no puede inventar entidades ni modificar libremente valores del mundo.

God View también es estrictamente un observador externo y no aparece en la percepción de los NPC.

## Hoja de ruta

Materialización coarse↔fine → persistencia SQLite → flujos conservados entre chunks → decisiones Region/World → streaming dinámico → generación procedural → cadenas de producción → ecología → ciclo vital/reproducción/herencia/evolución → física completa.

Consulta [Roadmap](roadmap.md), [Architecture](architecture.md) y [Decision providers](decision-providers.md).

## Contribución y licencia

Lee [CONTRIBUTING.md](../CONTRIBUTING.md). Código bajo [MIT](../LICENSE). Las licencias de recursos se documentan en [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). Para citas, usa [CITATION.cff](../CITATION.cff).
