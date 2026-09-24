# SmartLiving — flujos de tienda y aceptación de producción

Fecha de revisión: 24 de septiembre de 2026. Idioma: español para República Dominicana. Destino: implementación y revisión por Astra Ultra.

Este documento se basa en la lectura de `outputs/smartliving-demo` y `work/original`. Describe comportamiento propuesto y pruebas pendientes; no acredita que exista un backend de producción ni que los casos de QA hayan pasado. No se modificaron la aplicación, el backend ni los datos originales.

## 1. Qué conservar y qué corregir

Conservar de la demo: navegación sencilla, alertas accionables, reposición que descuenta mercancía en camino, recepción parcial, venta limitada por existencias, ajustes con motivo e historial con cantidades antes y después. Conservar del original: variantes, imágenes, códigos de barras, clientes, proveedores, cotizaciones, devoluciones, garantías, entregas y promociones.

La aplicación debe permitir completar las tareas de mostrador sin pasar por formularios extensos. Cada operación sensible tendrá un resumen concreto, una acción principal y un resultado persistido que se pueda abrir de nuevo. Un mensaje de éxito solo aparece después de la confirmación del servidor.

| Evidencia leída | Implicación para producción |
| --- | --- |
| `outputs/smartliving-demo/domain.mjs`: venta, recepción, ajuste y órdenes operan sobre una copia completa; comprobación de operación repetida. | Preservar esas reglas en transacciones del servidor. El estado de un navegador no resuelve dos usuarios simultáneos. |
| `work/original/index.html:3017`: `receivePO` agrega todas las cantidades de la orden y cambia su estado. | Registrar cantidades recibidas por línea y por recepción; impedir que un reintento sume inventario otra vez. |
| `work/original/index.html:4524`: `completeSale` descuenta con `Math.max(0, ...)`; cotizaciones usan ese mismo camino. | Rechazar faltantes al confirmar; nunca aceptar una venta y ocultar el faltante ajustando a cero. |
| `work/original/index.html:4388`: guardado de entidades separado y estado de guardado marcado inmediatamente después de invocar escrituras. | Venta, pago registrado, existencias y movimientos deben confirmarse juntos o fallar juntos. |
| `work/original/index.html:3937` y `:4560`: devolución calcula precio por cantidad y repone cuando el tipo es reembolso. | Limitar al saldo devolvible, respetar el importe efectivamente vendido y separar reembolso de condición física del artículo. |
| `work/original/index.html:4008`: garantía usa el producto actual y un valor predeterminado. | Guardar las condiciones de garantía en la venta para que una edición del catálogo no cambie ventas anteriores. |
| `work/original/index.html:2036` y `:4115`: el cupón del POS y el listado usan condiciones de vigencia distintas. | Una sola regla para vigencia, alcance y descuento; validarla otra vez al confirmar la venta. |
| `work/original/index.html:1621`: `fmtNCF` no utiliza el tipo recibido para construir el número. | No reutilizar ese generador como emisión fiscal de producción. Configurar y validar el flujo fiscal por separado. |
| `work/original/migrations/002_shared_inventory.sql:118`: todo usuario autenticado recibe CRUD completo. | La sesión no equivale a autorización. Aplicar permisos por función en cada consulta y operación del servidor. |

## 2. Decisiones necesarias y propuesta inicial

Son decisiones de implementación que deben quedar explícitas. Las propuestas siguientes permiten avanzar sin agregar funciones que el negocio aún no necesita.

