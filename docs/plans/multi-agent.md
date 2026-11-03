# Plan: varios agentes con cuerpos distintos en la misma escena

Objetivo: que cualquier persona pueda armar experimentos con varios agentes (cuerpos distintos, cada uno con su propio cerebro) que entrenan al mismo tiempo y se ven juntos en la misma escena, por ejemplo una carrera de vallas con un bípedo, un cuadrúpedo, una araña y un gusano, cada uno en su carril.

## Fase 1 — Agentes en paralelo, sin interacción (este plan)

Cada agente aprende de verdad en su propio carril; no se tocan entre sí, igual que en los videos de referencia.

1. **Contrato y proyecto**: un proyecto puede tener varios agentes. Cada agente es un cuerpo con su propio cerebro (`BrainSpec`), su tarea y recompensas, su punto de salida y su meta (carril). Los proyectos de un solo agente siguen idénticos.
2. **Mundo por agente**: para entrenar, cada agente usa el mundo completo pero solo con su cuerpo (los demás agentes no existen en su física), así no hay interacción y el aprendizaje es limpio y reproducible.
3. **Entrenamiento en grupo**: "Entrenar" lanza una corrida por agente al mismo tiempo (un grupo de corridas), repartiendo copias e hilos del CPU entre ellos; cada corrida congela su revisión, semilla y cerebro como hoy. Detener detiene el grupo.
4. **Vista en vivo y repeticiones**: la escena muestra a todos los agentes juntos en su carril (cada uno con su movimiento real grabado), con su color, ojos y un marcador por agente (tiempo, intentos, mejor distancia, éxito) usando las pantallas existentes.
5. **Resultados y Play**: comparar agentes lado a lado (curvas, éxito, quién aprende más rápido); Play corre a todos los agentes con su mejor cerebro.
6. **Copiloto**: puede agregar agentes, elegir cuerpos de la bóveda, armar carriles con recetas y diagnosticar cada agente por separado (el coach ya sabe revisar una corrida).

## Bóveda de cuerpos

Cuerpos listos para insertar como agente, con colores y ojos que parpadean: bípedo, humanoide, cuadrúpedo, araña de 8 patas, hexápodo, gusano/serpiente, rodante con ruedas, saltador. Todos pasan las pruebas físicas y se pueden recolorear y ajustar.

## Fase 2 — Multiagente de verdad (después)

Agentes que interactúan en el mismo mundo: competir por el mismo premio, empujarse, cooperar, atrapar. Requiere entorno multiagente con observaciones y recompensas por agente, entrenamiento simultáneo en un solo mundo (o self-play contra versiones anteriores) y más cómputo. Se decide con un ADR cuando la fase 1 esté probada.

## Reglas

- Real o nada: cada agente aprende con física real; nada se anima a mano.
- Los proyectos existentes de un agente no cambian.
- Todo alcanzable desde el editor y desde el copiloto.
