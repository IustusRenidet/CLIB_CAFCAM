const elementos = {
  app: document.getElementById('app'),
  formularioBusqueda: document.getElementById('formulario-busqueda'),
  formularioCampos: document.getElementById('formulario-campos'),
  empresa: document.getElementById('empresa'),
  empresaActivaEncabezado: document.getElementById('empresa-activa-encabezado'),
  tipoDocumento: document.getElementById('tipo-documento'),
  termino: document.getElementById('termino'),
  tablaResultados: document.getElementById('resultados'),
  mensajeSinResultados: document.getElementById('sin-resultados'),
  descripcionDocumento: document.getElementById('descripcion-documento'),
  resumenDocumento: document.getElementById('resumen-documento'),
  detalleClave: document.getElementById('detalle-clave'),
  detalleCliente: document.getElementById('detalle-cliente'),
  detalleFecha: document.getElementById('detalle-fecha'),
  contenedorCampos: document.getElementById('contenedor-campos'),
  mensajeCamposDocumento: document.getElementById('sin-campos-documento'),
  estadoGuardado: document.getElementById('estado-guardado'),
  tablaPartidas: document.getElementById('partidas'),
  mensajeSinPartidas: document.getElementById('sin-partidas'),
  camposPartidas: document.getElementById('campos-partidas'),
  listaCamposPartidas: document.getElementById('lista-campos-partidas'),
  mensajeCamposPartidas: document.getElementById('sin-campos-partidas'),
  botonGuardar: document.querySelector('#formulario-campos button[type="submit"]'),
  panelDetalle: document.getElementById('panel-detalle'),
  tabDetalle: document.querySelector('[data-tab-target="detalle"]'),
  botonVolver: document.getElementById('boton-volver'),
  toastContainer: document.getElementById('toast-container'),
  modalConfirmacion: document.getElementById('modal-confirmacion'),
  modalConfirmacionMensaje: document.getElementById('modal-confirmacion-mensaje'),
  modalConfirmacionAceptar: document.querySelector('[data-modal-aceptar]'),
  modalConfirmacionCancelar: document.querySelector('[data-modal-cancelar]')
};

const REGEX_CAMPO_LIBRE = /^CAMPLIB\d+$/i;
const REGEX_FECHA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const REGEX_HORA_ISO = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;
const REGEX_FECHA_HORA_ISO = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;
const EMPRESA_POR_DEFECTO = '02';
const EMPRESAS_PREDETERMINADAS = [
  { clave: EMPRESA_POR_DEFECTO, nombre: 'CAFCAM' }
];
const MENSAJE_CAMBIOS_PENDIENTES = 'Tienes cambios sin guardar. Si continúas, no se aplicarán.';

const plantillas = {
  resultado: document.getElementById('fila-resultado'),
  partida: document.getElementById('fila-partida')
};

let documentoSeleccionado = null;
let etiquetasCampos = crearEstructuraEtiquetas();
let cambiosPendientes = false;
let temporizadorGuardado = null;
let temporizadorBusqueda = null;
let camposDocumentoDisponibles = [];
let camposPartidasDisponibles = [];
let metadatosCamposDocumento = {};
let metadatosCamposPartidas = {};
let resolverModalConfirmacion = null;
let ultimoElementoEnfoque = null;
let temporizadorOcultarModal = null;
let promesaModalActiva = null;
let guardadoEnCurso = false;
const TEXTO_BOTON_GUARDAR = elementos.botonGuardar ? elementos.botonGuardar.textContent : 'Guardar cambios';

async function cargarTiposDocumento() {
  const respuesta = await fetch('/api/tipos-documento');
  const datos = await respuesta.json();
  if (!datos.ok) {
    throw new Error(datos.mensaje || 'No fue posible cargar los tipos de documento.');
  }

  elementos.tipoDocumento.innerHTML = '';
  datos.tipos.forEach((tipo) => {
    const opcion = document.createElement('option');
    opcion.value = tipo.clave;
    opcion.textContent = `${tipo.clave} · ${tipo.descripcion}`;
    elementos.tipoDocumento.appendChild(opcion);
  });
}

async function cargarEmpresas() {
  if (!elementos.empresa) {
    return;
  }
  try {
    const respuesta = await fetch('/api/empresas');
    const datos = await respuesta.json();
    if (!datos.ok) {
      throw new Error(datos.mensaje || 'No fue posible cargar las empresas.');
    }
    poblarEmpresas(datos.empresas, datos.empresaPorDefecto);
  } catch (error) {
    poblarEmpresas(EMPRESAS_PREDETERMINADAS, EMPRESA_POR_DEFECTO);
  }
}

function poblarEmpresas(empresas = [], empresaPorDefecto = EMPRESA_POR_DEFECTO) {
  if (!elementos.empresa) {
    return;
  }
  const empresasNormalizadas = normalizarListaEmpresas(empresas);
  const fuenteFiltrada = empresasNormalizadas.filter((empresa) => empresa.clave === EMPRESA_POR_DEFECTO);
  const fuente = fuenteFiltrada.length ? fuenteFiltrada : EMPRESAS_PREDETERMINADAS;
  const claveDefecto = normalizarClaveEmpresa(empresaPorDefecto) || fuente[0].clave;

  elementos.empresa.innerHTML = '';
  fuente.forEach((empresa) => {
    const opcion = document.createElement('option');
    opcion.value = empresa.clave;
    opcion.textContent = empresa.nombre;
    elementos.empresa.appendChild(opcion);
  });
  elementos.empresa.value = fuente.some((empresa) => empresa.clave === claveDefecto) ? claveDefecto : fuente[0].clave;
  elementos.empresa.disabled = true;
  actualizarEmpresaActivaEncabezado();
}

