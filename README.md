# SmartLiving · Inventario y operaciones retail

Aplicación en español para una tienda de electrodomésticos en República Dominicana. React, TypeScript, Vite y Supabase (PostgreSQL, Auth, Realtime y Storage). Importes en pesos dominicanos; fechas operativas en `America/Santo_Domingo`.

Publicada en [inventory-app-nine-navy.vercel.app](https://inventory-app-nine-navy.vercel.app/). El corte de datos se completó el 24 de septiembre de 2026, los recorridos principales se verificaron con una sesión real en producción y se limpiaron los registros de prueba. **Astra Ultra: aprobado para el alcance operativo verificado de una tienda única**, sobre la revisión de código `b4576d15d8c3fffd1399cff264e439212fc9722c`. No quedan pendientes de implementación ni pruebas principales de ese alcance. La aprobación se limita a la evidencia documentada y no es una garantía absoluta. Consultar [el registro de verificación](docs/verification-log.md) y las limitaciones vigentes.

## Operación diaria

- Resumen operativo, catálogo por variantes, SKU, código de barras, imágenes privadas, costos, precios y reposición.
- Existencias disponibles y en revisión, conteos físicos con motivo e historial de movimientos.
- Clientes con múltiples direcciones de entrega y una preferida; proveedores, órdenes con fecha prevista y recepciones parciales.
- Ventas, medios de pago registrados, descuentos, promociones, cotizaciones y recibos imprimibles.
- Devoluciones parciales con límite de cantidades e importes, anulación controlada y consulta de garantías conservadas al vender.
- Entregas con responsable, reprogramación, intentos fallidos y constancia de recepción.
- Reportes, exportación CSV, configuración comercial, roles y auditoría.

La adaptación completa del prototipo añade caja dedicada con pedido móvil,
búsqueda global con Ctrl/⌘+K, gráficos basados en ventas reales, fichas de inventario
contextuales, escaneo con alternativas manual/lector, etiquetas Code 128 y
recepciones separadas de unidades conformes y dañadas. Las dañadas entran en
cuarentena; el cierre con faltantes conserva lo recibido. Cada entrega guarda una
copia independiente de su destino y conserva receptor, constancia e historial.
El seguimiento muestra eventos operativos registrados, sin GPS ni ETA calculada.
Véase [adaptación y verificación](docs/prototype-adaptation.md).

Las variantes nuevas reciben un **SKU automático y editable**, generado a partir de la marca, el modelo y la variante. Los SKU existentes se conservan; el formulario comprueba duplicados y permite generar un código. El catálogo, la ficha y la exportación muestran el **precio sin ITBIS, el impuesto y el precio con ITBIS por unidad**, según la tasa configurada del negocio y antes de descuentos. Un precio de cero se identifica como pendiente. Estos cálculos no modifican los importes de documentos históricos.

Desde clientes, recibos de venta, cotizaciones y entregas se puede preparar un mensaje de **WhatsApp**. La aplicación permite revisar y editar el destinatario y el texto antes de abrir WhatsApp; el usuario realiza el envío allí. No utiliza WhatsApp Cloud API, no envía mensajes automáticamente ni confirma su envío o entrega. Las plantillas omiten costos, notas internas, identificadores técnicos y enlaces de imágenes privadas.

Los recibos son documentos internos. La aplicación no emite ni certifica NCF/e-CF y no procesa cobros bancarios ni de tarjeta: registra el medio de pago utilizado. La configuración tributaria debe corresponder a la operación del negocio.

## Desarrollo

Requiere Node.js 22.12 o superior (menor que 25).

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Completar `.env.local` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. Solo se admiten claves públicas de Supabase en el cliente. No usar `service_role`, claves secretas ni contraseñas de PostgreSQL. Los archivos `.env.*` privados están excluidos de Git.

La integración existente de Vercel también puede aportar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (o su clave `anon` pública). La compilación solo incluye esos valores mediante una lista explícita; no copia el resto del entorno. Una compilación de producción sin configuración pública falla antes de desplegarse.

```sh
npm run lint
npm run typecheck
npm test
npm run build
# Todas las comprobaciones anteriores:
npm run check
```

Las pruebas SQL usan PGlite, un motor PostgreSQL local, y datos sintéticos. No escriben en Supabase remoto. El ensayo opcional del perfil legado se documenta en `supabase/tests/README.md`. PGlite tiene diferencias de roles en triggers diferidos: por eso existe una regresión específica y también una prueba remota con rollback.

## Arquitectura y seguridad

`src/pages` contiene las pantallas por área; `src/components` reúne componentes accesibles; `src/lib` valida contratos, presenta importes y conserva identificadores de reintento; `src/state` coordina la sesión de datos, permisos, revalidación y notificaciones.

La base de datos es la autoridad de cada operación. `retail_command` ejecuta permisos, validación, importes decimales, existencias, documentos y auditoría en una transacción. Los reintentos conservan un UUID por intención y no repiten movimientos. El cliente solo almacena un hash de la intención pendiente y el UUID; no guarda una cola de formularios o datos de clientes.

Las tablas operativas no conceden CRUD directo a `anon` o `authenticated`. `retail_bootstrap` devuelve únicamente los datos permitidos para el rol activo. Caja y consulta no reciben costos. Cada comando vuelve a comprobar la membresía en el servidor; ocultar un botón no sustituye esa comprobación.

Realtime publica únicamente una revisión sin datos comerciales; el cliente vuelve a pedir su vista autorizada. Hay revalidación al recuperar el foco y cada 30 segundos. Una pérdida de red conserva la vista cargada y muestra el problema; una revocación de acceso descarta los datos. Las escrituras requieren conexión.

Las imágenes nuevas usan un bucket privado. Las imágenes originales se conservan en el archivo privado y se solicitan bajo demanda. Los documentos guardan sus precios, descuentos, impuestos, costos y condiciones históricas: editar el catálogo no reescribe una venta.

## Acceso del equipo

El registro público de cuentas y el inicio de sesión anónimo están deshabilitados. Para dar acceso a una persona del equipo:

1. Un administrador del proyecto debe crear o invitar previamente la cuenta desde Supabase Auth. La cuenta debe tener su correo confirmado; una cuenta Auth por sí sola no concede acceso al negocio.
2. Un propietario autoriza la cuenta existente desde **Configuración → Equipo y permisos** y le asigna el rol correspondiente.
3. La persona inicia sesión en la aplicación con su cuenta. El servidor exige contraseñas de al menos 12 caracteres y la recuperación tiene configurada la redirección hacia la aplicación publicada.

La protección contra contraseñas filtradas requiere Supabase Pro. El proyecto actual utiliza Free y esa función permanece deshabilitada; la opción se describe en la [documentación de seguridad de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

| Rol | Acceso |
| --- | --- |
| Propietario | Operación completa y administración de propietarios/administradores |
| Administrador | Operación completa; administra roles operativos |
| Ventas y caja | Catálogo sin costos, clientes, ventas, cotizaciones, garantías y entregas |
| Inventario y compras | Catálogo con costos, existencias, proveedores, compras y entregas |
| Consulta | Catálogo y existencias sin costos ni datos comerciales privados |

El primer propietario se provisiona administrativamente contra una cuenta Auth confirmada; no se incluye un correo real ni credenciales en una migración pública. No se puede suspender al último propietario activo.

## Migraciones y conservación del legado

Las migraciones `supabase/migrations/*.sql` amplían el esquema existente. Las versiones locales corresponden a las aplicadas mediante el conector de Supabase. Las cuatro migraciones históricas de abril de 2026 ya existían remotamente y no deben repetirse. Los SQL originales en `docs/legacy` se conservan solo como referencia, no como un procedimiento de actualización recomendado.

Consultar `docs/database-contract.md` antes de modificar los comandos o el modelo. En una base nueva debe prepararse explícitamente el esquema base o ejecutar una instalación adaptada; no ejecutar las migraciones históricas destructivas sobre datos existentes.

El adaptador de legado se define mediante una migración, pero **no importa automáticamente**. El corte es una operación administrativa separada:

1. Revisar el manifiesto y la identidad del propietario responsable.
2. Ensayar `retail_private.import_legacy(...)` dentro de una transacción que termina en `ROLLBACK`.
3. Conciliar cantidades, documentos e importes; comprobar imágenes y permisos.
4. Preparar la nueva versión y coordinar el corte para impedir escrituras simultáneas en ambos modelos.
5. Ejecutar el corte con el SHA256 revisado. Cambios de origen desde la revisión abortan la operación.
6. Verificar el acceso desde la URL publicada y los totales después de la importación.

El archivo conserva todas las filas originales, sus hashes y sus permisos previos. Se conserva el saldo actual sin repetir ventas o compras históricas. La importación revoca el acceso API al modelo anterior en la misma transacción. No elimina sus filas. No reactivar el frontend antiguo después del corte sin un plan de reconciliación: las nuevas operaciones pertenecen al modelo normalizado.

El corte de esta instalación ya se realizó: 13 productos, 25 variantes, 216 unidades, 7 contactos, 30 ventas, 3 compras, 47 partidas y 2 entregas; 148 filas originales permanecen en el archivo privado y se registraron 121 incidencias del origen. Los totales de conciliación se conservaron exactamente: ventas RD$148,307.41 y compras RD$19,161.80. No son indicadores de ventas netas confirmadas. Las consultas posteriores al corte verificaron cero discrepancias aritméticas, cero saldos negativos, hash del origen sin cambios y archivo idéntico al original.

Identidades históricas reutilizadas, garantías desconocidas, precios sin registrar y discrepancias de tasas se señalan en Auditoría. No se inventan enlaces ni se recalculan importes antiguos. La resolución de un dato de negocio desconocido requiere evidencia del documento original.

## Despliegue y verificación

Vercel ejecuta `npm ci` y `npm run build`; únicamente publica `dist`. Los HTML y SQL originales conservados en el repositorio no se sirven como aplicación. `vercel.json` configura rutas SPA, encabezados de seguridad y políticas de caché. El service worker anterior se retira para que no mantenga una versión obsoleta.

Revisar build, entorno público, autenticación, recarga de rutas, CSP, imágenes y flujos reales después de cada despliegue. Un build correcto no acredita por sí solo una aprobación de producción. Consultar `docs/verification-log.md` para distinguir comprobaciones realizadas de pendientes.

La revisión de código publicada y verificada es [`b4576d15d8c3fffd1399cff264e439212fc9722c`](https://github.com/LazyTitan-dot/inventory-app/commit/b4576d15d8c3fffd1399cff264e439212fc9722c); el despliegue Vercel `dpl_8RfoRJHeAkcDqEY9XXdR2hpY1EA8` está `Ready` y la [ejecución de CI 36034420815](https://github.com/LazyTitan-dot/inventory-app/actions/runs/36034420815) terminó en `success`. Pasaron lint, TypeScript, build, 99 pruebas unitarias y 310 aserciones SQL. Esta referencia identifica el código comprobado; no acredita un commit documental posterior.

La entrega de la SPA y la ruta `/ventas` respondió HTTP 200 con la aplicación nueva y CSP; la consola de acceso no mostró errores ni advertencias. La última comprobación confirmó el bundle `index--LNjWgAR.js`, correspondiente a la compilación `b4576d1`, y los encabezados CSP y `nosniff`. Las pruebas HTTP rechazaron el acceso anónimo a tablas originales, tablas nuevas y RPC protegidos, además de rechazar tokens inválidos.

Una cuenta propietaria inició sesión real en producción. Se verificaron productos y edición, búsqueda y código de barras, ajustes de existencias, clientes, proveedores, compra y recepción parcial, venta en efectivo con cambio, entrega, devolución a cuarentena, edición y conversión de cotización, anulación de venta, cupón y cancelación de cotización. También se comprobaron los rechazos de cantidades e importes insuficientes, la recarga y el manejo de un enlace de recuperación expirado. Dos pestañas intentaron vender la última unidad: una venta se completó y la segunda fue rechazada por falta de existencias.

El reporte del escenario de prueba concilió neto RD$4,000.00, impuestos RD$720.00, cobrado RD$4,720.00 y margen RD$1,914.30. Una imagen por URL HTTPS se guardó y decodificó. Después de que el usuario habilitara el acceso a archivos locales de la extensión, se cargó un PNG local de 512 × 512 píxeles como archivo privado y se guardó correctamente un producto de prueba con esa imagen. Tras recargar producción, buscar el SKU y abrir la edición, la imagen se mostró completa mediante una URL firmada; se canceló el formulario sin cambios. El acceso público directo a ese archivo fue rechazado. Un archivo falso con extensión PNG también fue rechazado con un mensaje en español, sin guardarse ni generar errores de consola. Las tres filas de este ensayo se retiraron mediante `COMMIT`, conservando su auditoría y operaciones; el objeto privado de 664 bytes permanece como artefacto técnico fuera del catálogo.

La exportación CSV se verificó en el archivo realmente descargado: 3 filas, base RD$4,000.00, impuestos RD$720.00 y total RD$4,720.00. Auditoría mostró las acciones en español y las 121 incidencias del legado. Negocio y Equipo de Configuración, incluida la tabla de permisos, se revisaron en modo de solo lectura. Los asesores de seguridad informaron 0 errores, 1 advertencia por la protección de contraseñas filtradas no disponible en Free y 7 avisos informativos de RLS sin políticas en el esquema privado cerrado por diseño.

La segunda versión publicada se volvió a comprobar en producción: 14 variantes con precio pendiente, filtro de una variante, menú móvil accesible, columna Costo unitario y pie de compra, pie de cotización y reporte con «1 devolución» e importes correctos. Tras recargar, la consola mostró cero errores y advertencias. La imagen original Samsung Q72DD se obtuvo por RPC privado y se decodificó a 1600 × 1200 píxeles; el formulario móvil abrió y cerró sin guardar. La garantía de prueba mostró 12 meses, vencimiento en 2027, estado vigente y la cantidad correcta de unidades sin devolver. Las capturas y medidas DOM no mostraron desbordamiento en tableta de 768 × 1024 ni escritorio de 1440 × 1000.

La limpieza se confirmó con `COMMIT`: quedaron cero documentos, productos y demás filas de prueba. La verificación posterior conservó 13 productos, 25 variantes, 216 unidades, 7 contactos, 30 ventas, 3 compras, 47 partidas, 2 entregas y las 148 filas archivadas. Los hashes de las 22 entradas previas de auditoría y 22 operaciones permanecieron idénticos; no hubo descuadres ni existencias negativas y el hash del origen no cambió. Realtime actualizó el reporte de septiembre a cero sin recarga; Auditoría mostró Limpieza de pruebas y conservó el historial.

La última versión corrigió el desbordamiento de importes móviles y el manejo de un cierre de sesión fallido, con alerta en español, estado de operación y reintento. Tras publicar, la comprobación a 390 × 844 mostró anchos visible y de contenido iguales a 375 píxeles y el importe completo RD$1,916,000.00, con texto de 16.38 píxeles. Caja móvil abrió, mantuvo deshabilitada la venta vacía y permitió cancelar correctamente. La consola mostró cero errores y advertencias tras recargar y recorrer rutas. La lectura final de datos confirmó 13 productos, 25 variantes, 216 unidades disponibles, cero en cuarentena, 7 contactos, 30 ventas, 3 compras, 148 filas archivadas con hash idéntico y almacenamiento privado.

Permanecen precios y costos históricos faltantes, garantías desconocidas y otras incidencias del origen que requieren evidencia para resolverse. Cancelar un formulario después de subir una imagen puede dejar un archivo privado sin referencia; su retirada requiere mantenimiento y no altera existencias. La protección contra contraseñas filtradas no está disponible en Free. Los recibos son internos, sin emisión ni certificación NCF/e-CF ni procesamiento de cobros bancarios o de tarjeta. Estas condiciones delimitan la aprobación operativa y no constituyen funciones implementadas ni garantías fuera de los casos comprobados.
