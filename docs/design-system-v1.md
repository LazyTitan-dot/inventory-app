# S-mart Living — Design System V1

**Versión:** 1.0 · **Fecha:** 14 de noviembre de 2026  
**Estado:** estándar de diseño del proyecto; adopción técnica progresiva.  
**Primera referencia aprobada:** Clientes V2.1, commit `908340c979d5e0204d09c97d2c2a51987c032259`.

## 1. Propósito y alcance

Crear una experiencia comercial coherente, premium, accesible y eficiente para Inventory Manager, en español, en iPhone y escritorio Windows. La PWA React/TypeScript/CSS continúa como única interfaz de producción. SwiftUI queda fuera del alcance actual.

Apple HIG orienta la interacción, Carbon la organización empresarial, WCAG 2.2 AA la accesibilidad verificable y la identidad S-mart Living aporta personalidad. Estas son referencias de diseño, no una afirmación de certificación ni de uso de Liquid Glass nativo.

Orden de prioridades: (1) corrección funcional y seguridad; (2) claridad y accesibilidad; (3) eficiencia operativa; (4) consistencia; (5) estética y personalidad. Si entran en conflicto, gana la prioridad superior. No sacrificar lectura, velocidad, permisos ni exactitud por una animación o reflejo.

Clientes V2.1 es una implementación aprobada, no una plantilla literal para todos los módulos. Conservar su resultado mientras se extraen sus patrones reutilizables. No cambiar su interfaz aprobada sin solicitud específica.

## 2. Fundamentos visuales

### Identidad y color

Usar el logotipo oficial S-mart Living y sus variantes aprobadas, sin redibujar, deformar o sustituir la marca. El nombre del producto conserva el guion. Los colores de marca orientan el diseño; las superficies y colores semánticos se eligen por función y contraste.

| Rol | Referencia V1 |
| --- | --- |
| Navy profundo | #061322 |
| Navy de superficie de marca | #0A2540 |
| Azul principal | #005FA3 |
| Cyan de acento | #00C8F5 |
| Blanco frío | #EAF7FF |

Valores extraídos de Clientes V2.1, a conservar como base visual de adopción:

| Semántica | Claro | Oscuro |
| --- | --- | --- |
| Fondo | #EEF4FC | #061322 |
| Tarjeta de contenido | #FFFFFF | #0D2036 |
| Texto principal | #102B4A | #F0F8FF |
| Texto secundario | #526982 | #B2C7DF |
| Acento interactivo | #086CAE | #79E1FF |
| Borde decorativo | #D7E5F5 | rgba(132,194,239,.17) |
| CTA | gradiente #0655B9 a #007BA8 | gradiente #1460C6, #086DB7, #007B96 |
| Texto CTA | #FFFFFF | #FFFFFF |

El cyan brillante es un acento, no un fondo universal de texto blanco. Los gradientes de CTA son candidatos de referencia, no una garantía de contraste: medir el punto más desfavorable y todos los estados. Borde decorativo no equivale al borde necesario para identificar un control. Reservar verde, ámbar y rojo para éxito, advertencia y error; acompañar con texto/icono, nunca solo color. Conservar los tokens semánticos existentes de estado hasta validar una alternativa en ambos temas.

### Tipografía, ritmo y geometría

Usar la pila de sistema existente: -apple-system, BlinkMacSystemFont, Segoe UI, Inter, system-ui, sans-serif. Escala de referencia (rem, equivalente a px con raíz de 16): título principal 28–32 (1.75–2rem); sección 18–20; cuerpo 16; secundario 13–14; ayuda 12–13. No imponer alturas fijas que recorten texto. Importes y cantidades con cifras tabulares, alineación numérica a la derecha en tablas. Títulos con peso 600–700; no convertir todos los textos a negrita.

