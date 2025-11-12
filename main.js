// Importamos del paquete "electron" los objetos necesarios y les asignamos nombres
// expresivos en español para mantener consistencia en el resto del archivo.
const {
  app: aplicacion, // "app" controla el ciclo de vida de la aplicación de escritorio.
  BrowserWindow: VentanaNavegador, // "BrowserWindow" permite crear ventanas nativas.
  ipcMain: ipcPrincipal // "ipcMain" recibe mensajes desde procesos de renderizado.
} = require('electron');
// Cargamos el módulo nativo "path" para construir rutas absolutas sin errores de separadores.
const ruta = require('path');
// Utilizamos "fs" para comprobar la existencia de archivos y directorios en el sistema.
const fs = require('fs');
// Importamos el cliente oficial de Firebird para Node.js, encargado de las consultas SQL.
const firebird = require('node-firebird');

// Determinamos la ruta del archivo de base de datos antes de arrancar la aplicación.
const RUTA_BASE_DATOS = obtenerRutaBaseDatos();

// Definimos un objeto de configuración reutilizable para crear conexiones hacia Firebird.
const CONFIGURACION_FIREBIRD = {
  // Permite sobrescribir la IP del servidor mediante variable de entorno, con "localhost" como valor por defecto.
  host: process.env.FIREBIRD_HOST || '127.0.0.1',
  // El puerto también es configurable; se convierte a número para cumplir con la librería.
  port: Number(process.env.FIREBIRD_PORT || 3050),
  // Ruta completa al archivo .FDB que contiene la información empresarial.
  database: RUTA_BASE_DATOS,
  // Usuario con privilegios administrativos; puede ajustarse en producción.
  user: process.env.FIREBIRD_USER || 'SYSDBA',
  // Contraseña por defecto de instalaciones estándar de Firebird.
  password: process.env.FIREBIRD_PASSWORD || 'masterkey',
  // Indicamos que se respeten las mayúsculas y minúsculas retornadas por el motor.
  lowercase_keys: false,
  // No se utiliza un rol específico, por lo que se deja en nulo.
  role: null,
  // Tamaño de página recomendado para lograr un equilibrio entre rendimiento y memoria.
  pageSize: 4096
};


// Función responsable de crear la ventana principal de la interfaz.
function crearVentana() {
  // Instanciamos una nueva ventana con dimensiones pensadas para uso en escritorio.
  const ventanaPrincipal = new VentanaNavegador({
    width: 1280, // Ancho inicial para mostrar tabla y panel de detalle cómodamente.
    height: 800, // Alto inicial que evita barras de desplazamiento innecesarias.
    minWidth: 960, // Evita que la interfaz colapse en pantallas más pequeñas.
    minHeight: 600, // Asegura que la tabla siga siendo legible.
    title: 'Consulta de compras', // Texto que se mostrará en la barra de la ventana.
    webPreferences: {
      // Cargamos el script de precarga que define el puente seguro de comunicación.
      preload: ruta.join(__dirname, 'preload.js'),
      // Se activa el aislamiento de contexto para evitar que la página acceda directamente a Node.js.
      contextIsolation: true,
      // Se desactiva la integración nativa de Node para reducir superficies de ataque.
      nodeIntegration: false
    }
  });

  // Cargamos el archivo HTML principal que vive en la carpeta "renderer".
  ventanaPrincipal.loadFile(ruta.join(__dirname, 'renderer', 'index.html'));
}

/**
 * Consulta las compras pendientes en la base de datos y las formatea para la interfaz.
 * Se incluyen las fechas del documento y de elaboración para permitir filtros cronológicos.
 */
