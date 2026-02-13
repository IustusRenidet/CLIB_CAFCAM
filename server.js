const express = require('express');
const path = require('path');
const fs = require('fs');
const firebird = require('node-firebird');

// Función para obtener la ruta correcta de archivos, manejando empaquetado asar
function obtenerRutaRecurso(rutaRelativa) {
  return path.join(__dirname, rutaRelativa);
}

const TIPOS_DOCUMENTO = {
  F: {
    clave: 'F',
    descripcion: 'Factura',
    tabla: 'FACTF',
    tablaClib: 'FACTF_CLIB',
    tablaPartidas: 'PAR_FACTF',
    tablaPartidasClib: 'PAR_FACTF_CLIB'
  },
  P: {
    clave: 'P',
    descripcion: 'Pedido',
    tabla: 'FACTP',
    tablaClib: 'FACTP_CLIB',
    tablaPartidas: 'PAR_FACTP',
    tablaPartidasClib: 'PAR_FACTP_CLIB'
  },
  C: {
    clave: 'C',
    descripcion: 'Cotización',
    tabla: 'FACTC',
    tablaClib: 'FACTC_CLIB',
    tablaPartidas: 'PAR_FACTC',
    tablaPartidasClib: 'PAR_FACTC_CLIB'
  },
  R: {
    clave: 'R',
    descripcion: 'Remisión',
    tabla: 'FACTR',
    tablaClib: 'FACTR_CLIB',
    tablaPartidas: 'PAR_FACTR',
    tablaPartidasClib: 'PAR_FACTR_CLIB'
  },
  D: {
    clave: 'D',
    descripcion: 'Devolución',
    tabla: 'FACTD',
    tablaClib: 'FACTD_CLIB',
    tablaPartidas: 'PAR_FACTD',
    tablaPartidasClib: 'PAR_FACTD_CLIB'
  },
  V: {
    clave: 'V',
    descripcion: 'Nota de venta',
    tabla: 'FACTV',
    tablaClib: 'FACTV_CLIB',
    tablaPartidas: 'PAR_FACTV',
    tablaPartidasClib: 'PAR_FACTV_CLIB'
  },
  A: {
    clave: 'A',
    descripcion: 'Parcialidad / cobro',
    tabla: 'FACTA',
    tablaClib: 'FACTA_CLIB',
    tablaPartidas: 'PAR_FACTA',
    tablaPartidasClib: 'PAR_FACTA_CLIB'
  },
  E: {
    clave: 'E',
    descripcion: 'Nota de crédito',
    tabla: 'FACTE',
    tablaClib: 'FACTE_CLIB',
    tablaPartidas: 'PAR_FACTE',
    tablaPartidasClib: 'PAR_FACTE_CLIB'
  },
  G: {
    clave: 'G',
    descripcion: 'Comprobante de pago',
    tabla: 'FACTG',
    tablaClib: 'FACTG_CLIB',
    tablaPartidas: 'PAR_FACTG',
    tablaPartidasClib: 'PAR_FACTG_CLIB'
  },
  T: {
    clave: 'T',
    descripcion: 'Traslado Carta Porte',
    tabla: 'FACTT',
    tablaClib: 'FACTT_CLIB',
    tablaPartidas: 'PAR_FACTT',
    tablaPartidasClib: 'PAR_FACTT_CLIB'
  }
};

const MAPA_IDTABLAS_DOCUMENTO = {
  F: ['FACTF_CLIB'],
  P: ['FACTP_CLIB'],
  C: ['FACTC_CLIB'],
  R: ['FACTR_CLIB'],
  D: ['FACTD_CLIB'],
  V: ['FACTV_CLIB'],
  A: ['FACTA_CLIB'],
  E: ['FACTE_CLIB'],
  G: ['FACTG_CLIB'],
  T: ['FACTT_CLIB']
};

const MAPA_IDTABLAS_PARAM_PARTIDAS = {
  F: ['PAR_FACTF_CLIB', 'PAR_FACF_CLIB'],
  P: ['PAR_FACTP_CLIB', 'PAR_FACP_CLIB'],
  C: ['PAR_FACTC_CLIB', 'PAR_FACC_CLIB'],
  R: ['PAR_FACTR_CLIB', 'PAR_FACR_CLIB'],
  D: ['PAR_FACTD_CLIB', 'PAR_FACD_CLIB'],
  V: ['PAR_FACTV_CLIB', 'PAR_FACV_CLIB'],
  A: ['PAR_FACTA_CLIB', 'PAR_FACA_CLIB'],
  E: ['PAR_FACTE_CLIB', 'PAR_FACE_CLIB'],
  G: ['PAR_FACTG_CLIB', 'PAR_FACG_CLIB'],
  T: ['PAR_FACTT_CLIB', 'PAR_FACT_CLIB']
};

const TODAS_IDTABLAS_PARTIDAS = crearSetIdTablasPartidas();