Usar la escala existente 4/8/12/16/20/24/32/40/48 px: 8–12 entre icono y texto, 16–20 padding de tarjeta, 24 entre grupos, 32 para cambios de sección amplios. Márgenes móviles de 16 px como base, ampliables a 20 cuando hay espacio. Radios de referencia: controles 12–14, tarjetas 18–22, paneles 22–26; cápsulas para acciones o navegación, no para todo. Controles táctiles principales de al menos 44 × 44 CSS px, 48–52 para acciones principales. En escritorio se permite densidad operativa mayor con controles accesibles. 44 CSS px es objetivo interno inspirado en Apple, no el mínimo normativo universal de WCAG.

### Glass, profundidad y movimiento

- Capa funcional: dock, encabezado que permanece visible, navegación, controles flotantes y barras de acciones. Usar blur, saturación y reflejos moderados con contraste estable. Limitar la cantidad de superficies translúcidas simultáneas.
- Capa de contenido: tablas, formularios, productos, importes y gráficas sobre superficies sólidas. Tarjetas destacadas pueden usar gradientes opacos de marca (no confundir con Liquid Glass). No poner reflejos detrás de datos.
- En navegadores sin backdrop-filter y con reducción de transparencia, ofrecer superficie opaca equivalente. Respetar preferencias de contraste y movimiento reducido; sin animaciones decorativas continuas. Las transiciones de 120–180 ms existentes son una referencia, no una obligación.
- La PWA no implementa el material nativo de SwiftUI. No prometer refacción óptica, adaptación automática de iOS ni accesibilidad nativa.

## 3. Componentes y patrones compartidos

| Patrón | Regla V1 |
| --- | --- |
| Encabezado | Título claro, descripción breve si aporta valor y acción principal contextual. Evitar grandes bloques hero que desplacen trabajo frecuente. |
| Navegación | Dock móvil y sidebar de escritorio consistentes; destino activo distinguible también sin color. Respetar áreas seguras, foco y regreso. |
| Botones | Una acción primaria por tarea; secundarias neutrales; terciarias discretas. Icono + texto cuando ayuden. Destructivas separadas, confirmación contextual, sin ocultar restricciones. |
| Formularios | Etiquetas visibles, ayudas concisas, campos agrupados, una columna móvil, autocompletado cuando fiable, errores próximos al campo, conservar datos tras error. Iconos solo con función de reconocimiento. |
| Listas y tablas | Buscar, filtrar, ordenar, estados, filas legibles, encabezados y números alineados. Tabla desktop cuando comparar datos importa; móvil tarjetas/resumen o tabla con desplazamiento propio si realmente necesario. Densidad no uniforme: 40–48 px en desktop como inicio, ajustar por contenido. |
| Perfil/detalle | Panel lateral en escritorio cuando ayuda al contexto; vista de pantalla completa en móvil para tareas extensas. No comprimir un drawer desktop. |
| Tarjetas | Identidad/indicador principal destacado; superficies de datos discretas; sin sombras y bordes repetidos innecesariamente. |
| Estados | Carga, vacío, error, sin conexión, no autorizado, confirmación y datos desactualizados diferenciados. Nunca mostrar cero como sustituto de datos ausentes. |
| Iconos | Lucide outline consistente; 20 px en campos, 22–24 en acciones; decorativos aria-hidden. Marca de terceros: recurso oficial, proporción y colores autorizados. |
| Feedback | Mostrar progreso real, confirmación clara, prevenir envíos dobles, permitir corrección o deshacer cuando la operación lo admita. No declarar éxito antes de confirmación del servidor. |

Mantener el lenguaje español de las operaciones existentes y las etiquetas explícitas; RD$ para montos y fechas operativas America/Santo_Domingo. No confundir stock disponible con cuarentena, ventas brutas con netas, costo con precio o estimaciones con resultados reales. Accesibilidad, permisos y estados son parte del componente, no extras visuales.

## 4. Aplicación por módulo (criterio de diseño y aceptación)

### Dashboard — expresivo, informativo

