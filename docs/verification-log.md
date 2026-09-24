# Registro de verificación

Fecha: 24 de septiembre de 2026. **Astra Ultra: aprobado para el alcance operativo verificado de una tienda única**, sobre la revisión de código `b4576d15d8c3fffd1399cff264e439212fc9722c`. La versión está publicada, el corte se concilió, los recorridos descritos abajo se comprobaron con una sesión real en producción y se limpiaron los registros de prueba. No quedan pendientes de implementación ni pruebas principales de ese alcance. La aprobación se limita a las comprobaciones documentadas; no constituye una garantía absoluta ni una certificación fiscal, de seguridad o de carga.

## Versión publicada

- Código publicado y verificado en GitHub: [`b4576d15d8c3fffd1399cff264e439212fc9722c`](https://github.com/LazyTitan-dot/inventory-app/commit/b4576d15d8c3fffd1399cff264e439212fc9722c).
- [GitHub Actions, ejecución 36034420815](https://github.com/LazyTitan-dot/inventory-app/actions/runs/36034420815): `success`.
- Vercel: despliegue `dpl_8RfoRJHeAkcDqEY9XXdR2hpY1EA8`, estado `Ready`.
- Aplicación publicada: [inventory-app-nine-navy.vercel.app](https://inventory-app-nine-navy.vercel.app/).
- La versión incluye las correcciones de precios pendientes, plurales, pies documentales, menú móvil, importes móviles y manejo de cierre de sesión fallido. El despliegue y la comprobación final descrita abajo se completaron. Esta referencia acredita el código verificado; no declara publicado un commit documental posterior.

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

La exportación CSV se descargó realmente: se verificó el archivo en Descargas, con 3 filas y sumas exactas de base RD$4,000.00, impuestos RD$720.00 y total RD$4,720.00. El evento de descarga no fue capturado por la herramienta del navegador; la evidencia procede del archivo descargado.

Auditoría mostró las acciones en español y el informe de legado presentó las 121 incidencias. Se verificaron en modo de solo lectura las secciones Negocio y Equipo de Configuración, incluida la cuenta propietaria y la tabla de permisos.

La carga de un archivo de imagen local quedó inicialmente bloqueada por el permiso de la extensión. Después de que el usuario habilitara el acceso a archivos locales, se subió un PNG local de 512 × 512 píxeles: la interfaz confirmó «1 imagen subida» y su almacenamiento privado. Se guardó correctamente el producto de prueba con SKU `QA-IMAGEN-260924`. Tras recargar producción, buscar el SKU y abrir la edición, se verificó la imagen visible y completamente decodificada, con tamaño natural de 512 × 512 y URL firmada de Storage. Una captura real documentó el resultado; se canceló el formulario sin modificarlo. La carga local y su persistencia quedaron verificadas. Las búsquedas sin coincidencias mostraron el estado vacío en español y cero variantes.

La limpieza de las tres filas de este nuevo ensayo se confirmó mediante `COMMIT`: quedaron cero filas de ese ensayo, con su auditoría y operaciones conservadas. El objeto privado de prueba, de 664 bytes, permanece como artefacto técnico fuera del catálogo; no se afirma que haya sido eliminado.

Un archivo falso presentado como PNG fue rechazado con el mensaje «El contenido del archivo no corresponde a una imagen JPG, PNG o WEBP válida.». No se guardó y la consola permaneció sin errores. El intento de acceder al objeto privado mediante su URL pública devolvió HTTP `400`, sin acceso al archivo; la cuenta propietaria sí pudo mostrar la imagen de 512 × 512 mediante una URL firmada.

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
- Los asesores de seguridad de Supabase informaron 0 errores, 1 advertencia por protección contra contraseñas filtradas deshabilitada y 7 avisos informativos por RLS sin políticas en el esquema privado. Estos últimos corresponden al cierre de acceso por diseño.
- La protección contra contraseñas filtradas permanece deshabilitada: requiere el plan Pro y el proyecto utiliza el plan Free. La corrección disponible se describe en la [documentación de seguridad de contraseñas de Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Incidencias del origen conservadas

Las 121 observaciones incluyen 14 costos cero, 14 precios cero, 30 fechas sin zona interpretadas en hora de República Dominicana, 2 documentos pendientes, 41 garantías históricas desconocidas, 2 entregas con franja sin hora exacta, 2 discrepancias entre tasa e impuesto y 16 partidas cuyo producto o variante no coincide de forma segura con el catálogo actual.

No se ha inferido la identidad de productos a partir de IDs reutilizados. Las observaciones se presentan al administrador y los flujos que necesitarían datos desconocidos se bloquean con una explicación.

## Segundo ciclo y limpieza de pruebas

Las comprobaciones del segundo ciclo pasaron: 99 pruebas unitarias, 310 aserciones SQL, lint, TypeScript y compilación. Tras el ajuste de la etiqueta de limpieza se repitieron lint y TypeScript satisfactoriamente. Durante ese ciclo se repitieron estas comprobaciones de interfaz en producción:

- Catálogo: 14 variantes indicadas como Precio pendiente y un filtro que devolvió una variante.
- Menú móvil: ausente del árbol de accesibilidad al cerrar y `aria-expanded=true` al abrir.
- Compra: columna Costo unitario y pie «Conserve esta orden para verificar la mercancía recibida.»; cotización: pie correcto sobre vigencia y ausencia de reserva de existencias.
- Reporte: texto «1 devolución» y los importes del escenario conciliados.
- Recarga de producción: cero errores y cero advertencias en consola.
- Imagen original Samsung Q72DD: obtenida por RPC privado y decodificada a 1600 × 1200 píxeles.
- Formulario móvil: apertura y cierre sin guardar datos.
- Garantía del escenario de prueba: 12 meses, vencimiento en 2027, estado vigente y cantidad exacta de unidades sin devolver.
- Tableta de 768 × 1024 y escritorio de 1440 × 1000: capturas revisadas y sin desbordamiento horizontal del documento; ancho de contenido y visible iguales a 768 y 1425 píxeles, respectivamente.

La limpieza de datos de prueba se ensayó primero con `ROLLBACK`, sin errores, y después se confirmó mediante **`COMMIT`**. La verificación independiente posterior encontró cero documentos, productos y demás filas de prueba; permanecen exactamente 13 productos, 25 variantes, 216 unidades, 7 contactos, 30 ventas, 3 compras, 47 partidas, 2 entregas y 148 filas archivadas. Las aserciones del script comprobaron la conservación de datos originales, auditoría, operaciones y contadores. Los hashes de las 22 entradas previas de auditoría y 22 operaciones permanecieron idénticos; hubo cero descuadres, cero saldos negativos y ningún cambio en el hash del origen.

Después de la limpieza, Realtime actualizó el reporte de septiembre a cero sin recarga. Auditoría mostró la acción Limpieza de pruebas y conservó las entradas históricas.

## Comprobación final de producción y limpieza

Se corrigió un desbordamiento de 6 píxeles en el importe de una tarjeta móvil con texto adaptable entre 16 y 22 píxeles y salto de línea de respaldo. Lint, TypeScript y compilación pasaron. En la versión final publicada, la comprobación a 390 × 844 mostró anchos visible y de contenido iguales a 375 píxeles. El importe RD$1,916,000.00 se mostró completo, con texto calculado de 16.38 píxeles, y quedó documentado en una captura real.

El manejo de un cierre de sesión fallido se corrigió con una alerta accesible en español, estado de operación en curso y opción de reintentar. Pasaron lint, TypeScript y las 99 pruebas unitarias; la corrección forma parte del código final publicado.

Caja móvil abrió correctamente, mantuvo deshabilitada la confirmación de una venta vacía y permitió cancelar. Tras recargar y recorrer rutas, la consola mostró cero errores y cero advertencias. La última comprobación HTTP de `/ventas` respondió `200` con el bundle `index--LNjWgAR.js`, coincidente con la compilación `b4576d1`, y los encabezados CSP y `nosniff`. Se cerraron los servidores de desarrollo locales, se restauró el tamaño de la ventana y se dejó abierto el resumen operativo de producción.

La limpieza del ensayo posterior de imagen local terminó con `COMMIT`: tres filas retiradas y cero restantes, con auditoría y operaciones conservadas. La lectura final independiente confirmó 13 productos, 25 variantes, 216 unidades disponibles, cero en cuarentena, 7 contactos, 30 ventas, 3 compras y las 148 filas archivadas con hash idéntico. El bucket de imágenes permanece privado. No quedan pendientes de implementación ni pruebas principales del alcance operativo verificado.

## Limitaciones vigentes

- Los precios y costos históricos faltantes, las garantías desconocidas y las demás incidencias del origen se conservan explícitamente. Su resolución requiere evidencia comercial; no se inventaron valores ni relaciones.
- Cancelar un formulario después de subir una imagen puede dejar un archivo privado sin referencia. No existe una retirada automática de esos archivos; requiere mantenimiento y no altera existencias.
- La protección contra contraseñas filtradas sigue deshabilitada en el plan Free; requiere Pro.
- Los recibos son internos: la aplicación no emite ni certifica NCF/e-CF ni procesa cobros bancarios o de tarjeta; registra el medio de pago utilizado.

La aprobación Astra Ultra corresponde a los flujos operativos de una tienda única comprobados en este registro. Los resultados distinguen pruebas locales, comprobaciones HTTP y SQL, y recorridos reales de interfaz autenticada. Las condiciones del plan Free, el mantenimiento de archivos privados y el alcance de los comprobantes internos permanecen explícitos; no se extiende la aprobación a funciones fiscales, procesamiento de pagos ni escenarios no ensayados.