const PREFIJO_CAMPOS_LIBRES = 'CAMPLIB';
const REGEX_CAMPO_LIBRE = /^CAMPLIB\d+$/;
const LONGITUD_MAXIMA_BUSQUEDA_GENERAL = 30;
const LONGITUD_MAXIMA_CVE_DOC = 20;
const LONGITUD_MAXIMA_CVE_CLIENTE = 10;
const CONDICION_DOCUMENTO_VIGENTE = "TRIM(COALESCE(STATUS, '')) <> 'C'";
const PUERTO_PREFERIDO = Number(process.env.PORT || 3001);
const RUTA_BASE_DATOS = obtenerRutaBaseDatos();
const CONFIGURACION_FIREBIRD = {
  host: process.env.FIREBIRD_HOST || '127.0.0.1',
  port: Number(process.env.FIREBIRD_PORT || 3050),
  database: RUTA_BASE_DATOS,
  user: process.env.FIREBIRD_USER || 'SYSDBA',
  password: process.env.FIREBIRD_PASSWORD || 'masterkey',
  lowercase_keys: false,
  role: null,
  pageSize: 4096
};

const aplicacion = express();
const cacheTablas = new Map();
const cacheCamposTabla = new Map();
let servidorHttp = null;
let puertoServidor = PUERTO_PREFERIDO;

aplicacion.disable('x-powered-by');
aplicacion.use(express.json({ limit: '1mb' }));
aplicacion.use(express.static(obtenerRutaRecurso('public')));

aplicacion.get('/api/tipos-documento', (req, res) => {
  res.json({
    ok: true,
    tipos: Object.values(TIPOS_DOCUMENTO).map((tipo) => ({ clave: tipo.clave, descripcion: tipo.descripcion }))
  });
});

aplicacion.get('/api/documentos/buscar', asyncHandler(async (req, res) => {
  const definicion = obtenerDefinicionTipo(req.query.tipo);
  const empresa = normalizarEmpresa(req.query.empresa);
  const termino = limitarLongitudBusqueda(formatearTexto(req.query.termino || ''), LONGITUD_MAXIMA_BUSQUEDA_GENERAL);
  const tablaDocumentos = `${definicion.tabla}${empresa}`;

  const resultados = await conConexion(async (db) => {
    const existeTabla = await verificarTabla(db, tablaDocumentos);
    if (!existeTabla) {
      throw new AplicacionError(`La tabla ${tablaDocumentos} no existe en la base de datos.`, 404);
    }

    const condiciones = [];
    condiciones.push(CONDICION_DOCUMENTO_VIGENTE);
    const parametros = [];
    if (termino) {
      const comparadorDocumento = crearComparadorBusqueda(termino, LONGITUD_MAXIMA_CVE_DOC);
      const comparadorCliente = crearComparadorBusqueda(termino, LONGITUD_MAXIMA_CVE_CLIENTE);
      condiciones.push(
        "(UPPER(TRIM(CVE_DOC)) LIKE '%' || ? || '%' OR UPPER(TRIM(CVE_CLPV)) LIKE '%' || ? || '%')"
      );
      parametros.push(comparadorDocumento, comparadorCliente);
    }

    const consulta = [
      `SELECT FIRST 25 CVE_DOC, CVE_CLPV, FECHA_DOC`,
      `FROM ${tablaDocumentos}`,
      condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '',
      'ORDER BY FECHA_DOC DESC'
    ]
      .filter(Boolean)
      .join(' ');

    const registros = await ejecutarConsulta(db, consulta, parametros);
    return registros.map((registro) => ({
      tipo: definicion.clave,
      empresa,
      cveDoc: formatearTexto(registro.CVE_DOC),
      cliente: formatearTexto(registro.CVE_CLPV),
      fechaDoc: formatearFecha(registro.FECHA_DOC)
    }));
  });

  res.json({ ok: true, resultados });
}));

aplicacion.get('/api/documentos/:tipo/:empresa/:clave', asyncHandler(async (req, res) => {
  const definicion = obtenerDefinicionTipo(req.params.tipo);
  const empresa = normalizarEmpresa(req.params.empresa);
  const claveDocumento = normalizarClaveDocumento(req.params.clave);

  const datos = await conConexion(async (db) => {
    const tablaDocumentos = `${definicion.tabla}${empresa}`;
    const tablaClib = `${definicion.tablaClib}${empresa}`;
    const tablaPartidas = `${definicion.tablaPartidas}${empresa}`;
    const tablaPartidasClib = await obtenerTablaPartidasClib(db, definicion, empresa);
    const tablaParametros = `PARAM_CAMPOSLIBRES${empresa}`;

    const existeDocumentos = await verificarTabla(db, tablaDocumentos);
    if (!existeDocumentos) {
      throw new AplicacionError('No se encontraron las tablas necesarias en la base de datos.', 404);
    }

    const existeClib = await verificarTabla(db, tablaClib);
    const documento = await obtenerDocumento(db, tablaDocumentos, claveDocumento);
    if (!documento) {
      throw new AplicacionError(`No existe el documento ${claveDocumento} en la empresa ${empresa}.`, 404);
    }

    const camposDisponiblesDocumento = existeClib ? await obtenerCamposDisponiblesEnTabla(db, tablaClib) : [];
    const detalleCamposDocumento = camposDisponiblesDocumento.length
      ? await obtenerMetadatosCamposLibres(db, tablaClib, camposDisponiblesDocumento)
      : {};
    const camposLibres = camposDisponiblesDocumento.length
      ? await obtenerCamposLibres(db, tablaClib, claveDocumento, camposDisponiblesDocumento)
      : {};
    const etiquetas = await obtenerEtiquetasCampos(db, tablaParametros, definicion, empresa);
    const {
      partidas,
      camposDisponiblesPartidas,
      detalleCamposPartidas
    } = await obtenerPartidas(db, tablaPartidas, tablaPartidasClib, claveDocumento);

    return {
      documento,
      camposLibres,
      etiquetas,
      camposDisponiblesDocumento,
      detalleCamposDocumento,
      partidas,
      camposPartidasDisponibles: camposDisponiblesPartidas,
      detalleCamposPartidas
    };
  });

  res.json({ ok: true, ...datos });
}));