function normalizarListaEmpresas(lista = []) {
  if (!Array.isArray(lista)) {
    return [];
  }
  const empresas = [];
  const claves = new Set();
  lista.forEach((empresa) => {
    const clave = normalizarClaveEmpresa(empresa && empresa.clave);
    if (!clave || claves.has(clave)) {
      return;
    }
    const nombre =
      empresa && empresa.nombre ? empresa.nombre.toString().trim() : `Empresa ${Number.parseInt(clave, 10) || 0}`;
    empresas.push({ clave, nombre: nombre || `Empresa ${Number.parseInt(clave, 10) || 0}` });
    claves.add(clave);
  });
  return empresas;
}

function normalizarClaveEmpresa(valor) {
  const numero = Number.parseInt(valor, 10);
  if (Number.isNaN(numero) || numero < 1) {
    return '';
  }
  return numero.toString().padStart(2, '0');
}

function obtenerEmpresaSeleccionada() {
  return EMPRESA_POR_DEFECTO;
}

function obtenerNombreEmpresaSeleccionada() {
  if (!elementos.empresa) {
    return '';
  }
  const opcion = elementos.empresa.options[elementos.empresa.selectedIndex];
  if (!opcion) {
    return '';
  }
  return opcion.textContent ? opcion.textContent.toString().trim() : '';
}

function actualizarEmpresaActivaEncabezado() {
  if (!elementos.empresaActivaEncabezado) {
    return;
  }
  const claveEmpresa = obtenerEmpresaSeleccionada();
  if (elementos.app) {
    elementos.app.classList.toggle('app--tema-llantas', claveEmpresa === '02');
  }
  const nombre = obtenerNombreEmpresaSeleccionada() || 'Empresa no definida';
  elementos.empresaActivaEncabezado.textContent = `${nombre}`;
}

async function buscarDocumentos() {
  if (!elementos.tipoDocumento) {
    return;
  }
  const puedeContinuar = await confirmarSalidaDeCambios();
  if (!puedeContinuar) {
    return;
  }
  cambiosPendientes = false;
  limpiarResultados();
  documentoSeleccionado = null;
  ocultarFormularioCampos();
  desactivarVistaDetalle();

  const tipo = elementos.tipoDocumento.value;
  if (!tipo) {
    return;
  }

  const parametros = new URLSearchParams({
    tipo,
    empresa: obtenerEmpresaSeleccionada(),
    termino: elementos.termino ? elementos.termino.value : ''
  });

  try {
    const respuesta = await fetch(`/api/documentos/buscar?${parametros.toString()}`);
    const datos = await respuesta.json();

    if (!datos.ok) {
      throw new Error(datos.mensaje || 'No fue posible completar la búsqueda.');
    }

    if (!datos.resultados.length) {
      elementos.mensajeSinResultados.hidden = false;
      return;
    }

    elementos.mensajeSinResultados.hidden = true;
    datos.resultados.forEach((registro) => {
      const fila = plantillas.resultado.content.cloneNode(true);
      fila.querySelector('[data-columna="clave"]').textContent = registro.cveDoc;
      fila.querySelector('[data-columna="cliente"]').textContent = registro.cliente || '—';
      fila.querySelector('[data-columna="fecha"]').textContent = formatearFechaLocal(registro.fechaDoc);
      const boton = fila.querySelector('button');
      boton.addEventListener('click', () => seleccionarDocumento(registro));
      elementos.tablaResultados.appendChild(fila);
    });
  } catch (error) {
    mostrarMensaje(error.message);
  }
}

function limpiarResultados() {
  elementos.tablaResultados.innerHTML = '';
  elementos.mensajeSinResultados.hidden = true;
}

function programarBusqueda() {
  clearTimeout(temporizadorBusqueda);
  temporizadorBusqueda = setTimeout(() => {
    buscarDocumentos();
  }, 350);
}

async function seleccionarDocumento(registro) {
  if (!registro) {
    return;
  }
  const puedeContinuar = await confirmarSalidaDeCambios();
  if (!puedeContinuar) {
    return;
  }
  await cargarDocumento(registro);
}