// Realiza la consulta a Firebird para obtener las compras sin documento enlazado.
async function obtenerCompras() {
  // Consulta SQL que filtra las compras sin CFDI y descarta las canceladas.
  const consultaComprasPendientes = `SELECT
      CVE_DOC,
      SERIE,
      FECHA_DOC,
      FECHAELAB,
      STATUS,
      ESCFD
    FROM COMPC01
    WHERE ESCFD = 'N'
      AND (STATUS IS NULL OR TRIM(UPPER(STATUS)) <> 'C')
    ORDER BY CVE_DOC`;

  const consultaComprasTotales = `SELECT
      CVE_DOC,
      SERIE,
      FECHA_DOC,
      FECHAELAB,
      ESCFD
    FROM COMPC01
    WHERE STATUS IS NULL OR TRIM(UPPER(STATUS)) <> 'C'
    ORDER BY CVE_DOC`;

  const consultaEstadisticasPorSerie = `SELECT
      SERIE,
      SUM(CASE WHEN ESCFD = 'S' THEN 1 ELSE 0 END) AS CON_DOCUMENTO,
      SUM(CASE WHEN ESCFD = 'N' THEN 1 ELSE 0 END) AS SIN_DOCUMENTO,
      COUNT(*) AS TOTAL
    FROM COMPC01
    WHERE STATUS IS NULL OR TRIM(UPPER(STATUS)) <> 'C'
    GROUP BY SERIE`;

  // Envolvemos la operación en una Promesa para combinar la API basada en callbacks con async/await.
  return new Promise((resolver, rechazar) => {
    // Abrimos una conexión hacia el archivo FDB utilizando la configuración global.
    firebird.attach(CONFIGURACION_FIREBIRD, (errorConexion, baseDatos) => {
      // Si la conexión falla notificamos inmediatamente al proceso de renderizado.
      if (errorConexion) {
        return rechazar(errorConexion);
      }

      // Antes de ejecutar la consulta validamos que la tabla exista en la base.
      verificarExistenciaTabla(baseDatos, 'COMPC01')
        .then((existeTabla) => {
          // Si no existe se cierra la conexión y se informa del problema.
          if (!existeTabla) {
            baseDatos.detach();
            return rechazar(
              new Error(
                'La tabla COMPC01 no existe en la base de datos configurada. Verifica que la ruta y la empresa sean correctas.'
              )
            );
          }

          // Ejecutamos la consulta declarada anteriormente y obtenemos un arreglo de filas.
          (async () => {
            try {
              const resultadoCompras = await ejecutarConsulta(baseDatos, consultaComprasPendientes);
              const resultadoComprasTotales = await ejecutarConsulta(baseDatos, consultaComprasTotales);
              const resultadoEstadisticas = await ejecutarConsulta(baseDatos, consultaEstadisticasPorSerie);

              const informacionFormateada = resultadoCompras.map((registro) => ({
                clave: formatearCadena(registro.CVE_DOC), // Se recorta y valida la clave del documento.
                serie: formatearCadena(registro.SERIE), // Se limpia la serie asociada a la compra.
                documentoAsociado: formatearCadena(registro.ESCFD), // Muestra el indicador de documento asociado reportado por SAE.
                fechaDocumento: formatearFecha(registro.FECHA_DOC), // Convierte la fecha del documento a formato ISO.
                fechaCompra: formatearFecha(registro.FECHAELAB) // Fecha de elaboración utilizada para el filtrado.
              }));

              const informacionResumen = resultadoComprasTotales.map((registro) => ({
                clave: formatearCadena(registro.CVE_DOC),
                serie: formatearCadena(registro.SERIE),
                documentoAsociado: formatearCadena(registro.ESCFD),
                fechaDocumento: formatearFecha(registro.FECHA_DOC),
                fechaCompra: formatearFecha(registro.FECHAELAB)
              }));

              const estadisticasFormateadas = resultadoEstadisticas.map((registro) => ({
                serie: formatearCadena(registro.SERIE),
                conDocumento: Number.parseInt(registro.CON_DOCUMENTO, 10) || 0,
                sinDocumento: Number.parseInt(registro.SIN_DOCUMENTO, 10) || 0,
                total:
                  registro.TOTAL !== undefined
                    ? Number.parseInt(registro.TOTAL, 10) ||
                      (Number.parseInt(registro.CON_DOCUMENTO, 10) || 0) +
                        (Number.parseInt(registro.SIN_DOCUMENTO, 10) || 0)
                    : (Number.parseInt(registro.CON_DOCUMENTO, 10) || 0) +
                      (Number.parseInt(registro.SIN_DOCUMENTO, 10) || 0)
              }));

              baseDatos.detach();
              resolver({
                registros: informacionFormateada,
                registrosResumen: informacionResumen,
                estadisticasSeries: estadisticasFormateadas
              });
            } catch (errorConsulta) {
              baseDatos.detach();
              rechazar(errorConsulta);
            }
          })();
        })
        .catch((errorVerificacion) => {
          // Si ocurre un error en la verificación también liberamos la conexión.
          baseDatos.detach();
          // Propagamos el error al consumidor de la función.
          rechazar(errorVerificacion);
        });
    });
  });
}