aplicacion.put('/api/documentos/:tipo/:empresa/:clave', asyncHandler(async (req, res) => {
  const definicion = obtenerDefinicionTipo(req.params.tipo);
  const empresa = normalizarEmpresa(req.params.empresa);
  const claveDocumento = normalizarClaveDocumento(req.params.clave);
  const cuerpo = req.body || {};
  const camposRecibidos = cuerpo.campos;
  const partidasRecibidas = cuerpo.partidas;

  if (!camposRecibidos || typeof camposRecibidos !== 'object') {
    throw new AplicacionError('Es necesario enviar un objeto "campos" con los valores a guardar.');
  }

  await conConexion(async (db) => {
    const tablaDocumentos = `${definicion.tabla}${empresa}`;
    const tablaClib = `${definicion.tablaClib}${empresa}`;
    const tablaPartidasClib = await obtenerTablaPartidasClib(db, definicion, empresa);

    const existeDocumentos = await verificarTabla(db, tablaDocumentos);
    if (!existeDocumentos) {
      throw new AplicacionError('No se encontraron las tablas necesarias en la base de datos.', 404);
    }
    const existeClib = await verificarTabla(db, tablaClib);

    const documento = await obtenerDocumento(db, tablaDocumentos, claveDocumento);
    if (!documento) {
      throw new AplicacionError(`No existe el documento ${claveDocumento} en la empresa ${empresa}.`, 404);
    }

    if (existeClib) {
      const camposDisponiblesDocumento = await obtenerCamposDisponiblesEnTabla(db, tablaClib);
      if (camposDisponiblesDocumento.length) {
        const longitudesDocumento = await obtenerLongitudesCamposLibres(db, tablaClib, camposDisponiblesDocumento);
        const camposNormalizados = normalizarCamposLibres(
          camposRecibidos,
          camposDisponiblesDocumento,
          longitudesDocumento
        );
        await guardarCamposLibres(db, tablaClib, claveDocumento, camposNormalizados, camposDisponiblesDocumento);
      }
    }

    if (Array.isArray(partidasRecibidas) && partidasRecibidas.length) {
      if (!tablaPartidasClib) {
        throw new AplicacionError('No existen campos libres configurados para las partidas en esta empresa.', 404);
      }
      const camposDisponiblesPartidas = await obtenerCamposDisponiblesEnTabla(db, tablaPartidasClib);
      if (!camposDisponiblesPartidas.length) {
        throw new AplicacionError('No existen campos libres configurados para las partidas en esta empresa.', 404);
      }
      const longitudesPartidas = await obtenerLongitudesCamposLibres(db, tablaPartidasClib, camposDisponiblesPartidas);
      const partidasNormalizadas = normalizarPartidas(partidasRecibidas, camposDisponiblesPartidas, longitudesPartidas);
      await guardarCamposLibresPartidas(
        db,
        tablaPartidasClib,
        claveDocumento,
        partidasNormalizadas,
        camposDisponiblesPartidas
      );
    }
  });

  res.json({ ok: true, mensaje: 'Campos libres actualizados correctamente.' });
}));

aplicacion.get('/api/estado', (req, res) => {
  res.json({ ok: true, mensaje: 'Servidor en ejecución', baseDatos: CONFIGURACION_FIREBIRD.database });
});

aplicacion.use('/api', (req, res) => {
  res.status(404).json({ ok: false, mensaje: 'No se encontró el recurso solicitado.' });
});

aplicacion.get('*', (req, res) => {
  const rutaIndex = obtenerRutaRecurso(path.join('public', 'index.html'));
  res.sendFile(rutaIndex, (error) => {
    if (!error) {
      return;
    }

    console.error(`[UI] No fue posible servir index.html (${rutaIndex}).`, error);
    res
      .status(500)
      .type('text/plain')
      .send('La instalación de la aplicación está incompleta o dañada. Reinstálala o contacta a soporte.');
  });
});

function asyncHandler(funcion) {
  return function envoltura(req, res, next) {
    Promise.resolve(funcion(req, res, next)).catch((error) => {
      const estado = error.estado || 500;
      console.error(`[API] ${error.message}`);
      res.status(estado).json({ ok: false, mensaje: error.message || 'Ocurrió un error inesperado.' });
    });
  };
}

class AplicacionError extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje);
    this.estado = estado;
  }
}

function obtenerDefinicionTipo(tipo) {
  const clave = (tipo || '').toString().trim().toUpperCase();
  const definicion = TIPOS_DOCUMENTO[clave];
  if (!definicion) {
    throw new AplicacionError('El tipo de documento no es válido.', 400);
  }
  return definicion;
}

