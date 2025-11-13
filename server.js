const express = require('express');
const path = require('path');
const fs = require('fs');
const firebird = require('node-firebird');

const TIPOS_DOCUMENTO = {
  F: { clave: 'F', descripcion: 'Factura', tabla: 'FACTF', tablaClib: 'FACTF_CLIB', tablaPartidas: 'PAR_FACTF' },
  P: { clave: 'P', descripcion: 'Pedido', tabla: 'FACTP', tablaClib: 'FACTP_CLIB', tablaPartidas: 'PAR_FACTP' },
  C: { clave: 'C', descripcion: 'Cotización', tabla: 'FACTC', tablaClib: 'FACTC_CLIB', tablaPartidas: 'PAR_FACTC' },
  R: { clave: 'R', descripcion: 'Remisión', tabla: 'FACTR', tablaClib: 'FACTR_CLIB', tablaPartidas: 'PAR_FACTR' },
  D: { clave: 'D', descripcion: 'Devolución', tabla: 'FACTD', tablaClib: 'FACTD_CLIB', tablaPartidas: 'PAR_FACTD' },
  V: { clave: 'V', descripcion: 'Nota de venta', tabla: 'FACTV', tablaClib: 'FACTV_CLIB', tablaPartidas: 'PAR_FACTV' },
  A: { clave: 'A', descripcion: 'Parcialidad / cobro', tabla: 'FACTA', tablaClib: 'FACTA_CLIB', tablaPartidas: 'PAR_FACTA' },
  E: { clave: 'E', descripcion: 'Nota de crédito', tabla: 'FACTE', tablaClib: 'FACTE_CLIB', tablaPartidas: 'PAR_FACTE' },
  G: { clave: 'G', descripcion: 'Comprobante de pago', tabla: 'FACTG', tablaClib: 'FACTG_CLIB', tablaPartidas: 'PAR_FACTG' }
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
  G: ['FACTG_CLIB']
};

const MAPA_IDTABLAS_PARTIDAS = {
  F: ['PAR_FACT_CLIB', 'PAR_FACTF_CLIB', 'PAR_FACF_CLIB'],
  P: ['PAR_FACTP_CLIB', 'PAR_FACP_CLIB'],
  C: ['PAR_FACTC_CLIB', 'PAR_FACC_CLIB'],
  R: ['PAR_FACTR_CLIB', 'PAR_FACR_CLIB'],
  D: ['PAR_FACTD_CLIB', 'PAR_FACD_CLIB'],
  V: ['PAR_FACTV_CLIB', 'PAR_FACV_CLIB'],
  A: ['PAR_FACTA_CLIB', 'PAR_FACA_CLIB'],
  E: ['PAR_FACTE_CLIB', 'PAR_FACE_CLIB'],
  G: ['PAR_FACTG_CLIB', 'PAR_FACG_CLIB']
};

const TODAS_IDTABLAS_PARTIDAS = crearSetIdTablasPartidas();

const CAMPOS_LIBRES = Array.from({ length: 11 }, (_, indice) => `CAMPLIB${indice + 1}`);
const CONDICION_DOCUMENTO_VIGENTE = "COALESCE(STATUS, '') <> 'C'";
const PUERTO_SERVIDOR = Number(process.env.PORT || 3001);
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
let servidorHttp = null;

aplicacion.disable('x-powered-by');
aplicacion.use(express.json({ limit: '1mb' }));
aplicacion.use(express.static(path.join(__dirname, 'public')));

aplicacion.get('/api/tipos-documento', (req, res) => {
  res.json({
    ok: true,
    tipos: Object.values(TIPOS_DOCUMENTO).map((tipo) => ({ clave: tipo.clave, descripcion: tipo.descripcion }))
  });
});