| Tema | Propuesta inicial | Criterio de aceptación |
| --- | --- | --- |
| Alcance del negocio | Una tienda y un inventario compartido; no agregar sucursales, rutas inteligentes ni contabilidad completa en esta fase. | Ninguna pantalla exige datos de una estructura inexistente. |
| Idioma, fecha y hora | Español; fechas y día comercial en `America/Santo_Domingo`; almacenar instantes con zona/UTC. | Una venta cerca de medianoche pertenece al mismo día en POS, historial y reportes. |
| Moneda | Para operaciones nuevas, usar DOP como moneda comercial principal. Si se habilita USD, guardar moneda e importe originales, tasa aplicada y equivalencia en DOP en cada operación. | Cambiar una tasa no recalcula ventas antiguas. Los datos USD de la demo no se reinterpretan como DOP; cualquier migración tiene conversión explícita. |
| Importes | Cálculo decimal exacto o unidades menores; reglas de redondeo uniformes por línea y total. | POS, recibo, devolución y reporte coinciden hasta el centavo. |
| Impuestos y comprobantes | Separar cálculo comercial y emisión fiscal. Definir precios con/sin impuestos, tratamiento por producto y mecanismo real de emisión antes de habilitar comprobantes fiscales. No deducir esos requisitos del valor fijo del original. | Sin configuración validada, no inventar numeración fiscal ni presentar un recibo comercial como comprobante fiscal. Esto no impide implementar inventario y operaciones comerciales. |
| Cobros | Registrar efectivo, tarjeta o transferencia. No mostrar «pago procesado» si solo se registró el medio. En efectivo, mostrar recibido y cambio; no agregar crédito o pagos mixtos sin necesidad confirmada. | Importe recibido insuficiente impide cerrar una venta en efectivo. Tarjeta/transferencia tienen confirmación o referencia según configuración. |
| Existencias | Solo operaciones de inventario alteran cantidades; venta, recepción, devolución apta y ajuste crean movimientos inmutables con usuario, motivo, referencia y fecha. | Nunca hay existencias negativas ni edición directa del saldo que omita el historial. |
| Compras en camino | Solo cantidades pendientes de órdenes confirmadas; los borradores y órdenes canceladas no cuentan. | La sugerencia es `máximo(0, objetivo − disponibles − pendientes confirmadas)` para variantes que requieren reposición. |
| Cotizaciones | No reservan inventario inicialmente. Convertir abre una venta vinculada y vuelve a validar existencias, precio acordado y vigencia. | Guardar/enviar una cotización no descuenta inventario ni registra una venta. |
| Entregas | Una entrega describe la logística de una venta confirmada; el descuento de inventario ocurre una sola vez en la venta. | Marcar «En camino» o «Entregada» no descuenta unidades otra vez. |
| Devoluciones | Separar «devolver dinero» de «reintegrar a existencias». Un artículo dañado queda como no vendible; no se agrega un segundo almacén para representar esa condición. | Reembolso, disposición física y saldo devolvible se registran juntos. |
| Anulación | Borradores se pueden cancelar. Una venta confirmada se corrige mediante operación vinculada con motivo y permiso; el efecto en dinero y existencias se indica antes de confirmar. | No cambiar solo la etiqueta de la venta dejando inventario, cobro o reportes inconsistentes. |
| Historial | Archivar productos, clientes, proveedores y promociones con referencias; no borrar documentos confirmados. | Una venta antigua conserva sus nombres, precios, costos, descuentos y condiciones aunque cambie el catálogo. |
| Red y reintentos | Confirmación de operaciones comerciales en línea. Conservar formularios y permitir reintento con el mismo identificador de operación. | No afirmar que una operación se guardó si la respuesta es incierta; consultar su estado antes de crear otra. |

## 3. Flujos optimizados

### Inicio y navegación

Menú propuesto: **Resumen**, **Inventario**, **Ventas**, **Compras**, **Clientes**, **Proveedores**, **Cotizaciones**, **Posventa** (devoluciones y garantías), **Entregas**, **Promociones**, **Reportes** y **Configuración**. Mostrar solo módulos permitidos. El título puede ser más descriptivo que el menú, pero las instrucciones usan el texto del menú.

El resumen conduce a acciones: productos agotados → inventario filtrado; compras pendientes → recibir mercancía; entregas de hoy → lista correspondiente. Las métricas permiten abrir los documentos que explican su importe. No mostrar una cifra sin indicar período y moneda.

### Inventario