Primera próxima adaptación. Jerarquía: estado del negocio, indicadores y período, tendencia, prioridades operativas, actividad. Tarjetas de KPI con gradientes de marca selectivos, cifras legibles y etiquetas explícitas; máximo contraste para gráficas, sin reflejos en datos. Usar los indicadores y cálculos reales existentes: ventas netas y períodos, costo inventario, ingresos y beneficios potenciales únicamente donde estén disponibles y autorizados. Aclarar si un importe incluye ITBIS y si es potencial o realizado según el contrato real; no cambiar fórmulas ni inventar indicadores, valores o porcentajes. Gráficas con alternativa accesible, unidades y leyenda. Móvil una columna o dos KPI compactos si caben; escritorio cuadrícula proporcionada. Prioridades accionables y estado vacío honesto. Los roles sin permiso de costos no deben recibirlos ni verlos. Aceptación: coincidencia con datos previos por rol/período, navegación y filtros correctos, gráficas legibles y sin regresión.

### Inventario — empresarial, orientado a comparación

Carbon como referencia dominante. Tabla en escritorio, búsqueda de SKU/código/marca/modelo, filtros, orden y densidad adecuada; columnas y cantidades alineadas. Móvil resumen por variante y detalle contextual, o tabla con scroll localizado cuando sea imprescindible. Priorizar stock disponible, stock en revisión, precio y reposición; costos solo por permiso. No convertir miles de filas en tarjetas Glass pesadas. Conservar SKU, variantes, imágenes, códigos originales, etiquetas, movimientos y ajustes auditables. Aceptación: búsqueda/filtros, exactitud de variantes y stock, permisos de costos, legibilidad con catálogos grandes y sin alterar cálculos.

### Ventas — enfocado, mínimo ruido

Selección de cliente y productos, cantidades, carrito, descuentos, impuestos, total y confirmación. CTA único y total visible, teclado/escáner y acciones de corrección fáciles. Escritorio catálogo y carrito simultáneos si cabe; móvil checkout enfocado con resumen y barra de acción que no tape el teclado. Conservar límites de existencias, validaciones, precios e impuestos, comprobantes y permisos. No insinuar cobro procesado cuando solo se registra el medio de pago; no introducir crédito directo. Aceptación: mismo total, misma operación, mismo efecto de stock, no duplicar ventas, manejo de error y cancelación.

### Compras — operativo, cámara primero

Órdenes, recepción y conteo: esperado/recibido/pendiente, conformes/dañados, progreso por producto. Proteger el escáner aprobado: cámara continua, pitido, indicador de disponibilidad, antirrepes, check por producto y cierre automático según el flujo existente. Usar código de fabricante cuando corresponda; conservar generación/impresión y entrada manual. Glass no invade visor ni afecta contraste, rendimiento o enfoque. Aceptación: recepción parcial/completa, cuarentena, duplicados, balances, y prueba física iPhone con etiquetas reales; no modificar lógica por un cambio de aspecto.

### Entregas — contextual, siguiente acción

Dirección preferida, cliente, horario, responsable, estado y acción siguiente visibles. Acceso directo a Maps y contacto, con dirección guardada en la copia de cada entrega. Tarjetas prácticas, estados textuales y cronología, diseño móvil apto para uso en ruta. No mostrar GPS, ETA o seguimiento en tiempo real si no existen; no confundir un enlace de Maps con verificación de coordenadas. Conservar reprogramación, intentos, recepción y permisos. Aceptación: dirección correcta, Maps, transiciones de estado, constancia y casos de error; fechas de prueba relativas al reloj o fijadas deliberadamente.

### Clientes — referencia estable

V2.1 aprobada: lista móvil, perfil completo, acciones Nueva venta, WhatsApp oficial, llamada por tel:, edición y archivo, dirección preferida Casa, Maps, registro por ZXing/PaddleOCR y carga de fotos v0.6. Mantener motores, consulta DGII de respaldo, revisión de datos, municipio/provincia y creación atómica de Casa. El teléfono requiere validación y nunca inicia llamada por sí solo. No trasladar fotos ficticias ni datos personales a propuestas o fixtures. Archivo puede reducir prominencia en futuras vistas, sin cambiar Clientes sin autorización.

## 5. Arquitectura de implementación y gobierno