async function cargarDocumento(registro, opciones = {}) {
  const propagarError = opciones && opciones.propagarError === true;
  try {
    const empresaDocumento = normalizarClaveEmpresa(registro.empresa) || obtenerEmpresaSeleccionada();
    const url = `/api/documentos/${registro.tipo}/${empresaDocumento}/${encodeURIComponent(registro.cveDoc)}`;
    const respuesta = await fetch(url);
    const datos = await respuesta.json();

    if (!datos.ok) {
      throw new Error(datos.mensaje || 'No fue posible obtener el documento.');
    }

    documentoSeleccionado = {
      tipo: registro.tipo,
      empresa: empresaDocumento,
      cveDoc: registro.cveDoc
    };

    etiquetasCampos = crearEstructuraEtiquetas(datos.etiquetas);
    camposDocumentoDisponibles = obtenerCamposDocumentoDisponibles(datos);
    camposPartidasDisponibles = obtenerCamposPartidasDisponibles(datos);
    metadatosCamposDocumento = normalizarMetadatosCampos(datos.detalleCamposDocumento);
    metadatosCamposPartidas = normalizarMetadatosCampos(datos.detalleCamposPartidas);
    elementos.descripcionDocumento.textContent = `${datos.documento.descripcion}.`;
    elementos.resumenDocumento.hidden = false;
    elementos.detalleClave.textContent = datos.documento.cveDoc;
    elementos.detalleCliente.textContent = datos.documento.cliente || 'Sin cliente';
    elementos.detalleFecha.textContent = formatearFechaLocal(datos.documento.fechaDoc) || 'Sin fecha';

    pintarCamposLibres(datos.camposLibres || {});
    pintarPartidas(datos.partidas || []);
    activarVistaDetalle();
  } catch (error) {
    mostrarMensaje(error.message);
    if (propagarError) {
      throw error;
    }
  }
}

function pintarCamposLibres(campos = {}) {
  elementos.formularioCampos.hidden = false;
  elementos.contenedorCampos.innerHTML = '';
  cambiosPendientes = false;
  actualizarEstadoGuardado('');

  if (elementos.mensajeCamposDocumento) {
    elementos.mensajeCamposDocumento.hidden = true;
  }

  if (!camposDocumentoDisponibles.length) {
    if (elementos.mensajeCamposDocumento) {
      elementos.mensajeCamposDocumento.hidden = false;
    }
    return;
  }

  const lista = document.createElement('div');
  lista.className = 'campos-libres__lista';

  camposDocumentoDisponibles.forEach((clave, indice) => {
    const etiqueta = obtenerEtiquetaCampo(clave, indice + 1);
    const infoCampo = obtenerMetadatosCampoDocumento(clave);
    const campo = document.createElement('label');
    campo.className = 'campo-libre';

    const encabezado = crearEncabezadoCampoLibre(etiqueta, infoCampo);
    campo.appendChild(encabezado);

    const entrada = document.createElement('input');
    entrada.dataset.claveCampo = clave;
    configurarInputCampoLibre(entrada, infoCampo, campos[clave] || '');
    aplicarMetadatosAlInput(entrada, infoCampo);
    entrada.addEventListener('input', marcarCambiosPendientes);
    campo.appendChild(entrada);

    lista.appendChild(campo);
  });

  elementos.contenedorCampos.appendChild(lista);
}

function pintarPartidas(partidas = []) {
  elementos.tablaPartidas.innerHTML = '';
  elementos.mensajeSinPartidas.hidden = partidas.length > 0;

  partidas.forEach((partida) => {
    const fila = plantillas.partida.content.cloneNode(true);
    fila.querySelector('[data-columna="partida"]').textContent = partida.numero;
    fila.querySelector('[data-columna="articulo"]').textContent = partida.articulo;
    fila.querySelector('[data-columna="unidad"]').textContent = partida.unidad || '—';
    fila.querySelector('[data-columna="cantidad"]').textContent = formatoCantidad(partida.cantidad);
    fila.querySelector('[data-columna="precio"]').textContent = formatoDinero(partida.precio);
    fila.querySelector('[data-columna="total"]').textContent = formatoDinero(partida.total);
    elementos.tablaPartidas.appendChild(fila);
  });

  pintarCamposLibresPartidas(partidas);
}

function pintarCamposLibresPartidas(partidas = []) {
  if (!elementos.camposPartidas || !elementos.listaCamposPartidas || !elementos.mensajeCamposPartidas) {
    return;
  }

  elementos.listaCamposPartidas.innerHTML = '';
  elementos.listaCamposPartidas.hidden = false;

  if (!partidas.length) {
    elementos.camposPartidas.hidden = true;
    elementos.listaCamposPartidas.hidden = true;
    elementos.mensajeCamposPartidas.hidden = true;
    return;
  }

  if (!camposPartidasDisponibles.length) {
    elementos.camposPartidas.hidden = false;
    elementos.listaCamposPartidas.hidden = true;
    elementos.mensajeCamposPartidas.textContent = 'No hay campos libres configurados para las partidas.';
    elementos.mensajeCamposPartidas.hidden = false;
    return;
  }

  const fragmento = document.createDocumentFragment();
  let contadorSecciones = 0;
  partidas.forEach((partida) => {
    contadorSecciones += 1;
    const contenedor = document.createElement('section');
    contenedor.className = 'partida-campos partida-campos--colapsada';
    contenedor.dataset.numeroPartida = partida.numero;

    const lista = document.createElement('div');
    lista.className = 'partida-campos__campos';
    lista.hidden = true;
    const idLista = `campos-partida-${contadorSecciones}`;
    lista.id = idLista;

    const encabezado = crearEncabezadoPartida(contenedor, partida, idLista);
    camposPartidasDisponibles.forEach((clave, indice) => {
      const etiqueta = obtenerEtiquetaCampoPartida(clave, indice + 1);
      const infoCampo = obtenerMetadatosCampoPartida(clave);
      const campo = document.createElement('label');
      campo.className = 'campo-libre campo-libre--partida';

      const encabezadoCampo = crearEncabezadoCampoLibre(etiqueta, infoCampo);
      campo.appendChild(encabezadoCampo);

      const input = document.createElement('input');
      input.dataset.claveCampo = clave;
      input.dataset.numeroPartida = partida.numero;
      configurarInputCampoLibre(input, infoCampo, partida.camposLibres && partida.camposLibres[clave] ? partida.camposLibres[clave] : '');
      aplicarMetadatosAlInput(input, infoCampo);
      input.addEventListener('input', marcarCambiosPendientes);
      campo.appendChild(input);

      lista.appendChild(campo);
    });

    contenedor.appendChild(encabezado);
    contenedor.appendChild(lista);
    fragmento.appendChild(contenedor);
  });

  elementos.listaCamposPartidas.appendChild(fragmento);
  elementos.camposPartidas.hidden = false;
  elementos.listaCamposPartidas.hidden = false;
  elementos.mensajeCamposPartidas.hidden = true;
}