1. Buscar por nombre, variante, SKU o código de barras; aceptar búsquedas sin tildes.
2. Mostrar producto y variante, disponibles, en camino, precio y estado. Costos/márgenes solo a roles autorizados.
3. Abrir detalle para ver proveedor, reposición e historial. **Ajustar existencias** solicita cantidad contada y motivo, y muestra antes → después.
4. **Agregar producto** pide nombre y primera variante; detalles opcionales, imágenes y garantía quedan en una sección secundaria. SKU único por variante; código de barras único cuando exista.
5. Archivar conserva trazabilidad y excluye el artículo de nuevas ventas. Una variante con existencias u órdenes pendientes muestra esas dependencias antes de archivarla.

### Compras

1. Desde alertas o **Nueva orden**, seleccionar proveedor y variantes. Mostrar disponibles, en camino, sugerido y costo en la moneda de la orden.
2. Guardar como borrador o confirmar la orden. El resumen indica total, fecha prevista y unidades; confirmar no significa que se haya enviado un mensaje al proveedor.
3. **Recibir mercancía** muestra pedido, recibido y pendiente por línea. Las cantidades de esta recepción empiezan en cero.
4. Confirmar solo lo que llegó; crear comprobante interno de recepción y movimientos. El resto queda pendiente.
5. Cerrar/cancelar cantidades pendientes exige motivo y no elimina recepciones anteriores. Revertir una recepción ya registrada es una corrección controlada.

### POS y ventas

1. Abrir **Nueva venta** con foco en búsqueda/lector. Agregar por código o nombre; mostrar la variante inequívocamente.
2. Cliente de mostrador por defecto. Buscar/crear cliente solo cuando se necesite historial, entrega o datos documentales.
3. Ajustar cantidades; la interfaz muestra el límite actual. Descuento y cupón indican importe aplicado y a qué líneas corresponde.
4. Elegir medio de pago; mostrar subtotal, descuento, impuestos configurados, total y cambio cuando corresponda. **Completar venta — RD$…** es la acción principal.
5. El servidor valida permisos, precios/reglas autorizadas y existencias. Una confirmación produce una venta, sus registros de pago y movimientos; imprimir o reimprimir no crea una operación nueva.
6. Desde el detalle: reimprimir, programar entrega o iniciar devolución. No convertir «anular» en eliminación del historial.

### Clientes y proveedores

Buscar primero por nombre, teléfono, correo o identificación, con aviso de posible duplicado. Alta rápida de cliente: nombre y un contacto opcional; dirección por calle, sector, ciudad y referencia únicamente si se necesita entrega. Proveedor: nombre, contacto y moneda/condiciones comerciales si se usan en compras. La ficha muestra documentos vinculados. Editar un contacto no reescribe la instantánea de una venta anterior.

### Cotizaciones

Crear con cliente, variantes, cantidades, precios acordados, descuento, vigencia y notas. Guardar borrador e imprimir/descargar un documento identificado como cotización. Marcar enviada cuando el usuario lo haga; no enviar mensajes automáticamente. **Convertir a venta** abre la revisión comercial con vínculo a la cotización. Una conversión confirmada es única; un documento vencido pide renovar su vigencia/precios antes de proceder.

### Devoluciones y garantías

Buscar la venta completa por número, cliente, teléfono o producto, no solo entre las diez ventas recientes. Mostrar vendido, ya devuelto y devolvible por línea. Registrar cantidad, motivo, condición física y resolución. Calcular sobre el precio neto de la venta original y sus descuentos/impuestos, con saldo máximo devolvible; no usar el precio actual del catálogo.

Para garantía, mostrar condiciones guardadas en la venta y fecha de vencimiento. Registrar un caso con síntoma, recepción y resolución; registrar el caso no repone inventario ni reembolsa por sí mismo. Un cambio genera operaciones vinculadas para la devolución y el artículo de reemplazo. La elegibilidad comercial se basa en la política configurada, sin inventar una garantía universal.

### Entregas

Programar desde una venta con dirección, contacto, fecha, franja y responsable. Estados mínimos: **Programada → En camino → Entregada**; **Fallida** exige motivo y permite reprogramar. Al confirmar entrega registrar quién recibió y cuándo. Una reprogramación conserva intentos previos. Cancelar una entrega no anula la venta ni altera existencias automáticamente.

