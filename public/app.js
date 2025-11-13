const elementos = {
  app: document.getElementById('app'),
  formularioBusqueda: document.getElementById('formulario-busqueda'),
  formularioCampos: document.getElementById('formulario-campos'),
  tipoDocumento: document.getElementById('tipo-documento'),
  empresa: document.getElementById('empresa'),
  termino: document.getElementById('termino'),
  tablaResultados: document.getElementById('resultados'),
  mensajeSinResultados: document.getElementById('sin-resultados'),
  descripcionDocumento: document.getElementById('descripcion-documento'),
  resumenDocumento: document.getElementById('resumen-documento'),
  detalleClave: document.getElementById('detalle-clave'),
  detalleCliente: document.getElementById('detalle-cliente'),
  detalleFecha: document.getElementById('detalle-fecha'),
  contenedorCampos: document.getElementById('contenedor-campos'),
  estadoGuardado: document.getElementById('estado-guardado'),
  tablaPartidas: document.getElementById('partidas'),
  mensajeSinPartidas: document.getElementById('sin-partidas'),
  panelDetalle: document.getElementById('panel-detalle'),
  tabDetalle: document.querySelector('[data-tab-target="detalle"]'),
  botonVolver: document.getElementById('boton-volver'),
  filtroCampos: document.getElementById('filtro-campos'),
  toastContainer: document.getElementById('toast-container')
};

const plantillas = {
  resultado: document.getElementById('fila-resultado'),
  partida: document.getElementById('fila-partida')
};

let documentoSeleccionado = null;
let etiquetasCampos = crearEstructuraEtiquetas();
let cambiosPendientes = false;
let temporizadorGuardado = null;

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