function crearEncabezadoPartida(contenedor, partida, idLista) {
  const encabezado = document.createElement('button');
  encabezado.type = 'button';
  encabezado.className = 'partida-campos__encabezado';
  encabezado.setAttribute('aria-expanded', 'false');
  if (idLista) {
    encabezado.setAttribute('aria-controls', idLista);
  }
  const articulo = partida.articulo || 'Sin artículo';
  const titulo = document.createElement('span');
  titulo.className = 'partida-campos__titulo';
  titulo.textContent = `Partida ${partida.numero} · ${articulo}`;
  const icono = document.createElement('span');
  icono.className = 'partida-campos__icono';
  icono.setAttribute('aria-hidden', 'true');
  icono.textContent = '›';
  encabezado.appendChild(titulo);
  encabezado.appendChild(icono);
  encabezado.addEventListener('click', () => alternarPartidaCampos(contenedor, encabezado));
  return encabezado;
}

function alternarPartidaCampos(contenedor, encabezado) {
  if (!contenedor) {
    return;
  }
  const lista = contenedor.querySelector('.partida-campos__campos');
  if (!lista) {
    return;
  }
  const estaColapsada = contenedor.classList.contains('partida-campos--colapsada');
  if (estaColapsada) {
    contenedor.classList.remove('partida-campos--colapsada');
    contenedor.classList.add('partida-campos--expandida');
  } else {
    contenedor.classList.add('partida-campos--colapsada');
    contenedor.classList.remove('partida-campos--expandida');
  }
  const expandida = contenedor.classList.contains('partida-campos--expandida');
  lista.hidden = !expandida;
  if (encabezado) {
    encabezado.setAttribute('aria-expanded', expandida ? 'true' : 'false');
  }
}

function marcarCambiosPendientes() {
  cambiosPendientes = true;
  actualizarEstadoGuardado('Cambios sin guardar');
}