### Promociones

Primera versión: porcentaje o monto fijo, código opcional, período, alcance por productos/categorías y estado activo. Un descuento efectivo por línea; no apilar promociones de forma implícita. Mostrar simulación breve del resultado antes de guardar. El POS verifica vigencia local, elegibilidad y límite al confirmar. No exponer opciones como «2×1» si no se implementa su cálculo completo.

### Reportes y configuración

Reportes iniciales: ventas netas y devoluciones por período; cobros registrados por medio; margen bruto según costo histórico; inventario valorizado; mercancía pendiente y alertas. Un filtro común de fechas y moneda afecta tabla, métricas y exportación. Diferenciar venta neta, impuesto y dinero registrado, sin denominar ganancia neta al margen bruto.

Configuración: negocio, moneda, zona horaria, reglas comerciales, documentos, usuarios y permisos. Cambios monetarios o documentales muestran su efecto en operaciones nuevas y conservan históricos. Importaciones tienen validación y vista previa con errores por fila; no reemplazan todo el negocio silenciosamente.

## 4. Permisos mínimos propuestos

Una misma persona puede recibir más de un rol. Evitar un editor de permisos arbitrario en la primera versión. El backend debe hacer cumplir el rol aunque el usuario manipule una URL o una petición.

| Capacidad | Administración | Caja / ventas | Inventario / compras | Consulta |
| --- | --- | --- | --- | --- |
| Ver productos, precios y disponibles | Sí | Sí | Sí | Sí |
| Ver costo, margen y reportes financieros | Sí | No | Solo costo de compras | No |
| Crear ventas, clientes y cotizaciones | Sí | Sí | No | No |
| Modificar precio/descuento fuera de reglas | Sí, con motivo | No | No | No |
| Crear/editar productos y proveedores | Sí | No | Sí | No |
| Preparar órdenes y recibir mercancía | Sí | No | Sí | No |
| Ajustar cantidades físicas | Sí, con motivo | No | Sí, con motivo | No |
| Crear solicitud de devolución/garantía | Sí | Sí | No | No |
| Confirmar reembolso/cambio/anulación | Sí, con motivo | No inicialmente | No | No |
| Programar y actualizar entregas | Sí | Sí | Sí | No |
| Editar promociones, configuración o usuarios | Sí | No | No | No |
| Exportar datos masivos/importar | Sí | No | Inventario permitido sin datos de clientes | No |
| Consultar historial de auditoría | Sí | Sus operaciones | Operaciones de inventario | No |

Si se necesita que caja confirme devoluciones o descuentos especiales, ampliar esa capacidad explícitamente; no otorgarle administración completa. No permitir desactivar al último administrador activo.

## 5. Matriz de QA — Astra Ultra

**Estado inicial de todos los casos: pendiente de ejecución.** P0: no liberar si falla por afectar cantidades, dinero, acceso o integridad. P1: requerido para aceptar el flujo del módulo. P2: mejora de experiencia que puede programarse con una limitación documentada. Ningún caso se considera aprobado solo porque exista el botón o porque el código parezca correcto.

Cada ejecución registra: versión/commit, usuario y rol, datos iniciales, pasos, resultado esperado/observado, documento o identificador de operación, estado persistido y evidencia. Para concurrencia, usar dos sesiones independientes; dos pestañas que comparten datos locales no sustituyen esa prueba.

