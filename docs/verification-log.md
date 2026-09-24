# Registro de verificación

Fecha: 24 de septiembre de 2026. Este registro se actualiza durante el trabajo; no constituye todavía una aprobación Astra Ultra.

## Comprobado

- Revisión funcional del `master` original y de la revisión realmente publicada `dbef40a8763a67427d78405bfa51f691786b5dfb`.
- Moneda original confirmada por el propietario: DOP. No se aplica conversión.
- Lint, TypeScript, pruebas y compilación aprobados en una versión intermedia. Las ediciones posteriores vuelven a comprobarse antes de publicar.
- 99 pruebas de interfaz/dominio: medios, permisos y carreras de carga, autenticación, reportes, auditoría, comercio e identificadores de reintento.
- 310 aserciones SQL: 103 del núcleo, 55 del adaptador de legado, 99 de ciclo documental y 53 de versiones de maestros; además de escenarios de rollback.
- Lint, TypeScript y compilación de producción aprobados. Segundo ensayo remoto con todas las migraciones: importación, creación autenticada, reintento idempotente, rechazo de stock negativo, venta y devolución a cuarentena; restricciones contables verificadas como usuario autenticado y rollback completo.
- Primer ensayo remoto detectó `42501` en un trigger contable diferido. Se reprodujo, se corrigió con una función privada `SECURITY DEFINER` y se repitió satisfactoriamente. Su ejecución directa permanece revocada.
- Ensayo completo remoto de importación, seguido por rollback: 148 filas archivadas, 13 productos, 25 variantes, 216 unidades, 7 contactos, 30 ventas, 3 compras, 47 partidas, 2 entregas.
- Totales originales y ensayados idénticos: ventas RD$148,307.41; compras RD$19,161.80. Son sumas de todos los registros para conciliación, no indicadores de ventas netas confirmadas.
- Tras rollback: 13 productos y 30 ventas originales intactos, cero productos normalizados y cero filas de archivo persistidas. Acceso anterior restaurado por la transacción.
- Propietario confirmado pudo iniciar sesión real en el frontend local y cargar la vista autorizada.
- Pantalla de acceso inspeccionada en escritorio y a 390 píxeles; sin desbordamiento horizontal observado.

## Incidencias del origen conservadas

121 observaciones en el ensayo: 14 costos cero, 14 precios cero, 30 fechas sin zona interpretadas en hora de RD, 2 documentos pendientes, 41 garantías históricas desconocidas, 2 entregas con franja sin hora exacta, 2 discrepancias entre tasa e impuesto y 16 partidas cuyo producto/variante no coincide de forma segura con el catálogo actual.

No se ha inferido la identidad de productos a partir de IDs reutilizados. Las observaciones se presentan al administrador y los flujos que necesitarían datos desconocidos se bloquean con una explicación.

## Pendiente de acreditar

- Publicación de la nueva versión en GitHub y Vercel, seguida del corte real de datos.
- Pruebas autenticadas de altas, edición, compra, recepción, venta, devolución, cotización, entrega y permisos desde la URL de producción.
- Segundo ciclo de revisión, correcciones y pruebas sobre la versión publicada.
- Pruebas móviles autenticadas, recarga de rutas, consola, CSP y casos de red/errores aplicables.
- Revisión final de asesores de Supabase y de limitaciones operativas.

Las pruebas locales no acreditan tráfico concurrente real ni sustituyen la verificación remota. No se ha declarado aprobada la aplicación para producción.