function activarVistaDetalle() {
  habilitarTabDetalle(true);
  seleccionarTab('detalle');
  if (elementos.app) {
    elementos.app.classList.add('app--detalle-activo');
  }
  if (elementos.panelDetalle) {
    elementos.panelDetalle.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function desactivarVistaDetalle() {
  seleccionarTab('busqueda');
  habilitarTabDetalle(false);
  if (elementos.app) {
    elementos.app.classList.remove('app--detalle-activo');
  }
}

function seleccionarTab(nombre) {
  document.querySelectorAll('[data-tab-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.tabPanel !== nombre;
  });
  document.querySelectorAll('[data-tab-target]').forEach((boton) => {
    const activo = boton.dataset.tabTarget === nombre;
    boton.classList.toggle('tabs__tab--activo', activo);
    boton.setAttribute('aria-selected', activo ? 'true' : 'false');
  });
}

function habilitarTabDetalle(activo) {
  if (!elementos.tabDetalle) {
    return;
  }
  elementos.tabDetalle.disabled = !activo;
  elementos.tabDetalle.setAttribute('aria-disabled', activo ? 'false' : 'true');
}

function manejarCambioTab(destino) {
  if (destino === 'busqueda') {
    volverAPanelBusqueda();
    return;
  }
  if (destino === 'detalle') {
    if (!documentoSeleccionado || (elementos.tabDetalle && elementos.tabDetalle.disabled)) {
      return;
    }
    seleccionarTab('detalle');
  }
}

function inicializarTabs() {
  document.querySelectorAll('[data-tab-target]').forEach((boton) => {
    boton.addEventListener('click', (evento) => {
      const destino = evento.currentTarget.dataset.tabTarget;
      manejarCambioTab(destino);
    });
  });
  seleccionarTab('busqueda');
  habilitarTabDetalle(false);
}

async function volverAPanelBusqueda() {
  const puedeContinuar = await confirmarSalidaDeCambios();
  if (!puedeContinuar) {
    return;
  }
  documentoSeleccionado = null;
  cambiosPendientes = false;
  actualizarEstadoGuardado('');
  ocultarFormularioCampos();
  desactivarVistaDetalle();
}

async function confirmarSalidaDeCambios() {
  if (!cambiosPendientes) {
    return true;
  }
  if (!elementos.modalConfirmacion) {
    return window.confirm(MENSAJE_CAMBIOS_PENDIENTES);
  }
  return abrirModalConfirmacion(MENSAJE_CAMBIOS_PENDIENTES);
}

function abrirModalConfirmacion(mensaje) {
  if (!elementos.modalConfirmacion) {
    return Promise.resolve(true);
  }
  clearTimeout(temporizadorOcultarModal);
  if (elementos.modalConfirmacionMensaje) {
    elementos.modalConfirmacionMensaje.textContent = mensaje;
  }
  elementos.modalConfirmacion.hidden = false;
  requestAnimationFrame(() => {
    elementos.modalConfirmacion.classList.add('modal--visible');
  });
  ultimoElementoEnfoque = document.activeElement;
  if (elementos.modalConfirmacionAceptar) {
    elementos.modalConfirmacionAceptar.focus();
  }
  if (promesaModalActiva) {
    return promesaModalActiva;
  }
  promesaModalActiva = new Promise((resolve) => {
    resolverModalConfirmacion = (decision) => {
      resolve(decision);
      resolverModalConfirmacion = null;
      promesaModalActiva = null;
    };
  });
  return promesaModalActiva;
}

function cerrarModalConfirmacion(decision) {
  if (!elementos.modalConfirmacion) {
    if (typeof resolverModalConfirmacion === 'function') {
      resolverModalConfirmacion(decision);
      resolverModalConfirmacion = null;
    }
    return;
  }
  elementos.modalConfirmacion.classList.remove('modal--visible');
  temporizadorOcultarModal = setTimeout(() => {
    elementos.modalConfirmacion.hidden = true;
    temporizadorOcultarModal = null;
  }, 200);
  if (typeof resolverModalConfirmacion === 'function') {
    resolverModalConfirmacion(decision);
    resolverModalConfirmacion = null;
  }
  if (ultimoElementoEnfoque && typeof ultimoElementoEnfoque.focus === 'function') {
    ultimoElementoEnfoque.focus({ preventScroll: true });
  }
  ultimoElementoEnfoque = null;
}

function prepararModalConfirmacion() {
  if (!elementos.modalConfirmacion) {
    return;
  }
  const accionesCancelar = elementos.modalConfirmacion.querySelectorAll('[data-modal-cancelar]');
  accionesCancelar.forEach((elemento) => {
    elemento.addEventListener('click', (evento) => {
      evento.preventDefault();
      cerrarModalConfirmacion(false);
    });
  });
  if (elementos.modalConfirmacionAceptar) {
    elementos.modalConfirmacionAceptar.addEventListener('click', (evento) => {
      evento.preventDefault();
      cerrarModalConfirmacion(true);
    });
  }
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && elementos.modalConfirmacion.classList.contains('modal--visible')) {
      evento.preventDefault();
      cerrarModalConfirmacion(false);
    }
  });
}

function ocultarFormularioCampos() {
  elementos.formularioCampos.hidden = true;
  elementos.resumenDocumento.hidden = true;
  elementos.descripcionDocumento.textContent =
    'Selecciona un documento para mostrar su información y editar los campos libres.';
  elementos.estadoGuardado.textContent = '';
  elementos.estadoGuardado.classList.remove('estado-guardado--error');
  camposDocumentoDisponibles = [];
  camposPartidasDisponibles = [];
  metadatosCamposDocumento = {};
  metadatosCamposPartidas = {};
  if (elementos.mensajeCamposDocumento) {
    elementos.mensajeCamposDocumento.hidden = true;
  }
  if (elementos.camposPartidas) {
    elementos.camposPartidas.hidden = true;
  }
  if (elementos.listaCamposPartidas) {
    elementos.listaCamposPartidas.innerHTML = '';
  }
  if (elementos.mensajeCamposPartidas) {
    elementos.mensajeCamposPartidas.hidden = true;
  }
}

function mostrarMensaje(texto) {
  const mensaje = limpiarMensaje(texto);
  actualizarEstadoGuardado(mensaje, true);
  mostrarToast(mensaje, 'error');
  temporizadorGuardado = setTimeout(() => {
    actualizarEstadoGuardado('');
  }, 4000);
}

function limpiarMensaje(texto) {
  return (texto || '').toString().replace(/\s+/g, ' ').trim();
}

function formatearFechaLocal(valor) {
  if (!valor) {
    return '';
  }
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) {
    return '';
  }
  return fecha.toLocaleDateString('es-MX');
}