aplicacion.get('/api/documentos/buscar', asyncHandler(async (req, res) => {
  const definicion = obtenerDefinicionTipo(req.query.tipo);
  const empresa = normalizarEmpresa(req.query.empresa);
  const termino = limitarLongitudBusqueda(formatearTexto(req.query.termino || ''));
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
      const comparador = `%${termino.toUpperCase()}%`;
      condiciones.push('(UPPER(CVE_DOC) LIKE ? OR UPPER(CVE_CLPV) LIKE ? )');
      parametros.push(comparador, comparador);
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
    const tablaPartidasClib = `${definicion.tablaPartidas}_CLIB${empresa}`;
    const tablaParametros = `PARAM_CAMPOSLIBRES${empresa}`;

    const existeDocumentos = await verificarTabla(db, tablaDocumentos);
    const existeClib = await verificarTabla(db, tablaClib);
    if (!existeDocumentos || !existeClib) {
      throw new AplicacionError('No se encontraron las tablas necesarias en la base de datos.', 404);
    }

    const documento = await obtenerDocumento(db, tablaDocumentos, claveDocumento);
    if (!documento) {
      throw new AplicacionError(`No existe el documento ${claveDocumento} en la empresa ${empresa}.`, 404);
    }

    const camposLibres = await obtenerCamposLibres(db, tablaClib, claveDocumento);
    const etiquetas = await obtenerEtiquetasCampos(db, tablaParametros, definicion, empresa);
    const { partidas, camposDisponiblesPartidas } = await obtenerPartidas(db, tablaPartidas, tablaPartidasClib, claveDocumento);

    return { documento, camposLibres, etiquetas, partidas, camposPartidasDisponibles: camposDisponiblesPartidas };
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

  const camposNormalizados = {};
  CAMPOS_LIBRES.forEach((campo) => {
    const valor = camposRecibidos[campo];
    camposNormalizados[campo] = valor === undefined || valor === null ? null : String(valor).trim();
  });

  const partidasNormalizadas = normalizarPartidas(partidasRecibidas);

  await conConexion(async (db) => {
    const tablaDocumentos = `${definicion.tabla}${empresa}`;
    const tablaClib = `${definicion.tablaClib}${empresa}`;
    const tablaPartidasClib = `${definicion.tablaPartidas}_CLIB${empresa}`;

    const existeDocumentos = await verificarTabla(db, tablaDocumentos);
    const existeClib = await verificarTabla(db, tablaClib);
    if (!existeDocumentos || !existeClib) {
      throw new AplicacionError('No se encontraron las tablas necesarias en la base de datos.', 404);
    }

    const documento = await obtenerDocumento(db, tablaDocumentos, claveDocumento);
    if (!documento) {
      throw new AplicacionError(`No existe el documento ${claveDocumento} en la empresa ${empresa}.`, 404);
    }

    await guardarCamposLibres(db, tablaClib, claveDocumento, camposNormalizados);

    if (partidasNormalizadas.length) {
      const existePartidasClib = await verificarTabla(db, tablaPartidasClib);
      if (!existePartidasClib) {
        throw new AplicacionError('No existen campos libres configurados para las partidas en esta empresa.', 404);
      }
      await guardarCamposLibresPartidas(db, tablaPartidasClib, claveDocumento, partidasNormalizadas);
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
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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

async function obtenerCamposLibres(db, tablaClib, claveDocumento) {
  const consulta = `SELECT ${CAMPOS_LIBRES.join(', ')} FROM ${tablaClib} WHERE TRIM(UPPER(CLAVE_DOC)) = ?`;
  const registros = await ejecutarConsulta(db, consulta, [claveDocumento.toUpperCase()]);
  const resultado = {};
  CAMPOS_LIBRES.forEach((campo) => {
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
    if (!CAMPOS_LIBRES.includes(campo)) {
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

  const camposDisponiblesPartidas = await verificarTabla(db, tablaPartidasClib);
  const mapaCampos = new Map();
  if (camposDisponiblesPartidas && partidas.length) {
    const consultaCampos = `SELECT NUM_PART, ${CAMPOS_LIBRES.join(', ')} FROM ${tablaPartidasClib} WHERE TRIM(UPPER(CLAVE_DOC)) = ?`;
    const registros = await ejecutarConsulta(db, consultaCampos, [claveDocumento.toUpperCase()]);
    registros.forEach((registro) => {
      const numero = Number.parseInt(registro.NUM_PART, 10) || 0;
      const campos = {};
      CAMPOS_LIBRES.forEach((campo) => {
        campos[campo] = formatearTexto(registro[campo]);
      });
      mapaCampos.set(numero, campos);
    });
  }

  const partidasConCampos = partidas.map((partida) => ({
    ...partida,
    camposLibres: mapaCampos.get(partida.numero) || null
  }));

  return { partidas: partidasConCampos, camposDisponiblesPartidas };
}

async function guardarCamposLibres(db, tablaClib, claveDocumento, campos) {
  const consultaExistencia = `SELECT FIRST 1 CLAVE_DOC FROM ${tablaClib} WHERE TRIM(UPPER(CLAVE_DOC)) = ?`;
  const registros = await ejecutarConsulta(db, consultaExistencia, [claveDocumento.toUpperCase()]);
  const valores = CAMPOS_LIBRES.map((campo) => campos[campo]);

  if (registros.length) {
    const asignaciones = CAMPOS_LIBRES.map((campo) => `${campo} = ?`).join(', ');
    const consultaActualizacion = `UPDATE ${tablaClib} SET ${asignaciones} WHERE TRIM(UPPER(CLAVE_DOC)) = ?`;
    await ejecutarConsulta(db, consultaActualizacion, [...valores, claveDocumento.toUpperCase()]);
    return;
  }

  const columnas = ['CLAVE_DOC', ...CAMPOS_LIBRES];
  const marcadores = columnas.map(() => '?').join(', ');
  const consultaInsercion = `INSERT INTO ${tablaClib} (${columnas.join(', ')}) VALUES (${marcadores})`;
  await ejecutarConsulta(db, consultaInsercion, [claveDocumento.toUpperCase(), ...valores]);
}

function normalizarPartidas(partidas) {
  if (!Array.isArray(partidas)) {
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
    const campos = {};
    CAMPOS_LIBRES.forEach((campo) => {
      const valor = camposOrigen[campo];
      campos[campo] = valor === undefined || valor === null ? null : String(valor).trim();
    });
    mapa.set(numero, { numero, campos });
  });
  return Array.from(mapa.values());
}

async function guardarCamposLibresPartidas(db, tablaPartidasClib, claveDocumento, partidas) {
  if (!partidas.length) {
    return;
  }
  const consultaExistentes = `SELECT NUM_PART FROM ${tablaPartidasClib} WHERE TRIM(UPPER(CLAVE_DOC)) = ?`;
  const registros = await ejecutarConsulta(db, consultaExistentes, [claveDocumento.toUpperCase()]);
  const existentes = new Set(
    registros
      .map((registro) => Number.parseInt(registro.NUM_PART, 10))
      .filter((numero) => !Number.isNaN(numero))
  );

  const columnas = ['CLAVE_DOC', 'NUM_PART', ...CAMPOS_LIBRES];
  const marcadoresInsercion = columnas.map(() => '?').join(', ');
  const asignaciones = CAMPOS_LIBRES.map((campo) => `${campo} = ?`).join(', ');

  for (const partida of partidas) {
    const valores = CAMPOS_LIBRES.map((campo) => partida.campos[campo]);
    if (existentes.has(partida.numero)) {
      const consultaActualizacion = `UPDATE ${tablaPartidasClib} SET ${asignaciones} WHERE TRIM(UPPER(CLAVE_DOC)) = ? AND NUM_PART = ?`;
      await ejecutarConsulta(db, consultaActualizacion, [...valores, claveDocumento.toUpperCase(), partida.numero]);
      continue;
    }
    const consultaInsercion = `INSERT INTO ${tablaPartidasClib} (${columnas.join(', ')}) VALUES (${marcadoresInsercion})`;
    await ejecutarConsulta(db, consultaInsercion, [claveDocumento.toUpperCase(), partida.numero, ...valores]);
  }
}

function crearMapaEtiquetas() {
  return { documento: {}, partidas: {} };
}

function limitarLongitudBusqueda(texto) {
  if (!texto) {
    return '';
  }
  const cadena = texto.toString().trim();
  if (cadena.length <= 30) {
    return cadena;
  }
  return cadena.slice(0, 30);
}

function normalizarIdentificadorTabla(valor) {
  if (!valor) {
    return '';
  }
  return valor.toString().trim().toUpperCase();
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
  const tablaClib = `${definicion.tablaPartidas}_CLIB`;
  agregarCandidatosIdTabla(candidatos, tablaClib, empresa);
  const genericos = MAPA_IDTABLAS_PARTIDAS[definicion.clave];
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

function crearSetIdTablasPartidas() {
  const conjunto = new Set();
  Object.values(TIPOS_DOCUMENTO).forEach((tipo) => {
    const base = normalizarIdentificadorTabla(tipo.tablaPartidas);
    if (base) {
      conjunto.add(base);
      conjunto.add(`${base}_CLIB`);
    }
  });
  Object.values(MAPA_IDTABLAS_PARTIDAS).forEach((lista) => {
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

function iniciarServidor() {
  if (servidorHttp) {
    return Promise.resolve(servidorHttp);
  }
  return new Promise((resolve, reject) => {
    const servidor = aplicacion.listen(PUERTO_SERVIDOR, '127.0.0.1', () => {
      servidorHttp = servidor;
      console.log(`Servidor iniciado en http://localhost:${PUERTO_SERVIDOR}`);
      resolve(servidorHttp);
    });
    servidor.on('error', (error) => {
      reject(error);
    });
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

module.exports = { iniciarServidor, detenerServidor, PUERTO_SERVIDOR };
