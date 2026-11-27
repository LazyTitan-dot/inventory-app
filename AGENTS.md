# S-mart Living — Inventory Manager

Referencias recuperadas: S-mart-Living_Dashboard-Propuesta-Visual.pdf (18 nov 2026, pp. 1–4) y S-mart-Living_Ventas-y-Caja_Propuesta-visual.pdf (18 nov 2026, pp. 1–3). Las maquetas no son capturas de la versión compilada.

## Visual Design Freeze V1 (no implica aceptación visual nueva)
- Los diseños y flujos aceptados por el propietario son la referencia obligatoria. No reinterpretar tipografía, material Glass, jerarquía, tamaños, márgenes, encabezados ni iconografía sin autorización expresa.
- Antes de editar, identificar el commit y las evidencias visuales aceptadas. Si una referencia histórica coincide con el estado denunciado, no inventar una restauración; registrar el conflicto y recuperar evidencias de aceptación anteriores.
- Usar ChevronRight/NavigationChevron para acceder a secciones o detalles y ChevronLeft/NavigationChevron direction="back" para regresar. No alternar flecha y chevron por CSS entre plataformas. Mantener flechas que representen dirección real, transferencia, enlace externo, ordenación u otra semántica no navegacional. Los controles con texto y los iconos sin texto conservan su nombre accesible, foco y área de interacción.
- Mantener la identidad Navy/Cyan, temas claro y oscuro y los componentes aceptados de Windows e iPhone. No cambiar estilos globales para corregir un único módulo sin verificar sus consumidores.
- Conservar lógica de negocio, ventas, inventario, compras, seriales, escáner, permisos, impresión/PDF y todas las aprobaciones previas. No modificar Storefront ni base de datos en una corrección exclusivamente visual.
- Validar antes de desplegar: npm ci, npm run check, npm run test:shell; revisar todas las rutas, estados vacíos y poblados y ambos temas a 320/390/430/1440 px. Comparar capturas de referencia y verificar foco, accesibilidad, ausencia de desbordamiento y navegación. No publicar con pruebas pendientes o fallidas.
- Registrar commit, alcance, evidencia de compilación y pruebas, diferencias visuales y decisión de aceptación por plataforma. No actualizar snapshots para ocultar regresiones.
- Trabajar contra master con cambios atómicos y validación previa al despliegue; no crear ramas aisladas sin autorización. No realizar rollback global que elimine funcionalidades posteriores aprobadas.

Excepciones V1: flechas de reordenación de imágenes, indicador de ajuste de stock y envío de formulario de autenticación. Cualquier ampliación de esta lista requiere revisión explícita de su significado. Ejecutar npm run test:visual-navigation (incluido en npm test).