| ID | Pri. | Módulo y escenario | Resultado observable exigido |
| --- | --- | --- | --- |
| INV-01 | P1 | Crear producto con dos variantes; buscar por SKU, código y texto sin tildes. | Cada variante tiene identidad propia; búsqueda encuentra la correcta y no mezcla cantidades. |
| INV-02 | P0 | Repetir SKU con distinta capitalización/espacios; repetir código no vacío; enviar negativos, fracciones o valores no finitos. | Rechazo en servidor y mensaje por campo; no se crea producto ni movimiento parcial. Cero es válido cuando corresponda. |
| INV-03 | P0 | Ajustar 3 → 2 con motivo; reenviar la operación; intentar sin motivo. | Un único movimiento −1 con antes/después/usuario; reintento devuelve la misma operación; sin motivo no cambia nada. |
| INV-04 | P1 | Editar nombre/precio y archivar variante ya vendida. | Nueva venta respeta archivo; venta y recibo históricos conservan su instantánea. Dependencias pendientes siguen visibles. |
| COM-01 | P1 | Disponible 3, objetivo 16, en camino confirmado 8; además existe borrador por 5. | Reposición sugerida 5; borrador no reduce la necesidad. Cancelar pendiente actualiza la sugerencia. |
| COM-02 | P0 | Orden de 8 unidades: recibir 2, luego 6; repetir la primera recepción. | Existencias aumentan exactamente 8 en total; pendientes 6 y luego 0; una operación repetida no agrega unidades. |
| COM-03 | P0 | Recibir 9 de 8, cantidad negativa/fraccionaria, cero en todas las líneas o orden cancelada. | Ninguna recepción ni movimiento; mensaje indica pendiente o regla incumplida. |
| COM-04 | P0 | Dos usuarios intentan recibir al mismo tiempo el mismo saldo pendiente. | La suma confirmada no supera el saldo; perdedor ve pendiente actualizado y puede corregir sin perder notas. |
| POS-01 | P1 | Venta de mostrador con escáner, producto de dos variantes y efectivo exacto/superior. | Variante correcta, total claro, cambio correcto y un recibo que puede reimprimirse sin descontar otra vez. |
| POS-02 | P0 | Dos cajas compran la última unidad a la vez. | Solo una venta se confirma; otra recibe faltante; saldo final cero, nunca negativo ni dos recibos confirmados. |
| POS-03 | P0 | Doble clic y reintento tras cortar la red después de guardar pero antes de responder. | Un número de venta y un cobro registrado; consulta/reintento recupera el resultado original. |
| POS-04 | P0 | Forzar fallo después de validar inventario o durante escritura de movimientos. | No quedan venta/cobro sin descuento ni descuento sin venta; sin mensaje de éxito prematuro. |
| POS-05 | P0 | Carrito vacío, cantidad cero/fracción, efectivo insuficiente, total/precio manipulado o producto archivado. | Validación del servidor; el cliente no puede fijar un importe o una disponibilidad arbitrarios. |
| POS-06 | P1 | Falta o cambia precio/cupón mientras el carrito está abierto. | Se informa qué cambió y se presenta el total confirmado antes del cierre; no se cobra un importe sorpresivo. |
| ENT-01 | P1 | Crear cliente con teléfono ya registrado en distinto formato y proveedor con nombre similar. | Sugiere coincidencia; permite elegir existente y no crea duplicados por un reintento. |
| ENT-02 | P1 | Venta de mostrador sin datos personales; entrega sin teléfono/dirección. | Mostrador continúa; entrega solicita solo la información indispensable y conserva el carrito. |
| ENT-03 | P0 | Editar/archivar cliente o proveedor con documentos; abrir recibo/orden anterior. | Vínculos y datos históricos sobreviven; archivar no borra documentos ni cambia importes. |
| COT-01 | P1 | Crear/imprimir cotización y consultar inventario/ventas. | No se reservan/descuentan unidades ni se registra ingreso; documento identificado como cotización. |
| COT-02 | P0 | Convertir con existencias insuficientes, producto archivado o cotización vencida. | No aparece venta confirmada; se indica el problema y se conserva el documento original. |
| COT-03 | P0 | Convertir dos veces o simultáneamente. | Una venta vinculada por conversión confirmada; segundo intento abre el resultado existente. |
| DEV-01 | P0 | Venta de 3 unidades; devolver 1 y luego intentar devolver 3. | Saldo devolvible pasa a 2; excedente rechazado; suma devuelta nunca supera lo vendido. |
| DEV-02 | P0 | Devolver parcialmente una venta con descuento/impuestos y precio actual cambiado. | Importe procede de la venta original; suma de reembolsos no supera lo pagado; último parcial absorbe el redondeo necesario. |
| DEV-03 | P0 | Reembolso de producto dañado y devolución de producto apto; repetir confirmación. | Dañado no incrementa disponible; apto sí, una vez. Dinero y condición física quedan diferenciados. |
| DEV-04 | P0 | Anular venta ya devuelta parcialmente o con entrega pendiente. | Operación considera efectos previos, bloquea doble reversión y muestra qué documentos dependientes requieren resolver. |
| GAR-01 | P1 | Cambiar garantía del catálogo tras vender; consultar la venta antigua. | Mantiene condiciones y vencimiento originales, incluido el caso de garantía explícitamente cero/no aplicable. |
| GAR-02 | P1 | Abrir caso sin venta válida o fuera del período configurado. | Identifica falta de elegibilidad; cualquier excepción requiere permiso y motivo, sin inventar cobertura. |
| GAR-03 | P0 | Resolver garantía con sustitución cuando falta el reemplazo. | No registra un cambio completo sin unidades; cuando procede, registra salida y disposición del devuelto una sola vez. |
| ENV-01 | P1 | Programar, iniciar y completar entrega con contacto y dirección. | Transiciones válidas, fechas y receptor registrados; vínculo con venta visible. |
| ENV-02 | P0 | Completar entrega dos veces; programar venta inexistente/anulada; saltar estados mediante petición. | Sin duplicados ni transiciones no autorizadas; inventario no se descuenta por la entrega. |
| ENV-03 | P1 | Fallar con motivo, reprogramar y entregar. | Conserva intento y motivo previos; fecha/estado actual correctos; cancelar entrega no anula la venta. |
| PRO-01 | P1 | Aplicar porcentaje y monto fijo a subconjunto elegible del carrito. | Descuento solo en líneas elegibles; total por línea y general concuerdan; regla visible en POS/recibo. |
| PRO-02 | P0 | Cupón futuro, vencido, desactivado, fecha límite y productos no elegibles. | Rechazo coherente en listado y POS usando hora de Santo Domingo; validación también al confirmar. |
| PRO-03 | P0 | Porcentaje >100, monto negativo, código duplicado, descuento mayor al elegible o dos cupones. | Validación; importe final nunca negativo; no se acumulan reglas sin política explícita. |
| REP-01 | P0 | Venta, devolución parcial y corrección en un período conocido. | Total neto, impuestos y cobros registrados reconcilian con documentos; anulaciones/devoluciones no desaparecen sin explicación. |
| REP-02 | P0 | Venta próxima a medianoche y cambio de tasa/costo después de vender. | Día comercial correcto e importes/costos históricos estables; margen no usa costo actual. |
| REP-03 | P1 | Filtrar período y exportar CSV; nombres con comillas, tildes y prefijos de fórmula. | Exportación coincide con filtros, usa moneda identificada y no ejecuta fórmulas al abrir; texto conserva caracteres. |
| CFG-01 | P0 | Cambiar moneda/tasa para nuevas operaciones; tasa cero/negativa/no finita. | Cambios válidos no alteran históricos; valores inválidos rechazados y auditados cuando aplique. |
| CFG-02 | P0 | Documento fiscal sin configuración real o dos emisiones simultáneas. | Sin numeración inventada; cuando el módulo esté habilitado, una asignación única por documento y gestión explícita de errores. |
| CFG-03 | P0 | Importación mal formada, ID/SKU duplicado o referencias inexistentes. | Vista previa de errores; no reemplaza datos existentes parcialmente ni borra documentos omitidos. |
| ROL-01 | P0 | Caja intenta ajustar existencias, ver costos, cambiar usuarios o llamar directamente la operación. | Servidor deniega; no se filtran costos en respuesta ni se modifica información. |
| ROL-02 | P0 | Inventario intenta reembolsar; Consulta intenta escribir; sesión cerrada intenta leer. | Denegación consistente en todos los caminos y ausencia de efectos parciales. |
| ROL-03 | P0 | Revocar rol con sesión abierta, desactivar usuario y quitar último administrador. | Permisos se actualizan en servidor; sesión no conserva privilegios; último administrador protegido. |
| ROL-04 | P0 | Alterar autor/fecha, editar o borrar auditoría desde una petición. | Autor y fecha confiables del servidor; historial protegido y rastreable. |
| UX-01 | P1 | Recorrer POS, recepción y ajustes usando solo teclado; cerrar y reabrir modal. | Foco predecible, etiquetas accesibles, mensajes legibles y acción principal disponible sin ratón. |
| UX-02 | P1 | Pantalla de 360 px, tableta y escritorio; texto largo, RD$ con cifras grandes. | Formularios, total y botones operables; tablas pueden desplazarse sin ocultar acciones esenciales. |
| UX-03 | P1 | Red lenta, sesión vencida o error de guardado con formulario lleno. | Estado visible, botón protegido de duplicados, entradas conservadas y reintento seguro tras recuperar sesión. |
| UX-04 | P1 | Recorrer filtros vacíos, errores de validación, recibos, CSV y singular/plural. | Español coherente, moneda/unidad explícitas, sin errores internos ni texto inglés salvo nombres propios/códigos. |