La base ya existente es `src/design-system/tokens.css` (tokens --sl-*), `src/design-system/app-theme.css` (capa global), `src/components/ui.tsx` (PageHeader, Field, Modal, StatusBadge, StatCard, EmptyState, ErrorNotice), `src/pages/contacts.css` y `src/pages/customer-visual-v2.css` (referencia aprobada con --cv-*). No hay que duplicar una biblioteca completa. El nombre V1 formaliza reglas, no afirma que todos los módulos estén migrados.

Estrategia de adopción: en la primera adaptación Dashboard, extraer solamente los valores y patrones compartidos necesarios a tokens semánticos --sl-* y componentes opt-in. Conservar valores originales de --cv-* y compatibilidad de temas mientras se valida equivalencia visual; no reemplazar de golpe los valores globales actuales. Separar tokens de marca, semánticos y de componente; documentar cada excepción. No copiar hojas de estilos enteras entre módulos. No añadir dependencias de UI sin justificar beneficio, mantenimiento y tamaño. Mantener estilos específicos donde el flujo exige diferencias (escáner, gráficas, tablas).

Secuencia: 1) Dashboard; 2) Inventario; 3) Ventas; 4) Compras; 5) Entregas. Antes de cada módulo: inventario de patrones actuales y contratos, propuesta visual con datos ficticios, aprobación, implementación en copia temporal del código oficial, pruebas y revisión, publicación desde master, aceptación en dispositivo real. Orden recomendado, no autorización automática de cambios futuros. Versionar cambios de estándar y componentes; registrar decisiones, excepciones y evidencia. Una modificación que altera datos, permisos o lógica requiere alcance explícito separado.

## 6. Puerta de calidad antes de liberar

- Responsive: 320, 390, 430 y 1440 CSS px; adicional 768/1024 cuando hay layouts intermedios. Tema claro y oscuro; teclado móvil, safe areas, sin scroll horizontal global ni controles tapados.
- Accesibilidad objetivo WCAG 2.2 AA: texto normal 4.5:1, grande 3:1; componentes esenciales 3:1; texto al 200% sin pérdida, reflow a 320 CSS px salvo contenido bidimensional necesario; foco visible y no oculto, teclado, nombres accesibles, orden de foco, lectores de pantalla, movimiento reducido y contraste/transparencia. Verificar gradientes y estados no solo muestras estáticas. No declarar conformidad hasta auditoría.
- Funcionalidad: pruebas existentes de lint, tipos, unitarias, navegador y build; SQL si cambia contrato de datos. Fixtures sintéticos y permisos por rol; no mutar datos de producción para probar diseño. Capturas comparativas y revisión manual real de iPhone y Windows.
- Rendimiento: comparar carga, fluidez y respuesta con la base aprobada; evitar múltiples blur pesados, imágenes y modelos adicionales sin motivo. Medir cámara real cuando corresponda, no solo fixture. Registrar cualquier regresión y resolver antes de liberar.
- Despliegue: commit descriptivo sobre master sin rama de producción paralela; comprobar estado Vercel, assets publicados y registros de error, sin afirmar publicación antes de verificar. Mantener estrategia de rollback; no tocar Supabase por un refinamiento visual.
- Cierre: evidencia técnica, aprobación del usuario, limitaciones y desviaciones documentadas. Una prueba automática no sustituye la aceptación visual o accesibilidad completa.

## 7. Referencias externas

- Apple HIG — [Design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles), [Materials](https://developer.apple.com/design/human-interface-guidelines/materials), [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [Layout](https://developer.apple.com/design/human-interface-guidelines/layout).
- IBM Carbon — [Form guidelines](https://www.carbondesignsystem.com/building-blocks/core/components/form/guidelines), [Data table specifications](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/specifications).
- W3C — [WCAG 2.2](https://www.w3.org/TR/WCAG22/).
- Nielsen Norman Group — [10 usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/).
- Meta — [WhatsApp brand resources](https://www.meta.com/brand/resources/whatsapp/whatsapp-brand/).

**Registro inicial:** esta versión establece el estándar documental a partir de Clientes V2.1. No modifica código ejecutable, tokens activos, datos, ni inicia el rediseño Dashboard. La extracción y adopción técnica se hará en el próximo módulo con revisión y aceptación.