async function buscarDocumentos(evento) {
  evento.preventDefault();
  limpiarResultados();
  documentoSeleccionado = null;
  ocultarFormularioCampos();

  const parametros = new URLSearchParams({
    tipo: elementos.tipoDocumento.value,
    empresa: elementos.empresa.value,
    termino: elementos.termino.value
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

function seleccionarDocumento(registro) {
  if (!registro) {
    return;
  }
  if (!confirmarSalidaDeCambios()) {
    return;
  }
  cargarDocumento(registro);
}

async function cargarDocumento(registro) {
  try {
    const url = `/api/documentos/${registro.tipo}/${registro.empresa}/${encodeURIComponent(registro.cveDoc)}`;
    const respuesta = await fetch(url);
    const datos = await respuesta.json();

    if (!datos.ok) {
      throw new Error(datos.mensaje || 'No fue posible obtener el documento.');
    }

    documentoSeleccionado = {
      tipo: registro.tipo,
      empresa: registro.empresa,
      cveDoc: registro.cveDoc
    };

    etiquetasCampos = crearEstructuraEtiquetas(datos.etiquetas);
    elementos.descripcionDocumento.textContent = `Editando ${datos.documento.descripcion}.`;
    elementos.resumenDocumento.hidden = false;
    elementos.detalleClave.textContent = datos.documento.cveDoc;
    elementos.detalleCliente.textContent = datos.documento.cliente || 'Sin cliente';
    elementos.detalleFecha.textContent = formatearFechaLocal(datos.documento.fechaDoc) || 'Sin fecha';

    pintarCamposLibres(datos.camposLibres || {});
    pintarPartidas(datos.partidas || []);
    activarVistaDetalle();
  } catch (error) {
    mostrarMensaje(error.message);
  }
}

function pintarCamposLibres(campos = {}) {
  elementos.formularioCampos.hidden = false;
  elementos.contenedorCampos.innerHTML = '';
  cambiosPendientes = false;
  actualizarEstadoGuardado('');

  const grupos = {
    documento: crearGrupoCampos('documento'),
    partida: crearGrupoCampos('partida')
  };

  for (let indice = 1; indice <= 11; indice += 1) {
    const clave = `CAMPLIB${indice}`;
    const etiqueta = obtenerEtiquetaCampo(clave, indice);
    const origen = obtenerOrigenCampo(clave);

    const campo = document.createElement('label');
    campo.className = 'campo-libre';
    campo.dataset.origenCampo = origen;

    const encabezado = document.createElement('div');
    encabezado.className = 'campo-libre__encabezado';

    const span = document.createElement('span');
    span.textContent = etiqueta;
    encabezado.appendChild(span);

    const insignia = document.createElement('span');
    insignia.className = `campo-libre__origen campo-libre__origen--${origen}`;
    insignia.textContent = origen === 'partida' ? 'Partidas' : 'Documento';
    encabezado.appendChild(insignia);

    campo.appendChild(encabezado);

    const entrada = document.createElement('input');
    entrada.type = 'text';
    entrada.value = campos[clave] || '';
    entrada.dataset.claveCampo = clave;
    entrada.maxLength = 100;
    entrada.addEventListener('input', marcarCambiosPendientes);
    campo.appendChild(entrada);
    const grupoDestino = grupos[origen] || grupos.documento;
    grupoDestino.lista.appendChild(campo);
    grupoDestino.total += 1;
  }

  Object.values(grupos).forEach((grupo) => {
    actualizarGrupoCampos(grupo);
    elementos.contenedorCampos.appendChild(grupo.elemento);
  });

  prepararFiltroCampos(grupos);
}

function crearGrupoCampos(origen) {
  const elemento = document.createElement('div');
  elemento.className = 'campos-libres__grupo';
  elemento.dataset.tablaOrigen = origen;

  const titulo = document.createElement('div');
  titulo.className = 'campos-libres__titulo';

  const texto = document.createElement('span');
  texto.textContent = origen === 'partida' ? 'Campos de partidas' : 'Campos del documento';
  titulo.appendChild(texto);

  const insignia = document.createElement('span');
  insignia.className = `campo-libre__origen campo-libre__origen--${origen}`;
  insignia.textContent = origen === 'partida' ? 'Partidas' : 'Documento';
  titulo.appendChild(insignia);

  const lista = document.createElement('div');
  lista.className = 'campos-libres__lista';

  const mensaje = document.createElement('p');
  mensaje.className = 'campos-libres__mensaje';
  mensaje.textContent =
    origen === 'partida'
      ? 'No hay campos libres configurados para las partidas.'
      : 'No hay campos libres configurados para el documento.';
  mensaje.hidden = true;

  elemento.appendChild(titulo);
  elemento.appendChild(lista);
  elemento.appendChild(mensaje);

  return { elemento, lista, mensaje, total: 0, origen };
}

function actualizarGrupoCampos(grupo) {
  const hayCampos = grupo.total > 0;
  grupo.elemento.dataset.totalCampos = String(grupo.total);
  if (hayCampos) {
    grupo.lista.hidden = false;
    grupo.mensaje.hidden = true;
  } else {
    grupo.lista.hidden = true;
    grupo.mensaje.hidden = false;
  }
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
}

function prepararFiltroCampos(grupos) {
  if (!elementos.filtroCampos) {
    return;
  }
  let filtro = 'todos';
  if (grupos) {
    const tieneDocumento = grupos.documento.total > 0;
    const tienePartida = grupos.partida.total > 0;
    if (tieneDocumento && tienePartida) {
      filtro = 'documento';
    } else if (tieneDocumento) {
      filtro = 'documento';
    } else if (tienePartida) {
      filtro = 'partida';
    }
  }
  elementos.filtroCampos.value = filtro;
  aplicarFiltroCampos();
}

function aplicarFiltroCampos() {
  if (!elementos.filtroCampos) {
    return;
  }
  const filtro = elementos.filtroCampos.value;
  elementos.contenedorCampos.querySelectorAll('.campos-libres__grupo').forEach((grupo) => {
    const lista = grupo.querySelector('.campos-libres__lista');
    const mensaje = grupo.querySelector('.campos-libres__mensaje');
    const totalCampos = Number(grupo.dataset.totalCampos || '0');
    if (!totalCampos) {
      grupo.hidden = false;
      if (lista) {
        lista.hidden = true;
      }
      if (mensaje) {
        mensaje.hidden = false;
      }
      return;
    }

    let visibles = 0;
    grupo.querySelectorAll('.campo-libre').forEach((campo) => {
      const origen = campo.dataset.origenCampo || 'documento';
      const visible = filtro === 'todos' || filtro === origen;
      campo.hidden = !visible;
      if (visible) {
        visibles += 1;
      }
    });

    if (visibles > 0) {
      grupo.hidden = false;
      if (lista) {
        lista.hidden = false;
      }
      if (mensaje) {
        mensaje.hidden = true;
      }
    } else {
      grupo.hidden = true;
    }
  });
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

function volverAPanelBusqueda() {
  if (!confirmarSalidaDeCambios()) {
    return;
  }
  documentoSeleccionado = null;
  cambiosPendientes = false;
  actualizarEstadoGuardado('');
  ocultarFormularioCampos();
  desactivarVistaDetalle();
}

function confirmarSalidaDeCambios() {
  if (!cambiosPendientes) {
    return true;
  }
  return window.confirm('Tienes cambios sin guardar. Si continúas, no se aplicarán.');
}

function ocultarFormularioCampos() {
  elementos.formularioCampos.hidden = true;
  elementos.resumenDocumento.hidden = true;
  elementos.descripcionDocumento.textContent =
    'Selecciona un documento para mostrar su información y editar los campos libres.';
  elementos.estadoGuardado.textContent = '';
  elementos.estadoGuardado.classList.remove('estado-guardado--error');
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

  const campos = {};
  elementos.contenedorCampos.querySelectorAll('[data-clave-campo]').forEach((input) => {
    campos[input.dataset.claveCampo] = input.value.trim();
  });

  actualizarEstadoGuardado('Guardando…');

  const url = `/api/documentos/${documentoSeleccionado.tipo}/${documentoSeleccionado.empresa}/${encodeURIComponent(
    documentoSeleccionado.cveDoc
  )}`;

  try {
    const respuesta = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ campos })
    });

    const datos = await respuesta.json();
    if (!datos.ok) {
      throw new Error(datos.mensaje || 'No fue posible guardar los cambios.');
    }

    cambiosPendientes = false;
    actualizarEstadoGuardado('Cambios guardados');
    mostrarToast('Cambios guardados', 'exito');
    temporizadorGuardado = setTimeout(() => {
      actualizarEstadoGuardado('');
    }, 2500);
  } catch (error) {
    mostrarMensaje(error.message);
  }
}