// Verifica en las tablas de sistema que la relación solicitada exista.
function verificarExistenciaTabla(baseDatos, nombreTabla) {
  // Consulta que busca cualquier tabla de usuario con el nombre proporcionado.
  const consultaExistencia = `SELECT FIRST 1 1 AS EXISTE
    FROM RDB$RELATIONS
    WHERE RDB$SYSTEM_FLAG = 0
      AND TRIM(UPPER(RDB$RELATION_NAME)) = ?`;

  // Nuevamente retornamos una promesa para integrarnos con async/await.
  return new Promise((resolver, rechazar) => {
    // Ejecutamos la consulta pasando el nombre ya recortado y en mayúsculas.
    baseDatos.query(consultaExistencia, [nombreTabla.trim().toUpperCase()], (errorConsulta, resultado) => {
      // En caso de error devolvemos la causa original.
      if (errorConsulta) {
        return rechazar(errorConsulta);
      }

      // Si hay al menos un registro la tabla existe, de lo contrario no.
      resolver(resultado.length > 0);
    });
  });
}

// Normaliza cualquier tipo de dato para evitar valores nulos o con espacios sobrantes.
function formatearCadena(valor) {
  // Si recibimos null o undefined devolvemos una cadena vacía para simplificar el renderizado.
  if (valor === null || valor === undefined) {
    return '';
  }

  // Si ya es texto simplemente recortamos los espacios de inicio y fin.
  if (typeof valor === 'string') {
    return valor.trim();
  }

  // Para números o cualquier otro tipo lo convertimos a cadena y recortamos.
  return String(valor).trim();
}

/**
 * Normaliza la fecha recibida desde Firebird para facilitar su consumo en el renderizador.
 * @param {Date|string|null} valor - Fecha cruda devuelta por la consulta.
 * @returns {string|null}
 */
function formatearFecha(valor) {
  // Si no hay fecha registrada devolvemos nulo para distinguirlo de una cadena vacía.
  if (!valor) {
    return null;
  }

  // Aceptamos tanto objetos Date como valores serializados y los convertimos a Date.
  const fecha = valor instanceof Date ? valor : new Date(valor);

  // Si la fecha no es válida devolvemos nulo para que la interfaz muestre un mensaje adecuado.
  if (Number.isNaN(fecha.getTime())) {
    return null;
  }

  // Convertimos la fecha a ISO para facilitar su manipulación en el renderizador.
  return fecha.toISOString();
}

// Esperamos a que Electron inicialice todos sus componentes antes de crear ventanas.
aplicacion.whenReady().then(() => {
  // Creamos inmediatamente la ventana principal al arrancar la aplicación.
  crearVentana();

  // En macOS es habitual reabrir la ventana si el usuario hace clic en el dock.
  aplicacion.on('activate', () => {
    if (VentanaNavegador.getAllWindows().length === 0) {
      crearVentana();
    }
  });
});

// Cerramos la aplicación completa cuando se cierran todas las ventanas en plataformas distintas a macOS.
aplicacion.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    aplicacion.quit();
  }
});

// Registramos un manejador IPC que podrá ser invocado desde el proceso de renderizado.
ipcPrincipal.handle('obtener-compras', async () => {
  try {
    // Intentamos obtener las compras pendientes y las retornamos envueltas en un objeto.
    const { registros, registrosResumen, estadisticasSeries } = await obtenerCompras();
    return { datos: registros, resumen: registrosResumen, estadisticasSeries };
  } catch (error) {
    // Si ocurre un error estandarizamos el formato de respuesta de error para la interfaz.
    return {
      error: error.message ||
        'Ocurrió un error desconocido al consultar la base de datos. Verifica la conexión e inténtalo de nuevo.'
    };
  }
});

