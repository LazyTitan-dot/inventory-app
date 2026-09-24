# SmartLiving · Inventario y operaciones retail

Aplicación en español para una tienda de electrodomésticos en República Dominicana. React, TypeScript, Vite y Supabase (PostgreSQL, Auth, Realtime y Storage). Importes en pesos dominicanos; fechas operativas en `America/Santo_Domingo`.

## Operación diaria

- Resumen operativo, catálogo por variantes, SKU, código de barras, imágenes privadas, costos, precios y reposición.
- Existencias disponibles y en revisión, conteos físicos con motivo e historial de movimientos.
- Clientes, proveedores, órdenes de compra y recepciones parciales.
- Ventas, medios de pago registrados, descuentos, promociones, cotizaciones y recibos imprimibles.
- Devoluciones parciales con límite de cantidades e importes, anulación controlada y consulta de garantías conservadas al vender.
- Entregas con responsable, reprogramación, intentos fallidos y constancia de recepción.
- Reportes, exportación CSV, configuración comercial, roles y auditoría.

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

Las cuentas se registran y confirman con Supabase Auth; no hay registro público que conceda acceso al negocio. Un propietario autoriza cuentas existentes desde **Configuración → Equipo y permisos**.

| Rol | Acceso |
| --- | --- |
| Propietario | Operación completa y administración de propietarios/administradores |
| Administrador | Operación completa; administra roles operativos |
| Ventas y caja | Catálogo sin costos, clientes, ventas, cotizaciones, garantías y entregas |
| Inventario y compras | Catálogo con costos, existencias, proveedores, compras y entregas |
| Consulta | Catálogo y existencias sin costos ni datos comerciales privados |

El primer propietario se provisiona administrativamente contra una cuenta Auth confirmada; no se incluye un correo real ni credenciales en una migración pública. No se puede suspender al último propietario activo.

## Migraciones y conservación del legado

Las migraciones `supabase/migrations/*_retail_*.sql` amplían el esquema existente. Las versiones locales corresponden a las aplicadas mediante el conector de Supabase. Las cuatro migraciones históricas de abril de 2026 ya existían remotamente y no deben repetirse. Los SQL originales en `docs/legacy` se conservan solo como referencia, no como un procedimiento de actualización recomendado.

Consultar `docs/database-contract.md` antes de modificar los comandos o el modelo. En una base nueva debe prepararse explícitamente el esquema base o ejecutar una instalación adaptada; no ejecutar las migraciones históricas destructivas sobre datos existentes.

El adaptador de legado se define mediante una migración, pero **no importa automáticamente**. El corte es una operación administrativa separada:

1. Revisar el manifiesto y la identidad del propietario responsable.
2. Ensayar `retail_private.import_legacy(...)` dentro de una transacción que termina en `ROLLBACK`.
3. Conciliar cantidades, documentos e importes; comprobar imágenes y permisos.
4. Preparar la nueva versión y coordinar el corte para impedir escrituras simultáneas en ambos modelos.
5. Ejecutar el corte con el SHA256 revisado. Cambios de origen desde la revisión abortan la operación.
6. Verificar el acceso desde la URL publicada y los totales después de la importación.

El archivo conserva todas las filas originales, sus hashes y sus permisos previos. Se conserva el saldo actual sin repetir ventas o compras históricas. La importación revoca el acceso API al modelo anterior en la misma transacción. No elimina sus filas. No reactivar el frontend antiguo después del corte sin un plan de reconciliación: las nuevas operaciones pertenecen al modelo normalizado.

Identidades históricas reutilizadas, garantías desconocidas, precios sin registrar y discrepancias de tasas se señalan en Auditoría. No se inventan enlaces ni se recalculan importes antiguos. La resolución de un dato de negocio desconocido requiere evidencia del documento original.

## Despliegue y verificación

Vercel ejecuta `npm ci` y `npm run build`; únicamente publica `dist`. Los HTML y SQL originales conservados en el repositorio no se sirven como aplicación. `vercel.json` configura rutas SPA, encabezados de seguridad y políticas de caché. El service worker anterior se retira para que no mantenga una versión obsoleta.

Revisar build, entorno público, autenticación, recarga de rutas, CSP, imágenes y flujos reales después de cada despliegue. Un build correcto no acredita por sí solo una aprobación de producción. Consultar `docs/verification-log.md` para distinguir comprobaciones realizadas de pendientes.
