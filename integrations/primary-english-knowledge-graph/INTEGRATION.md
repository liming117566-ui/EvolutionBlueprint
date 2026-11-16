# 小学英语知识图谱（小升初方向）

Source: https://github.com/zhuguli1021-eng/primary-english-knowledge-graph
Revision: d196c95970d51ca03d013907c31aaf4516ba2b47

The original static learning application is retained: knowledge graph, 522-question bank, paper assembly, marking, diagnosis, adaptive training, prompt creation and validated question imports. Cytoscape is stored locally, removing the runtime CDN dependency. The unavailable Claude/local-Python model integration panel is hidden and model discovery requests are disabled. AI question generation is offered through prompt creation and importing reviewed model results; no model service is claimed to be connected. Local storage is isolated under `blueprint.primaryenglish` keys.

No repository-level license was present in the inspected upstream revision. Source documentation and provenance remain here; Cytoscape's license is included in `app/CYTOSCAPE-LICENSE`.

Build: `node scripts/build-math-primary.cjs`. Output: `server/modules-web/primary-english-knowledge-graph`.