function normalizarEmpresa(valor) {
  const numero = Number.parseInt(valor, 10);
  if (Number.isNaN(numero) || numero < 1) {
    return '01';
  }
  return numero.toString().padStart(2, '0');
}

function normalizarClaveDocumento(valor) {
  if (!valor) {
    throw new AplicacionError('Debes especificar la clave del documento.');
  }
  return valor.toString().trim().toUpperCase();
}

function formatearTexto(valor) {
  if (valor === null || valor === undefined) {
    return '';
  }
  return valor.toString().trim();
}

function formatearFecha(valor) {
  if (!valor) {
    return null;
  }
  const fecha = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(fecha.getTime())) {
    return null;
  }
  return fecha.toISOString();
}

function conectarFirebird() {
  return new Promise((resolve, reject) => {
    firebird.attach(CONFIGURACION_FIREBIRD, (error, db) => {
      if (error) {
        reject(error);
      } else {
        resolve(db);
      }
    });
  });
}

async function conConexion(trabajo) {
  const db = await conectarFirebird();
  try {
    return await trabajo(db);
  } finally {
    db.detach();
  }
}

function ejecutarConsulta(db, consulta, parametros = []) {
  return new Promise((resolve, reject) => {
    db.query(consulta, parametros, (error, resultado) => {
      if (error) {
        reject(error);
      } else {
        resolve(resultado);
      }
    });
  });
}

async function verificarTabla(db, nombreTabla) {
  if (cacheTablas.has(nombreTabla)) {
    return cacheTablas.get(nombreTabla);
  }
  const consulta = `SELECT FIRST 1 1 AS EXISTE FROM RDB$RELATIONS WHERE RDB$SYSTEM_FLAG = 0 AND TRIM(UPPER(RDB$RELATION_NAME)) = ?`;
  const resultado = await ejecutarConsulta(db, consulta, [nombreTabla.trim().toUpperCase()]);
  const existe = resultado.length > 0;
  cacheTablas.set(nombreTabla, existe);
  return existe;
}

async function obtenerCamposDisponiblesEnTabla(db, nombreTabla) {
  const tabla = normalizarIdentificadorTabla(nombreTabla);
  if (!tabla) {
    return [];
  }
  if (cacheCamposTabla.has(tabla)) {
    return cacheCamposTabla.get(tabla);
  }
  const consulta = `
    SELECT TRIM(UPPER(RDB$FIELD_NAME)) AS CAMPO
    FROM RDB$RELATION_FIELDS
    WHERE TRIM(UPPER(RDB$RELATION_NAME)) = ?
      AND TRIM(UPPER(RDB$FIELD_NAME)) LIKE '${PREFIJO_CAMPOS_LIBRES}%'
    ORDER BY RDB$FIELD_POSITION
  `;
  const registros = await ejecutarConsulta(db, consulta, [tabla]);
  const campos = registros
    .map((registro) => normalizarIdentificadorCampoLibre(registro.CAMPO))
    .filter(Boolean);
  cacheCamposTabla.set(tabla, campos);
  return campos;
}

async function obtenerLongitudesCamposLibres(db, nombreTabla, camposDisponibles = []) {
  const tabla = normalizarIdentificadorTabla(nombreTabla);
  if (!tabla || !camposDisponibles.length) {
    return new Map();
  }

  const consulta = `
    SELECT
      TRIM(UPPER(rf.RDB$FIELD_NAME)) AS CAMPO,
      COALESCE(f.RDB$CHARACTER_LENGTH, 0) AS LONGITUD
    FROM RDB$RELATION_FIELDS rf
    JOIN RDB$FIELDS f ON rf.RDB$FIELD_SOURCE = f.RDB$FIELD_NAME
    WHERE TRIM(UPPER(rf.RDB$RELATION_NAME)) = ?
      AND TRIM(UPPER(rf.RDB$FIELD_NAME)) LIKE '${PREFIJO_CAMPOS_LIBRES}%'
  `;

  const registros = await ejecutarConsulta(db, consulta, [tabla]);
  const mapa = new Map();
  registros.forEach((registro) => {
    const campo = normalizarIdentificadorCampoLibre(registro.CAMPO);
    if (!campo || !camposDisponibles.includes(campo)) {
      return;
    }
    const longitud = Number.parseInt(registro.LONGITUD, 10);
    mapa.set(campo, Number.isFinite(longitud) && longitud > 0 ? longitud : null);
  });
  return mapa;
}