## 6. Guion de aceptación integrado

Usar datos sintéticos en un entorno separado. Importes del guion sin impuestos ni promociones, salvo los casos dedicados; no representan reglas tributarias.

1. Administrador crea dos usuarios: caja y almacén. Almacén registra variante A con 3 unidades, costo RD$100, precio RD$200, mínimo 5 y objetivo 10.
2. Almacén confirma orden de 7 y recibe 2. Resultado: 5 disponibles, 5 pendientes; historial con entrada +2.
3. Caja vende 2 unidades por RD$400 en efectivo, recibido RD$500. Resultado: cambio RD$100, 3 disponibles, una venta y un movimiento −2.
4. Caja crea cotización por 2 y la convierte a venta una vez. Resultado: 1 disponible; reintento abre la misma venta, sin nuevo descuento.
5. Dos sesiones intentan vender esa última unidad. Resultado: exactamente una confirma y queda 0.
6. Administración devuelve una unidad apta de la primera venta. Resultado: reembolso registrado RD$200, disponible 1, saldo devolvible de esa venta 1. Repetir la operación no cambia nada.
7. Programar y completar entrega de la segunda venta. Resultado: inventario sigue en 1 y conserva la trazabilidad logística.
8. Almacén recibe las 5 restantes. Resultado final: 6 disponibles y cero pendientes. Reconstrucción: 3 iniciales + 7 recibidas − 5 vendidas + 1 devuelta = 6.
9. Reportes muestran ventas brutas RD$1,000, devoluciones RD$200 y ventas netas RD$800 en el período. Los cobros registrados conservan sus medios y el reembolso aparece separado.
10. Caja intenta cambiar costo, ajustar existencias y confirmar otro reembolso por API. Resultado: denegación sin efectos; administración consulta el historial de operaciones legítimas.

## 7. Criterios de salida

- Todos los P0 ejecutados y aprobados con evidencia de persistencia; no basta una captura del mensaje de éxito.
- Cada módulo entregado completa al menos un flujo normal y su principal caso negativo. Los módulos no implementados no muestran acciones que simulan haber terminado.
- Guion integrado reconciliado entre documentos, cantidades, movimientos y reportes, después de recargar y entrar desde otra sesión.
- Roles verificados en el servidor y en respuestas de lectura; costos/datos no autorizados no viajan al cliente.
- Interfaz en español verificada en escritorio y móvil, incluidos errores, documentos y exportaciones.
- Separación visible entre demo, datos reales y cualquier módulo fiscal aún no configurado. No presentar pruebas pendientes como aprobadas ni una simulación como cobro/emisión real.

Las ampliaciones de crédito, pagos mixtos, múltiples almacenes, números de serie por unidad, rutas, integración contable y promociones complejas requieren una necesidad concreta. No son prerrequisitos automáticos para mejorar estos flujos.