function formatoCantidad(valor) {
  if (valor === null || valor === undefined) {
    return '0';
  }
  return Number(valor).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatoDinero(valor) {
  if (valor === null || valor === undefined) {
    return '$0.00';
  }
  return Number(valor).toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

async function guardarCampos(evento) {
  evento.preventDefault();
  if (!documentoSeleccionado) {
    return;
  }
  if (guardadoEnCurso) {
    return;
  }
  establecerGuardadoEnCurso(true);

  const campos = {};
  elementos.contenedorCampos.querySelectorAll('[data-clave-campo]').forEach((input) => {
    campos[input.dataset.claveCampo] = normalizarValorInputParaGuardado(input);
  });

  const partidas = [];
  if (camposPartidasDisponibles.length && elementos.listaCamposPartidas) {
    // Agrupa por contenedor de partida en lugar de por input individual
    const contenedoresPartida = elementos.listaCamposPartidas.querySelectorAll('.partida-campos');
    contenedoresPartida.forEach((contenedor) => {
      const numero = Number.parseInt(contenedor.dataset.numeroPartida, 10);
      if (Number.isNaN(numero)) {
        return;
      }

      const camposPartida = {};
      // Busca inputs dentro de este contenedor específico
      contenedor.querySelectorAll('input[data-clave-campo]').forEach((input) => {
        camposPartida[input.dataset.claveCampo] = normalizarValorInputParaGuardado(input);
      });

      partidas.push({ numero, campos: camposPartida });
    });
  }

  actualizarEstadoGuardado('Guardando…');

  const url = `/api/documentos/${documentoSeleccionado.tipo}/${documentoSeleccionado.empresa}/${encodeURIComponent(
    documentoSeleccionado.cveDoc
  )}`;

  try {
    const registroActual = documentoSeleccionado ? { ...documentoSeleccionado } : null;
    const respuesta = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ campos, partidas })
    });

    let datos = {};
    try {
      datos = await respuesta.json();
    } catch (errorRespuesta) {
      throw new Error('El servidor devolvio una respuesta invalida al guardar.');
    }
    if (!respuesta.ok || !datos.ok) {
      throw new Error(datos.mensaje || 'No fue posible guardar los cambios.');
    }

    if (registroActual) {
      await cargarDocumento(registroActual, { propagarError: true });
    }

    cambiosPendientes = false;
    actualizarEstadoGuardado('Cambios guardados');
    mostrarToast('Cambios guardados', 'exito');
    temporizadorGuardado = setTimeout(() => {
      actualizarEstadoGuardado('');
    }, 2500);
  } catch (error) {
    mostrarMensaje(error.message);
  } finally {
    establecerGuardadoEnCurso(false);
  }
}

function crearEstructuraEtiquetas(etiquetas) {
  return {
    documento: (etiquetas && etiquetas.documento) || {},
    partidas: (etiquetas && etiquetas.partidas) || {}
  };
}

function obtenerEtiquetaCampo(clave, indice) {
  if (etiquetasCampos.documento && etiquetasCampos.documento[clave]) {
    return etiquetasCampos.documento[clave];
  }
  return `Campo libre ${indice}`;
}

function obtenerEtiquetaCampoPartida(clave, indice) {
  if (etiquetasCampos.partidas && etiquetasCampos.partidas[clave]) {
    return etiquetasCampos.partidas[clave];
  }
  return `Campo libre ${indice}`;
}

function obtenerCamposDocumentoDisponibles(datos = {}) {
  if (Object.prototype.hasOwnProperty.call(datos, 'camposDisponiblesDocumento')) {
    return normalizarCamposDisponibles(datos.camposDisponiblesDocumento);
  }
  return [];
}

function obtenerCamposPartidasDisponibles(datos = {}) {
  if (Array.isArray(datos.camposPartidasDisponibles)) {
    return normalizarCamposDisponibles(datos.camposPartidasDisponibles);
  }
  return [];
}

function normalizarMetadatosCampos(conjunto = {}) {
  if (!conjunto || typeof conjunto !== 'object') {
    return {};
  }
  const resultado = {};
  Object.keys(conjunto).forEach((clave) => {
    const llave = (clave || '').toString().trim().toUpperCase();
    if (!REGEX_CAMPO_LIBRE.test(llave)) {
      return;
    }
    const info = conjunto[clave] || {};
    const longitud = Number.parseInt(info.longitud, 10);
    const tipo = (info.tipo || '').toString().trim();
    resultado[llave] = {
      longitud: Number.isFinite(longitud) && longitud > 0 ? longitud : null,
      tipo: tipo || 'Dato'
    };
  });
  return resultado;
}

function obtenerMetadatosCampoDocumento(clave) {
  return obtenerMetadatosCampoDesdeColeccion(metadatosCamposDocumento, clave);
}

function obtenerMetadatosCampoPartida(clave) {
  return obtenerMetadatosCampoDesdeColeccion(metadatosCamposPartidas, clave);
}

function obtenerMetadatosCampoDesdeColeccion(coleccion, clave) {
  if (!coleccion || !clave) {
    return null;
  }
  const llave = clave.toString().trim().toUpperCase();
  return coleccion[llave] || null;
}

function normalizarCamposDisponibles(lista) {
  if (!Array.isArray(lista)) {
    return [];
  }
  const vistos = new Set();
  const campos = [];
  lista.forEach((campo) => {
    const clave = (campo || '').toString().trim().toUpperCase();
    if (!clave || !REGEX_CAMPO_LIBRE.test(clave) || vistos.has(clave)) {
      return;
    }
    vistos.add(clave);
    campos.push(clave);
  });
  return campos;
}

function normalizarTipoDatoCampoLibre(infoCampo) {
  const tipoOrigen = infoCampo && typeof infoCampo === 'object' ? infoCampo.tipo : infoCampo;
  const tipo = (tipoOrigen || '').toString().trim().toLowerCase();
  if (tipo === 'fecha') {
    return 'fecha';
  }
  if (tipo === 'hora') {
    return 'hora';
  }
  if (tipo === 'fecha y hora') {
    return 'fecha_hora';
  }
  return 'dato';
}

