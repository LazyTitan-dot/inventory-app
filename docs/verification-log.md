# Registro de verificación

Fecha: 24 de septiembre de 2026. La versión está publicada, el corte de datos se completó y los recorridos comerciales descritos abajo se verificaron con una sesión real en producción. Este registro **no constituye una aprobación Astra Ultra**: faltan comprobaciones finales, retirar los datos de prueba y publicar y verificar las correcciones del segundo ciclo.

## Versión publicada

- `master` publicado en GitHub: [`e97ea2d14d69e89b88bf8fc85a9febfdfcd84766`](https://github.com/LazyTitan-dot/inventory-app/commit/e97ea2d14d69e89b88bf8fc85a9febfdfcd84766).
- [GitHub Actions, ejecución 36028864130](https://github.com/LazyTitan-dot/inventory-app/actions/runs/36028864130): `success`.
- Vercel: despliegue `dpl_4eq5tdWys9pCHG9kDojK8pGYS34L`, estado `Ready`.
- Aplicación publicada: [inventory-app-nine-navy.vercel.app](https://inventory-app-nine-navy.vercel.app/).
- El segundo ciclo corrigió precios pendientes, plurales, pies de órdenes y cotizaciones, desbordamiento y menú móvil accesible. Su nuevo despliegue y la verificación de esa versión siguen pendientes; no se acredita todavía una versión posterior a la indicada aquí.

## Comprobado

- Revisión funcional del `master` original y de la versión anterior publicada `dbef40a8763a67427d78405bfa51f691786b5dfb`.
- Moneda original confirmada por el propietario: DOP. No se aplica conversión.
- Lint, TypeScript y compilación de producción aprobados.
- 99 pruebas unitarias de interfaz y dominio aprobadas: medios, permisos y carreras de carga, autenticación, reportes, auditoría, comercio e identificadores de reintento.
- 310 aserciones SQL aprobadas: 103 del núcleo, 55 del adaptador de legado, 99 de ciclo documental y 53 de versiones de maestros; además de escenarios de rollback.
- Segundo ensayo remoto con todas las migraciones: importación, creación autenticada, reintento idempotente, rechazo de stock negativo, venta y devolución a cuarentena; restricciones contables verificadas como usuario autenticado y rollback completo.
- Primer ensayo remoto detectó `42501` en un trigger contable diferido. Se reprodujo, se corrigió con una función privada `SECURITY DEFINER` y se repitió satisfactoriamente. Su ejecución directa permanece revocada.
- Antes del corte, el ensayo remoto completo terminó en rollback y dejó intactos los registros originales, sin productos normalizados ni archivo persistido. Posteriormente se realizó el corte definitivo descrito abajo.
- Una cuenta propietaria confirmada inició sesión real en el frontend local y, posteriormente, también en la aplicación de producción.
- Pantalla de acceso inspeccionada en escritorio y a 390 píxeles; sin desbordamiento horizontal observado.

## Recorridos reales de interfaz en producción

Verificados con una sesión propietaria real desde la URL publicada:

- Creación, consulta y edición de producto; búsqueda, código de barras y ajuste de existencias, incluidos rechazos de valores inválidos.
- Creación y gestión de cliente y proveedor.
- Orden de compra de 3 unidades: recepción parcial de 2 y posterior recepción de 1; intento de recibir 4 unidades rechazado.
- Venta de 2 unidades en efectivo: importe recibido insuficiente rechazado y cambio calculado al completar el cobro registrado.
- Entrega recorrida hasta el estado entregada.
- Devolución de 1 unidad a cuarentena; intento de devolver 3 unidades rechazado.
- Edición y conversión de cotización; anulación de la venta resultante.
- Aplicación de cupón y cancelación de cotización.
- Recarga de la aplicación y manejo de enlace de recuperación expirado.
- Imagen mediante URL HTTPS guardada y decodificada correctamente.

Dos pestañas intentaron vender simultáneamente la última unidad disponible: solo se registró una venta y la segunda recibió el rechazo de existencias correcto. Esta es evidencia de ese caso real de contención, no de una prueba general de carga.

En el escenario de verificación, el reporte concilió **neto RD$4,000.00**, **impuestos RD$720.00**, **cobrado RD$4,720.00** y **margen RD$1,914.30**. Estos importes pertenecen al escenario de prueba, no a la conciliación del archivo histórico.

La carga de un archivo de imagen local quedó bloqueada por el permiso de la extensión. No se eludió ese permiso ni se demostró un fallo de la aplicación; ese método de carga sigue sin verificar.

## Corte real y conciliación

El corte definitivo se ejecutó el 24 de septiembre de 2026. Se conservaron:

| Dato | Cantidad |
| --- | ---: |
| Productos | 13 |
| Variantes | 25 |
| Unidades actuales | 216 |
| Contactos | 7 |
| Ventas | 30 |
| Compras | 3 |
| Partidas documentales | 47 |
| Entregas | 2 |
| Filas originales en el archivo privado | 148 |
| Incidencias del origen | 121 |

Totales originales e importados idénticos: **ventas RD$148,307.41** y **compras RD$19,161.80**. Son sumas de todos los registros para conciliación; no representan ventas netas confirmadas.

Las consultas posteriores al corte encontraron cero discrepancias aritméticas y cero saldos negativos. El hash del origen permaneció sin cambios y las 148 filas archivadas coinciden exactamente con sus originales. La importación conservó el saldo actual sin repetir movimientos de ventas o compras históricas.

## Acceso, configuración y publicación

- Las solicitudes HTTP anónimas a las tablas originales y nuevas, y a los RPC `retail_bootstrap` y `retail_command`, fueron rechazadas con HTTP `401` / código `42501`. Una solicitud con token inválido fue rechazada con HTTP `401` / `PGRST301`.
- Las rutas SPA, incluida `/ventas`, respondieron HTTP `200` con la aplicación nueva y su CSP. Esto verifica la entrega del frontend, no un flujo comercial autenticado.
- La consola de la pantalla de acceso en producción mostró cero errores y cero advertencias durante la inspección.
- Registro público de cuentas deshabilitado e inicio de sesión anónimo deshabilitado en Supabase Auth.
- Confirmación de correo habilitada y longitud mínima de contraseña de 12 caracteres verificada en el servidor.
- Redirección de recuperación configurada hacia la aplicación real publicada.
- La protección contra contraseñas filtradas permanece deshabilitada: requiere el plan Pro y el proyecto utiliza el plan Free.

## Incidencias del origen conservadas

Las 121 observaciones incluyen 14 costos cero, 14 precios cero, 30 fechas sin zona interpretadas en hora de República Dominicana, 2 documentos pendientes, 41 garantías históricas desconocidas, 2 entregas con franja sin hora exacta, 2 discrepancias entre tasa e impuesto y 16 partidas cuyo producto o variante no coincide de forma segura con el catálogo actual.

No se ha inferido la identidad de productos a partir de IDs reutilizados. Las observaciones se presentan al administrador y los flujos que necesitarían datos desconocidos se bloquean con una explicación.

## Pendiente de acreditar

- Comprobaciones finales de exportación, Auditoría y Configuración desde la interfaz de producción.
- Retirada de los datos de prueba creados durante los recorridos de producción y comprobación de la conciliación posterior.
- Nuevo despliegue y verificación de las correcciones del segundo ciclo: precio pendiente, plurales, pies documentales, desbordamiento y menú móvil accesible.
- Carga de imágenes mediante archivo local cuando esté disponible el permiso correspondiente.
- Cierre de las comprobaciones móviles, de permisos y de casos de red o errores que todavía no estén acreditadas por los recorridos anteriores.
- Revisión final de asesores de Supabase y aceptación de las limitaciones operativas documentadas.

Los resultados distinguen pruebas locales, comprobaciones HTTP y SQL, y recorridos reales de interfaz autenticada. La aprobación final continúa pendiente hasta cerrar las comprobaciones y la verificación del nuevo despliegue.