async function obtenerMetadatosCamposLibres(db, nombreTabla, camposDisponibles = []) {
  const tabla = normalizarIdentificadorTabla(nombreTabla);
  if (!tabla || !camposDisponibles.length) {
    return {};
  }

  const consulta = `
    SELECT
      TRIM(UPPER(rf.RDB$FIELD_NAME)) AS CAMPO,
      COALESCE(f.RDB$CHARACTER_LENGTH, 0) AS LONGITUD,
      COALESCE(f.RDB$FIELD_TYPE, 0) AS TIPO,
      COALESCE(f.RDB$FIELD_SUB_TYPE, 0) AS SUBTIPO
    FROM RDB$RELATION_FIELDS rf
    JOIN RDB$FIELDS f ON rf.RDB$FIELD_SOURCE = f.RDB$FIELD_NAME
    WHERE TRIM(UPPER(rf.RDB$RELATION_NAME)) = ?
      AND TRIM(UPPER(rf.RDB$FIELD_NAME)) LIKE '${PREFIJO_CAMPOS_LIBRES}%'
  `;

  const registros = await ejecutarConsulta(db, consulta, [tabla]);
  const detalle = {};
  registros.forEach((registro) => {
    const campo = normalizarIdentificadorCampoLibre(registro.CAMPO);
    if (!campo || !camposDisponibles.includes(campo)) {
      return;
    }
    const longitud = Number.parseInt(registro.LONGITUD, 10);
    const tipoCodigo = Number.parseInt(registro.TIPO, 10);
    const subTipo = Number.parseInt(registro.SUBTIPO, 10);
    detalle[campo] = {
      longitud: Number.isFinite(longitud) && longitud > 0 ? longitud : null,
      tipo: mapearTipoDatoFirebird(tipoCodigo, subTipo)
    };
  });
  return detalle;
}

function mapearTipoDatoFirebird(tipoCodigo, subTipo) {
  switch (tipoCodigo) {
    case 7:
    case 8:
      return 'Entero';
    case 16:
      return subTipo === 1 ? 'Decimal' : 'Entero';
    case 10:
    case 11:
    case 27:
      return 'Decimal';
    case 12:
      return 'Fecha';
    case 13:
      return 'Hora';
    case 35:
      return 'Fecha y hora';
    case 14:
    case 37:
    case 40:
      return 'Texto';
    case 261:
      return 'Texto largo';
    default:
      return 'Dato';
  }
}

async function obtenerDocumento(db, tablaDocumentos, claveDocumento) {
  const consulta =
    `SELECT FIRST 1 CVE_DOC, CVE_CLPV, FECHA_DOC FROM ${tablaDocumentos} WHERE TRIM(UPPER(CVE_DOC)) = ? AND ${CONDICION_DOCUMENTO_VIGENTE}`;
  const registros = await ejecutarConsulta(db, consulta, [claveDocumento.toUpperCase()]);
  if (!registros.length) {
    return null;
  }
  const registro = registros[0];
  return {
    descripcion: `${tablaDocumentos} · ${formatearTexto(registro.CVE_DOC)}`,
    cveDoc: formatearTexto(registro.CVE_DOC),
    cliente: formatearTexto(registro.CVE_CLPV),
    fechaDoc: formatearFecha(registro.FECHA_DOC)
  };
}

async function obtenerCamposLibres(db, tablaClib, claveDocumento, camposDisponibles = []) {
  if (!camposDisponibles.length) {
    return {};
  }
  const consulta = `SELECT ${camposDisponibles.join(', ')} FROM ${tablaClib} WHERE TRIM(UPPER(CLAVE_DOC)) = ?`;
  const registros = await ejecutarConsulta(db, consulta, [claveDocumento.toUpperCase()]);
  const resultado = {};
  camposDisponibles.forEach((campo) => {
    resultado[campo] = registros.length ? formatearTexto(registros[0][campo]) : '';
  });
  return resultado;
}

async function obtenerEtiquetasCampos(db, tablaParametros, definicion, empresa) {
  const existeTablaParametros = await verificarTabla(db, tablaParametros);
  if (!existeTablaParametros) {
    return crearMapaEtiquetas();
  }

  const mapaIdTablas = new Map();
  obtenerIdTablasParametrosDocumento(definicion, empresa).forEach((id) => {
    mapaIdTablas.set(id, 'documento');
  });
  obtenerIdTablasParametrosPartidas(definicion, empresa).forEach((id) => {
    mapaIdTablas.set(id, 'partidas');
  });

  if (!mapaIdTablas.size) {
    return crearMapaEtiquetas();
  }

  const ids = Array.from(mapaIdTablas.keys());
  const marcadores = ids.map(() => '?').join(', ');
  const consulta = `SELECT CAMPO, ETIQUETA, IDTABLA FROM ${tablaParametros} WHERE TRIM(UPPER(IDTABLA)) IN (${marcadores})`;
  const registros = await ejecutarConsulta(db, consulta, ids);
  const etiquetas = crearMapaEtiquetas();

  registros.forEach((registro) => {
    const campo = formatearTexto(registro.CAMPO).toUpperCase();
    if (!REGEX_CAMPO_LIBRE.test(campo)) {
      return;
    }
    const idTabla = normalizarIdentificadorTabla(registro.IDTABLA);
    const origen = mapaIdTablas.get(idTabla) || determinarOrigenIdTabla(idTabla);
    etiquetas[origen][campo] = formatearTexto(registro.ETIQUETA);
  });

  return etiquetas;
}

