# 初中数学图谱

Source: https://github.com/codes0594/MathGraph
Revision: 706ace643066f962f153e9cb085808973ad2ebba

The upstream Flask service is adapted to a self-contained frontend in `blueprint-web`, using all six original textbook topic and dependency datasets. It supports an interactive knowledge graph, subject search, dependency explanations, self-assessment prompts, local mastery flags and a topologically ordered prerequisite learning plan. Original Flask code remains for reference; server accounts, photo diagnosis and generated quizzes are not exposed by this static adapter.

No repository-level license was present in the inspected upstream revision. Original data and source remain intact. The bundled vis-network library retains its upstream license header.

Build: `node scripts/build-math-primary.cjs`. Output: `server/modules-web/MathGraph`.
