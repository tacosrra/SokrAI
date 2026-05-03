# Glosario general SokrAI

Este glosario reúne términos comunes que aparecen en propuestas, briefs y
sesiones del sistema SokrAI. Sirve como pack de prueba para validar la
canalización RAG en castellano y catalán.

## Términos en castellano

### Brief estructurado
Documento normalizado que extrae los campos esenciales de una propuesta:
título, objetivo, dueño del problema, evidencias, alcance, alternativas
actuales, supuestos y ambigüedades.

### Dueño del problema
Persona o equipo que vive el problema en su día a día y responde por las
consecuencias de no resolverlo. No siempre coincide con quien financia o
patrocina el proyecto.

### Evidencia del problema
Conjunto de datos, observaciones o testimonios que demuestran que el
problema existe y que tiene impacto. Puede incluir métricas, incidencias,
quejas formales o estudios.

### Alcance
Conjunto de casos, escenarios o usuarios donde el problema aparece. El
alcance también define qué casos quedan deliberadamente fuera del proyecto
en su primera versión.

### Alternativas actuales
Mecanismos, procesos manuales o productos de terceros que el dueño del
problema utiliza hoy para mitigar el problema, aunque sea de forma
imperfecta.

### Maduración del proyecto
Proceso por el cual una propuesta inicialmente vaga se convierte en un
dossier defendible ante un comité, con problema bien definido, evidencias
y alcance acotado.

## Termes en català

### Brief estructurat
Document normalitzat que extreu els camps essencials d'una proposta: títol,
objectiu, propietari del problema, evidències, abast, alternatives actuals,
supòsits i ambigüitats.

### Propietari del problema
Persona o equip que viu el problema en el seu dia a dia i respon per les
conseqüències de no resoldre'l. No sempre coincideix amb qui finança o
patrocina el projecte.

### Evidència del problema
Conjunt de dades, observacions o testimonis que demostren que el problema
existeix i que té impacte. Pot incloure mètriques, incidències, queixes
formals o estudis.

### Abast
Conjunt de casos, escenaris o usuaris on el problema apareix. L'abast també
defineix quins casos queden deliberadament fora del projecte en la seva
primera versió.

### Alternatives actuals
Mecanismes, processos manuals o productes de tercers que el propietari del
problema fa servir avui per mitigar el problema, encara que sigui de
manera imperfecta.

## Conceptos del sistema

### Sesión
Instancia conversacional asociada a una propuesta. Cada sesión tiene un
identificador único y conserva el historial completo de turnos, snapshots
y ejecuciones del modelo.

### Turno
Intercambio entre el agente y el usuario. Un turno consiste en una pregunta
del agente y una respuesta del usuario, más el diagnóstico que el agente
emite tras procesar la respuesta.

### Snapshot
Foto inmutable del estado de la sesión tras un hito (extracción inicial,
turno resuelto, recuperación manual). Permite reanudar y auditar la sesión
en cualquier punto.

### Pack de contexto
Bundle nombrado de documentos indexados con embeddings. Cada pack pertenece
a un dominio (legal, costes, glosario, etc.) y se consulta independientemente
mediante RAG.
