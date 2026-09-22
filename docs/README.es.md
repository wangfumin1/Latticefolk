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
- Persistencia SQLite para chunks, NPC/objetos visitados, progreso del jugador, hora y clima entre reinicios.
- Flujos conservados entre chunks: migración, alimentos, madera, agua y ecología se transfieren con origen, destino y cantidad explícitos.
- decisiones jerárquicas Region / World: a mayor escala, menor frecuencia; el modelo solo elige políticas acotadas.
- streaming dinámico de chunks: la exploración en primera persona expande el mundo, la ventana activa permanece acotada y los chunks descubiertos persisten; God View no genera terreno.
- asentamientos procedurales semánticos: bioma, política, peligro y prosperidad generan caminos, edificios funcionales, zonas de trabajo, recursos y residentes; el contenido generado sigue siendo interactivo.
- ecología de fauna persistente: conejos, ciervos, jabalíes y zorros existen como poblaciones coarse e individuos fine, con capacidad del hábitat, migración, necesidades, depredación/huida, decisiones Jev por lotes, reproducción, herencia y persistencia.
- Presupuesto de tokens/coste de Jev administrable desde God View.
- Diálogo escrito previamente con recuperación local y selección de líneas o fragmentos.
- UI y corpus en chino simplificado, inglés, japonés y español.
- Recursos low-poly CC0 de Quaternius.
- Archivo genealógico duradero y observabilidad evolutiva: los ancestros sobreviven a la muerte y descarga del chunk en SQLite; se distinguen fundadores de nacimientos reproductivos y se miden causas de muerte, descendencia, éxito reproductivo y medias/varianzas/tendencias de rasgos por generación en God View.
- Evidencia de presión selectiva por bioma: el linaje conserva el hábitat de origen/muerte y God View muestra diferencias normalizadas entre reproductores y cohorte, consistencia entre generaciones y tamaño de muestra sin presentar correlación como causalidad.
- Exposición de hábitat durante la vida observada: solo se acumula mientras el individuo existe en simulación fine, con medias ambientales ponderadas por tiempo, duración por bioma/chunk y transiciones observadas; los intervalos coarse no se inventan como historia individual y God View compara bioma de origen con bioma dominante observado.
- Migración fine con identidad persistente: los individuos nombrados solo pueden migrar a chunks adyacentes legales y conservan entity ID, padres, generación, traits, embarazo e historial de hábitat; la simulación determinista controla capacidad de carga, conservación coarse, peso representativo, tránsito persistente y provenance.

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

✅ coarse↔fine → ✅ SQLite → ✅ flujos conservados → ✅ decisiones Region / World → ✅ streaming dinámico → ✅ asentamientos procedurales semánticos → ✅ cadenas de producción → ✅ primera ecología de ciclo vital → ✅ genealogía duradera / estadísticas evolutivas → ✅ observabilidad de presión selectiva y adaptación por bioma → ✅ exposición de hábitat observada durante la vida → ✅ migración fine con identidad → **competencia de nicho, movimiento estacional, transmisión de enfermedades y más especies** → ecología ampliada → física.

Consulta [Roadmap](roadmap.md), [Architecture](architecture.md) y [Decision providers](decision-providers.md).

## Contribución y licencia

Lee [CONTRIBUTING.md](../CONTRIBUTING.md). Código bajo [MIT](../LICENSE). Las licencias de recursos se documentan en [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). Para citas, usa [CITATION.cff](../CITATION.cff).