function configurarInputCampoLibre(elemento, infoCampo, valorInicial = '') {
  if (!elemento) {
    return;
  }
  const tipoCampo = normalizarTipoDatoCampoLibre(infoCampo);
  elemento.dataset.tipoCampo = tipoCampo;
  elemento.removeAttribute('step');

  if (tipoCampo === 'fecha') {
    elemento.type = 'date';
    elemento.value = normalizarValorFechaParaInput(valorInicial);
    return;
  }
  if (tipoCampo === 'hora') {
    elemento.type = 'time';
    elemento.step = '1';
    elemento.value = normalizarValorHoraParaInput(valorInicial);
    return;
  }
  if (tipoCampo === 'fecha_hora') {
    elemento.type = 'datetime-local';
    elemento.step = '1';
    elemento.value = normalizarValorFechaHoraParaInput(valorInicial);
    return;
  }
  elemento.type = 'text';
  elemento.value = valorInicial === null || valorInicial === undefined ? '' : valorInicial.toString();
}

function normalizarValorInputParaGuardado(input) {
  if (!input) {
    return '';
  }
  const valor = input.value === null || input.value === undefined ? '' : input.value.toString().trim();
  if (!valor) {
    return '';
  }
  const tipoCampo = normalizarTipoDatoCampoLibre(input.dataset ? input.dataset.tipoCampo : '');
  if (tipoCampo === 'fecha') {
    return normalizarValorFechaParaInput(valor);
  }
  if (tipoCampo === 'hora') {
    return normalizarValorHoraParaInput(valor);
  }
  if (tipoCampo === 'fecha_hora') {
    return normalizarValorFechaHoraParaInput(valor);
  }
  return valor;
}

function normalizarValorFechaParaInput(valor) {
  const texto = (valor || '').toString().trim();
  if (!texto) {
    return '';
  }
  const fechaIso = REGEX_FECHA_ISO.exec(texto);
  if (fechaIso) {
    return `${fechaIso[1]}-${fechaIso[2]}-${fechaIso[3]}`;
  }
  const fechaHoraIso = REGEX_FECHA_HORA_ISO.exec(texto);
  if (fechaHoraIso) {
    return `${fechaHoraIso[1]}-${fechaHoraIso[2]}-${fechaHoraIso[3]}`;
  }
  const fecha = convertirAFechaValida(texto);
  if (!fecha) {
    return '';
  }
  return formatearFechaParaInput(fecha);
}

function normalizarValorHoraParaInput(valor) {
  const texto = (valor || '').toString().trim();
  if (!texto) {
    return '';
  }
  const horaIso = REGEX_HORA_ISO.exec(texto);
  if (horaIso) {
    return `${horaIso[1]}:${horaIso[2]}:${horaIso[3] || '00'}`;
  }
  const fechaHoraIso = REGEX_FECHA_HORA_ISO.exec(texto);
  if (fechaHoraIso) {
    return `${fechaHoraIso[4]}:${fechaHoraIso[5]}:${fechaHoraIso[6] || '00'}`;
  }
  const fecha = convertirAFechaValida(texto);
  if (!fecha) {
    return '';
  }
  return formatearHoraParaInput(fecha);
}

function normalizarValorFechaHoraParaInput(valor) {
  const texto = (valor || '').toString().trim();
  if (!texto) {
    return '';
  }
  const fechaHoraIso = REGEX_FECHA_HORA_ISO.exec(texto);
  if (fechaHoraIso) {
    return `${fechaHoraIso[1]}-${fechaHoraIso[2]}-${fechaHoraIso[3]}T${fechaHoraIso[4]}:${fechaHoraIso[5]}:${fechaHoraIso[6] || '00'
      }`;
  }
  const fechaIso = REGEX_FECHA_ISO.exec(texto);
  if (fechaIso) {
    return `${fechaIso[1]}-${fechaIso[2]}-${fechaIso[3]}T00:00:00`;
  }
  const fecha = convertirAFechaValida(texto);
  if (!fecha) {
    return '';
  }
  return `${formatearFechaParaInput(fecha)}T${formatearHoraParaInput(fecha)}`;
}

function convertirAFechaValida(valor) {
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor;
  }
  const texto = (valor || '').toString().trim();
  if (!texto) {
    return null;
  }
  const fecha = new Date(texto);
  if (Number.isNaN(fecha.getTime())) {
    return null;
  }
  return fecha;
}

function formatearFechaParaInput(fecha) {
  return `${fecha.getFullYear()}-${rellenarDosDigitos(fecha.getMonth() + 1)}-${rellenarDosDigitos(fecha.getDate())}`;
}

function formatearHoraParaInput(fecha) {
  return `${rellenarDosDigitos(fecha.getHours())}:${rellenarDosDigitos(fecha.getMinutes())}:${rellenarDosDigitos(
    fecha.getSeconds()
  )}`;
}

function rellenarDosDigitos(valor) {
  return String(valor).padStart(2, '0');
}

