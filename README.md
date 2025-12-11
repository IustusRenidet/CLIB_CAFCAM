# CLIB_Llantas

Aplicación web y de escritorio pensada para editar los campos libres de los documentos del módulo de ventas de Aspel SAE.
Funciona como una SPA servida desde un servidor web local que puede empaquetarse con Electron y distribuirse usando ASAR.

## Características

- **Múltiples instancias**: Cada ventana de la aplicación usa su propio servidor en un puerto dinámico, permitiendo que varios usuarios o instancias funcionen simultáneamente sin conflictos.
- Consulta rápida de facturas, pedidos, cotizaciones, remisiones, devoluciones, notas de venta y parcialidades.
- Lectura y edición de los campos libres (`CAMPLIB1` a `CAMPLIB11`) guardados en las tablas `FACTX_CLIBxx`.
- Visualización de partidas por documento desde las tablas `PAR_FA...xx` para verificar cantidades y artículos.
- Obtención automática de las etiquetas configuradas en `PARAM_CAMPOSLIBRESXX` para mostrar nombres amigables.
- API REST interna construida con Express y `node-firebird`, pensada para ejecutarse en Windows o empaquetada con Electron.

## Requisitos previos

- Node.js 18 o superior.
- Acceso a un servidor Firebird con las bases de Aspel SAE. Por defecto se intenta abrir `SAE90EMPRE01.FDB` en la ruta estándar:
  `C:\Program Files (x86)\Common Files\Aspel\Sistemas Aspel\SAE9.00\Empresa01\Datos\SAE90EMPRE01.FDB`.

## Variables de entorno opcionales

| Variable                | Descripción                                                        | Valor por defecto |
| ----------------------- | ------------------------------------------------------------------ | ----------------- |
| `PORT`                  | Puerto HTTP para la SPA (0 = puerto dinámico automático)          | `0` (dinámico)    |
| `FIREBIRD_DB_PATH`      | Ruta completa del archivo `.FDB`                                   | Ruta detectada    |
| `FIREBIRD_HOST`         | IP o nombre del servidor Firebird                                  | `127.0.0.1`       |
| `FIREBIRD_PORT`         | Puerto de Firebird                                                  | `3050`            |
| `FIREBIRD_USER`         | Usuario con permisos de lectura/escritura                          | `SYSDBA`          |
| `FIREBIRD_PASSWORD`     | Contraseña del usuario                                              | `masterkey`       |

## Uso como aplicación web

```bash
npm run web
```

Esto levanta el backend en un puerto dinámico (por defecto el sistema asigna uno disponible). El puerto se muestra en la consola al iniciar.

## Uso como aplicación de escritorio

```bash
npm start
```

Electron levanta automáticamente un servidor web en un puerto disponible y carga la interfaz en una ventana nativa. **Puedes abrir múltiples instancias simultáneamente** - cada una usará su propio puerto y funcionará de manera independiente.

## API disponible

| Método | Ruta                                          | Descripción                                                |
| ------ | --------------------------------------------- | ---------------------------------------------------------- |
| GET    | `/api/tipos-documento`                        | Catálogo de documentos soportados                          |
| GET    | `/api/documentos/buscar`                      | Búsqueda por clave o cliente (`tipo`, `empresa`, `termino`) |
| GET    | `/api/documentos/:tipo/:empresa/:cve_doc`     | Datos generales, campos libres y partidas                  |
| PUT    | `/api/documentos/:tipo/:empresa/:cve_doc`     | Guarda los valores de `CAMPLIB1` a `CAMPLIB11`              |
| GET    | `/api/estado`                                 | Comprobación rápida del backend                            |

La SPA incluida en `public/` consume estas rutas para mostrar y editar la información.