function crearEstructuraEtiquetas(etiquetas) {
  return {
    documento: (etiquetas && etiquetas.documento) || {},
    partidas: (etiquetas && etiquetas.partidas) || {}
  };
}

function obtenerOrigenCampo(clave) {
  if (etiquetasCampos.partidas && Object.prototype.hasOwnProperty.call(etiquetasCampos.partidas, clave)) {
    return 'partida';
  }
  return 'documento';
}

function obtenerEtiquetaCampo(clave, indice) {
  if (etiquetasCampos.documento && etiquetasCampos.documento[clave]) {
    return etiquetasCampos.documento[clave];
  }
  if (etiquetasCampos.partidas && etiquetasCampos.partidas[clave]) {
    return `${etiquetasCampos.partidas[clave]} (Partidas)`;
  }
  return `Campo libre ${indice}`;
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

window.addEventListener('DOMContentLoaded', async () => {
  try {
    await cargarTiposDocumento();
  } catch (error) {
    mostrarMensaje(error.message);
  }
});

if (elementos.formularioBusqueda) {
  elementos.formularioBusqueda.addEventListener('submit', buscarDocumentos);
}

if (elementos.formularioCampos) {
  elementos.formularioCampos.addEventListener('submit', guardarCampos);
}

if (elementos.botonVolver) {
  elementos.botonVolver.addEventListener('click', volverAPanelBusqueda);
}

if (elementos.filtroCampos) {
  elementos.filtroCampos.addEventListener('change', aplicarFiltroCampos);
}

inicializarTabs();

window.addEventListener('beforeunload', (evento) => {
  if (!cambiosPendientes) {
    return;
  }
  evento.preventDefault();
  evento.returnValue = '';
});