async function obtenerPartidas(db, tablaPartidas, tablaPartidasClib, claveDocumento) {
  const existePartidas = await verificarTabla(db, tablaPartidas);
  const partidas = [];
  if (existePartidas) {
    const consulta = `SELECT CVE_DOC, NUM_PAR, CVE_ART, UNI_VENTA, CANT, PREC, TOT_PARTIDA FROM ${tablaPartidas} WHERE TRIM(UPPER(CVE_DOC)) = ? ORDER BY NUM_PAR`;
    const registros = await ejecutarConsulta(db, consulta, [claveDocumento.toUpperCase()]);
    registros.forEach((registro) => {
      partidas.push({
        numero: Number.parseInt(registro.NUM_PAR, 10) || 0,
        articulo: formatearTexto(registro.CVE_ART),
        unidad: formatearTexto(registro.UNI_VENTA),
        cantidad: Number(registro.CANT) || 0,
        precio: Number(registro.PREC) || 0,
        total: Number(registro.TOT_PARTIDA) || 0
      });
    });
  }

  let camposDisponiblesPartidas = [];
  let detalleCamposPartidas = {};
  if (tablaPartidasClib) {
    const existeTablaClib = await verificarTabla(db, tablaPartidasClib);
    if (existeTablaClib) {
      camposDisponiblesPartidas = await obtenerCamposDisponiblesEnTabla(db, tablaPartidasClib);
      detalleCamposPartidas = camposDisponiblesPartidas.length
        ? await obtenerMetadatosCamposLibres(db, tablaPartidasClib, camposDisponiblesPartidas)
        : {};
    }
  }

  const mapaCampos = new Map();
  if (camposDisponiblesPartidas.length && partidas.length && tablaPartidasClib) {
    const consultaCampos = `SELECT NUM_PART, ${camposDisponiblesPartidas.join(', ')} FROM ${tablaPartidasClib} WHERE TRIM(UPPER(CLAVE_DOC)) = ?`;
    const registros = await ejecutarConsulta(db, consultaCampos, [claveDocumento.toUpperCase()]);
    registros.forEach((registro) => {
      const numero = Number.parseInt(registro.NUM_PART, 10) || 0;
      const campos = {};
      camposDisponiblesPartidas.forEach((campo) => {
        campos[campo] = formatearTexto(registro[campo]);
      });
      mapaCampos.set(numero, campos);
    });
  }

  const partidasConCampos = partidas.map((partida) => ({
    ...partida,
    camposLibres: mapaCampos.get(partida.numero) || null
  }));

  return { partidas: partidasConCampos, camposDisponiblesPartidas, detalleCamposPartidas };
}

async function guardarCamposLibres(db, tablaClib, claveDocumento, campos, columnasDisponibles = []) {
  if (!columnasDisponibles.length) {
    return;
  }
  const consultaExistencia = `SELECT FIRST 1 CLAVE_DOC FROM ${tablaClib} WHERE TRIM(UPPER(CLAVE_DOC)) = ?`;
  const registros = await ejecutarConsulta(db, consultaExistencia, [claveDocumento.toUpperCase()]);
  const valores = columnasDisponibles.map((campo) => (Object.prototype.hasOwnProperty.call(campos, campo) ? campos[campo] : null));

  if (registros.length) {
    const asignaciones = columnasDisponibles.map((campo) => `${campo} = ?`).join(', ');
    const consultaActualizacion = `UPDATE ${tablaClib} SET ${asignaciones} WHERE TRIM(UPPER(CLAVE_DOC)) = ?`;
    await ejecutarConsulta(db, consultaActualizacion, [...valores, claveDocumento.toUpperCase()]);
    return;
  }

  const columnas = ['CLAVE_DOC', ...columnasDisponibles];
  const marcadores = columnas.map(() => '?').join(', ');
  const consultaInsercion = `INSERT INTO ${tablaClib} (${columnas.join(', ')}) VALUES (${marcadores})`;
  await ejecutarConsulta(db, consultaInsercion, [claveDocumento.toUpperCase(), ...valores]);
}

function normalizarCamposLibres(camposOrigen = {}, camposDisponibles = [], longitudes = new Map()) {
  const resultado = {};
  if (!camposDisponibles.length) {
    return resultado;
  }
  camposDisponibles.forEach((campo) => {
    const valor = camposOrigen && Object.prototype.hasOwnProperty.call(camposOrigen, campo) ? camposOrigen[campo] : '';
    const texto = valor === undefined || valor === null ? '' : String(valor).trim();
    const textoLimitado = limitarLongitudCampoLibre(texto, longitudes.get(campo));
    resultado[campo] = textoLimitado ? textoLimitado : null;
  });
  return resultado;
}

function normalizarPartidas(partidas, camposDisponibles = [], longitudes = new Map()) {
  if (!Array.isArray(partidas) || !camposDisponibles.length) {
    return [];
  }
  const mapa = new Map();
  partidas.forEach((partida) => {
    if (!partida || typeof partida !== 'object') {
      return;
    }
    const numero = Number.parseInt(partida.numero, 10);
    if (Number.isNaN(numero) || numero < 0) {
      return;
    }
    const camposOrigen = partida.campos && typeof partida.campos === 'object' ? partida.campos : {};
    const campos = normalizarCamposLibres(camposOrigen, camposDisponibles, longitudes);
    mapa.set(numero, { numero, campos });
  });
  return Array.from(mapa.values());
}

function limitarLongitudCampoLibre(texto, longitudMaxima) {
  if (!texto || !Number.isFinite(longitudMaxima) || longitudMaxima <= 0) {
    return texto;
  }
  return texto.length > longitudMaxima ? texto.slice(0, longitudMaxima) : texto;
}