function crearEncabezadoCampoLibre(etiqueta, infoCampo) {
  const encabezado = document.createElement('div');
  encabezado.className = 'campo-libre__encabezado';
  const span = document.createElement('span');
  span.textContent = etiqueta;
  encabezado.appendChild(span);
  const indicador = crearIndicadorMetadatos(infoCampo);
  if (indicador) {
    encabezado.appendChild(indicador);
  }
  return encabezado;
}

function crearIndicadorMetadatos(infoCampo) {
  const descripcion = descripcionMetadatosCampo(infoCampo);
  if (!descripcion) {
    return null;
  }
  const indicador = document.createElement('button');
  indicador.type = 'button';
  indicador.className = 'campo-libre__info';
  indicador.setAttribute('aria-label', descripcion);
  indicador.title = descripcion;

  const icono = document.createElement('span');
  icono.className = 'campo-libre__info-icono';
  icono.setAttribute('aria-hidden', 'true');
  icono.textContent = 'i';

  const tooltip = document.createElement('span');
  tooltip.className = 'campo-libre__tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.textContent = descripcion;

  indicador.appendChild(icono);
  indicador.appendChild(tooltip);

  const alternar = (visible) => {
    indicador.classList.toggle('campo-libre__info--visible', Boolean(visible));
  };
  indicador.addEventListener('focus', () => alternar(true));
  indicador.addEventListener('blur', () => alternar(false));

  return indicador;
}

function descripcionMetadatosCampo(infoCampo) {
  const tipo = infoCampo && infoCampo.tipo ? infoCampo.tipo : 'Dato';
  const longitudTexto =
    infoCampo && Number.isFinite(infoCampo.longitud) && infoCampo.longitud > 0
      ? `${infoCampo.longitud} caract.`
      : 'sin longitud fija';
  return `Tipo: ${tipo} | Largo: ${longitudTexto}`;
}

function aplicarMetadatosAlInput(elemento, infoCampo) {
  if (!elemento) {
    return;
  }
  const descripcion = descripcionMetadatosCampo(infoCampo);
  if (descripcion) {
    elemento.title = descripcion;
  }
  const tipoCampo = normalizarTipoDatoCampoLibre(infoCampo);
  if (tipoCampo === 'fecha' || tipoCampo === 'hora' || tipoCampo === 'fecha_hora') {
    elemento.removeAttribute('maxLength');
    return;
  }
  const longitud =
    infoCampo && Number.isFinite(infoCampo.longitud) && infoCampo.longitud > 0 ? infoCampo.longitud : 100;
  elemento.maxLength = longitud;
}

function mostrarToast(texto, tipo = 'info') {
  if (!elementos.toastContainer) {
    return;
  }
  const toast = document.createElement('div');
  const claseTipo = tipo === 'error' ? 'toast--error' : tipo === 'exito' ? 'toast--exito' : '';
  toast.className = `toast ${claseTipo}`.trim();
  toast.textContent = limpiarMensaje(texto);
  elementos.toastContainer.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.add('toast--visible');
  });
  setTimeout(() => cerrarToast(toast), 4500);
}

function cerrarToast(toast) {
  if (!toast) {
    return;
  }
  toast.classList.remove('toast--visible');
  setTimeout(() => {
    toast.remove();
  }, 300);
}

function actualizarEstadoGuardado(texto, esError = false) {
  clearTimeout(temporizadorGuardado);
  elementos.estadoGuardado.textContent = texto;
  if (esError) {
    elementos.estadoGuardado.classList.add('estado-guardado--error');
  } else {
    elementos.estadoGuardado.classList.remove('estado-guardado--error');
  }
}

function establecerGuardadoEnCurso(activo) {
  guardadoEnCurso = Boolean(activo);
  if (!elementos.botonGuardar) {
    return;
  }
  elementos.botonGuardar.disabled = guardadoEnCurso;
  elementos.botonGuardar.setAttribute('aria-disabled', guardadoEnCurso ? 'true' : 'false');
  elementos.botonGuardar.textContent = guardadoEnCurso ? 'Guardando...' : TEXTO_BOTON_GUARDAR;
}

window.addEventListener('DOMContentLoaded', async () => {
  try {
    await cargarEmpresas();
    await cargarTiposDocumento();
    await buscarDocumentos();
  } catch (error) {
    mostrarMensaje(error.message);
  }
});

if (elementos.formularioBusqueda) {
  elementos.formularioBusqueda.addEventListener('submit', (evento) => {
    evento.preventDefault();
    buscarDocumentos();
  });
}

if (elementos.termino) {
  elementos.termino.addEventListener('input', programarBusqueda);
}

if (elementos.tipoDocumento) {
  elementos.tipoDocumento.addEventListener('change', () => {
    buscarDocumentos();
  });
}

if (elementos.empresa) {
  elementos.empresa.addEventListener('change', () => {
    actualizarEmpresaActivaEncabezado();
    buscarDocumentos();
  });
}

if (elementos.formularioCampos) {
  elementos.formularioCampos.addEventListener('submit', guardarCampos);
}

if (elementos.botonVolver) {
  elementos.botonVolver.addEventListener('click', volverAPanelBusqueda);
}

inicializarTabs();
prepararModalConfirmacion();

window.addEventListener('beforeunload', (evento) => {
  if (!cambiosPendientes) {
    return;
  }
  evento.preventDefault();
  evento.returnValue = '';
});