function obtenerRutaBaseDatos() {
  // Revisamos primero si el usuario proporcionó explícitamente la ruta al archivo FDB.
  const rutaDesdeEntorno = process.env.FIREBIRD_DB_PATH;
  if (rutaDesdeEntorno && fs.existsSync(rutaDesdeEntorno)) {
    return rutaDesdeEntorno;
  }

  // Directorio base donde Aspel instala por defecto las empresas en sistemas Windows de 64 bits.
  const baseAspel = 'C:\\Program Files (x86)\\Common Files\\Aspel\\Sistemas Aspel';
  // Versión sugerida de Aspel SAE para priorizar las rutas más recientes.
  const versionPorDefecto = 'SAE9.00';
  // Segmentos comunes de la ruta hacia la empresa 01 que se concatena con la versión detectada.
  const segmentosRutaRelativa = ['Empresa01', 'Datos', 'SAE90EMPRE01.FDB'];
  // Ruta resultante que se usará si no se encuentra otra alternativa mejor.
  const rutaPorDefecto = ruta.win32.join(baseAspel, versionPorDefecto, ...segmentosRutaRelativa);

  // Listamos las carpetas disponibles y nos quedamos con las que tengan un formato de versión válido.
  const versionesDisponibles = obtenerVersionesDisponibles(baseAspel)
    // Filtramos versiones anteriores a la de referencia para priorizar instalaciones nuevas.
    .filter((version) => compararVersiones(version, versionPorDefecto) >= 0)
    // Ordenamos de mayor a menor para encontrar primero la versión más actualizada.
    .sort((versionA, versionB) => compararVersiones(versionB, versionA));

  // Recorremos cada versión candidata construyendo la ruta final y verificando que exista el archivo.
  for (const version of versionesDisponibles) {
    const rutaPosible = ruta.win32.join(baseAspel, version, ...segmentosRutaRelativa);
    if (fs.existsSync(rutaPosible)) {
      return rutaPosible;
    }
  }

  // Si no se encontró ninguna coincidencia devolvemos la ruta predeterminada calculada.
  return rutaPorDefecto;
}

function ejecutarConsulta(baseDatos, consulta, parametros = []) {
  return new Promise((resolver, rechazar) => {
    baseDatos.query(consulta, parametros, (error, resultado) => {
      if (error) {
        return rechazar(error);
      }

      resolver(resultado);
    });
  });
}

function obtenerVersionesDisponibles(directorioBase) {
  try {
    // Leemos el contenido del directorio incluyendo información de tipo de cada elemento.
    const elementos = fs.readdirSync(directorioBase, { withFileTypes: true });
    return elementos
      // Solo nos interesan las carpetas, ya que cada versión se almacena en su propia carpeta.
      .filter((elemento) => elemento.isDirectory())
      // Extraemos el nombre de cada directorio para analizarlo posteriormente.
      .map((elemento) => elemento.name)
      // Validamos que el nombre siga el patrón SAE{major}.{minor} que utiliza Aspel.
      .filter((nombre) => /^SAE\d+\.\d+$/.test(nombre));
  } catch (error) {
    // Si el directorio no existe o no es accesible devolvemos un arreglo vacío.
    return [];
  }
}

function compararVersiones(versionA, versionB) {
  // Convertimos ambas cadenas de versión en objetos con componentes numéricos.
  const valorA = extraerComponentesVersion(versionA);
  const valorB = extraerComponentesVersion(versionB);

  // Si ninguna versión es válida se consideran equivalentes.
  if (!valorA && !valorB) {
    return 0;
  }
  // Si solo la versión A es inválida se coloca por debajo de la otra.
  if (!valorA) {
    return -1;
  }
  // Caso contrario si solo la versión B es inválida se considera menor.
  if (!valorB) {
    return 1;
  }

  // Primero comparamos el componente mayor (antes del punto).
  if (valorA.mayor !== valorB.mayor) {
    return valorA.mayor - valorB.mayor;
  }

  // Si los mayores son iguales comparamos el componente menor para desempatar.
  return valorA.menor - valorB.menor;
}

function extraerComponentesVersion(nombreVersion) {
  // Utilizamos una expresión regular para extraer la parte numérica de la cadena.
  const coincidencia = /^SAE(\d+)(?:\.(\d+))?$/i.exec(nombreVersion);
  if (!coincidencia) {
    return null;
  }

  // Convertimos las capturas en números enteros para permitir comparaciones aritméticas.
  return {
    mayor: Number.parseInt(coincidencia[1], 10),
    menor: Number.parseInt(coincidencia[2] || '0', 10)
  };
}