function tieneInformacionEnCampos(campos, camposHabilitados = []) {
  if (!campos || typeof campos !== 'object') {
    return false;
  }
  return camposHabilitados.some((campo) => {
    const valor = campos[campo];
    // Considera que hay información si el valor existe y tiene contenido después de trim
    if (valor === null || valor === undefined) {
      return false;
    }
    const texto = String(valor).trim();
    return texto.length > 0;
  });
}

async function guardarCamposLibresPartidas(db, tablaPartidasClib, claveDocumento, partidas, columnasDisponibles = []) {
  if (!columnasDisponibles.length) {
    return;
  }
  const clave = claveDocumento.toUpperCase();
  await ejecutarConsulta(db, `DELETE FROM ${tablaPartidasClib} WHERE TRIM(UPPER(CLAVE_DOC)) = ?`, [clave]);
  if (!partidas.length) {
    return;
  }

  const partidasConDatos = partidas.filter((partida) => tieneInformacionEnCampos(partida.campos, columnasDisponibles));
  if (!partidasConDatos.length) {
    return;
  }

  const columnas = ['CLAVE_DOC', 'NUM_PART', ...columnasDisponibles];
  const marcadoresInsercion = columnas.map(() => '?').join(', ');
  const consultaInsercion = `INSERT INTO ${tablaPartidasClib} (${columnas.join(', ')}) VALUES (${marcadoresInsercion})`;

  for (const partida of partidasConDatos) {
    const valores = columnasDisponibles.map((campo) => partida.campos[campo]);
    await ejecutarConsulta(db, consultaInsercion, [clave, partida.numero, ...valores]);
  }
}

function crearMapaEtiquetas() {
  return { documento: {}, partidas: {} };
}

function limitarLongitudBusqueda(texto, longitudMaxima = LONGITUD_MAXIMA_BUSQUEDA_GENERAL) {
  if (!texto) {
    return '';
  }
  const cadena = texto.toString().trim();
  if (cadena.length <= longitudMaxima) {
    return cadena;
  }
  return cadena.slice(0, longitudMaxima);
}

function crearComparadorBusqueda(texto, longitudMaxima) {
  const cadena = limitarLongitudBusqueda(texto, longitudMaxima);
  if (!cadena) {
    return '';
  }
  return cadena.toUpperCase();
}

function normalizarIdentificadorTabla(valor) {
  if (!valor) {
    return '';
  }
  return valor.toString().trim().toUpperCase();
}

function normalizarIdentificadorCampoLibre(valor) {
  const clave = normalizarIdentificadorTabla(valor);
  if (!REGEX_CAMPO_LIBRE.test(clave)) {
    return '';
  }
  return clave;
}

function obtenerIdTablasParametrosDocumento(definicion, empresa) {
  if (!definicion) {
    return [];
  }
  const candidatos = new Set();
  agregarCandidatosIdTabla(candidatos, definicion.tablaClib, empresa);
  const extra = MAPA_IDTABLAS_DOCUMENTO[definicion.clave];
  if (extra) {
    extra.forEach((id) => agregarCandidatosIdTabla(candidatos, id, empresa));
  }
  return Array.from(candidatos);
}

function obtenerIdTablasParametrosPartidas(definicion, empresa) {
  if (!definicion) {
    return [];
  }
  const candidatos = new Set();
  agregarCandidatosIdTabla(candidatos, definicion.tablaPartidas, empresa);
  agregarCandidatosIdTabla(candidatos, definicion.tablaPartidasClib, empresa);
  if (definicion.tablaPartidas) {
    const tablaClib = `${definicion.tablaPartidas}_CLIB`;
    agregarCandidatosIdTabla(candidatos, tablaClib, empresa);
  }
  const genericos = MAPA_IDTABLAS_PARAM_PARTIDAS[definicion.clave];
  if (genericos) {
    genericos.forEach((id) => agregarCandidatosIdTabla(candidatos, id, empresa));
  }
  return Array.from(candidatos);
}

function agregarCandidatosIdTabla(conjunto, idTabla, empresa) {
  const normalizado = normalizarIdentificadorTabla(idTabla);
  if (!normalizado) {
    return;
  }
  conjunto.add(normalizado);
  if (empresa) {
    conjunto.add(`${normalizado}${empresa}`);
  }
}

function determinarOrigenIdTabla(idTabla) {
  const normalizado = normalizarIdentificadorTabla(idTabla);
  if (!normalizado) {
    return 'documento';
  }
  if (TODAS_IDTABLAS_PARTIDAS.has(normalizado) || normalizado.startsWith('PAR_')) {
    return 'partidas';
  }
  return 'documento';
}

async function obtenerTablaPartidasClib(db, definicion, empresa) {
  if (!definicion || !empresa) {
    return null;
  }
  const candidatos = new Set();
  const preferida = normalizarIdentificadorTabla(definicion.tablaPartidasClib);
  if (preferida) {
    candidatos.add(preferida);
  }
  const base = normalizarIdentificadorTabla(definicion.tablaPartidas);
  if (base) {
    candidatos.add(`${base}_CLIB`);
  }
  const adicionales = MAPA_IDTABLAS_PARAM_PARTIDAS[definicion.clave];
  if (adicionales) {
    adicionales.forEach((id) => {
      const normalizado = normalizarIdentificadorTabla(id);
      if (normalizado) {
        candidatos.add(normalizado);
      }
    });
  }

  for (const candidato of candidatos) {
    const nombreTabla = `${candidato}${empresa}`;
    const existe = await verificarTabla(db, nombreTabla);
    if (existe) {
      return nombreTabla;
    }
  }

  return null;
}

function crearSetIdTablasPartidas() {
  const conjunto = new Set();
  Object.values(TIPOS_DOCUMENTO).forEach((tipo) => {
    const base = normalizarIdentificadorTabla(tipo.tablaPartidas);
    if (base) {
      conjunto.add(base);
      conjunto.add(`${base}_CLIB`);
    }
    const tablaClib = normalizarIdentificadorTabla(tipo.tablaPartidasClib);
    if (tablaClib) {
      conjunto.add(tablaClib);
    }
  });
  Object.values(MAPA_IDTABLAS_PARAM_PARTIDAS).forEach((lista) => {
    lista.forEach((id) => {
      const normalizado = normalizarIdentificadorTabla(id);
      if (normalizado) {
        conjunto.add(normalizado);
      }
    });
  });
  return conjunto;
}

function obtenerRutaBaseDatos() {
  const rutaEntorno = process.env.FIREBIRD_DB_PATH;
  if (rutaEntorno && fs.existsSync(rutaEntorno)) {
    return rutaEntorno;
  }

  const baseAspel = 'C:\\Program Files (x86)\\Common Files\\Aspel\\Sistemas Aspel';
  const versionPorDefecto = 'SAE9.00';
  const segmentos = ['Empresa01', 'Datos', 'SAE90EMPRE01.FDB'];
  const rutaPorDefecto = path.win32.join(baseAspel, versionPorDefecto, ...segmentos);
  const versiones = obtenerVersionesDisponibles(baseAspel)
    .filter((version) => compararVersiones(version, versionPorDefecto) >= 0)
    .sort((a, b) => compararVersiones(b, a));

  for (const version of versiones) {
    const rutaPosible = path.win32.join(baseAspel, version, ...segmentos);
    if (fs.existsSync(rutaPosible)) {
      return rutaPosible;
    }
  }

  return rutaPorDefecto;
}

function obtenerVersionesDisponibles(directorioBase) {
  try {
    const elementos = fs.readdirSync(directorioBase, { withFileTypes: true });
    return elementos.filter((elemento) => elemento.isDirectory()).map((elemento) => elemento.name).filter((nombre) => /^SAE\d+\.\d+$/.test(nombre));
  } catch (error) {
    return [];
  }
}

function compararVersiones(versionA, versionB) {
  const valorA = extraerComponentesVersion(versionA);
  const valorB = extraerComponentesVersion(versionB);
  if (!valorA && !valorB) {
    return 0;
  }
  if (!valorA) {
    return -1;
  }
  if (!valorB) {
    return 1;
  }
  if (valorA.mayor !== valorB.mayor) {
    return valorA.mayor - valorB.mayor;
  }
  return valorA.menor - valorB.menor;
}

function extraerComponentesVersion(nombre) {
  const coincidencia = /^SAE(\d+)(?:\.(\d+))?$/i.exec(nombre);
  if (!coincidencia) {
    return null;
  }
  return { mayor: Number.parseInt(coincidencia[1], 10), menor: Number.parseInt(coincidencia[2] || '0', 10) };
}

function iniciarServidor(opciones = {}) {
  if (servidorHttp) {
    return Promise.resolve({ servidor: servidorHttp, puerto: puertoServidor });
  }

  const puertoSolicitado = Number.parseInt(opciones.puertoPreferido, 10);
  const puertoPreferido =
    Number.isInteger(puertoSolicitado) && puertoSolicitado >= 0 && puertoSolicitado <= 65535
      ? puertoSolicitado
      : PUERTO_PREFERIDO;

  const rutaIndex = obtenerRutaRecurso(path.join('public', 'index.html'));
  if (!fs.existsSync(rutaIndex)) {
    return Promise.reject(
      new Error(
        `No se encontró el recurso requerido: public/index.html (${rutaIndex}). La instalación podría estar incompleta.`
      )
    );
  }

  function escucharEnPuerto(puerto) {
    return new Promise((resolve, reject) => {
      const servidor = aplicacion.listen(puerto, '127.0.0.1', () => {
        servidorHttp = servidor;
        puertoServidor = servidor.address().port;
        console.log(`Servidor iniciado en http://localhost:${puertoServidor}`);
        resolve({ servidor: servidorHttp, puerto: puertoServidor });
      });
      servidor.on('error', (error) => {
        reject(error);
      });
    });
  }

  return escucharEnPuerto(puertoPreferido).catch((error) => {
    if (error && error.code === 'EADDRINUSE' && puertoPreferido !== 0) {
      console.warn(
        `[Servidor] Puerto ${puertoPreferido} en uso. Se seleccionará un puerto libre automáticamente.`
      );
      return escucharEnPuerto(0);
    }
    throw error;
  });
}

function detenerServidor() {
  if (!servidorHttp) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    servidorHttp.close((error) => {
      if (error) {
        reject(error);
      } else {
        servidorHttp = null;
        resolve();
      }
    });
  });
}

if (require.main === module) {
  iniciarServidor().catch((error) => {
    console.error('No fue posible iniciar el servidor web.', error);
    process.exit(1);
  });
}

module.exports = { iniciarServidor, detenerServidor };
