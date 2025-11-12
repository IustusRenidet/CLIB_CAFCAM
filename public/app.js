const elementos = {
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
  mensajeSinPartidas: document.getElementById('sin-partidas')
};

const plantillas = {
  resultado: document.getElementById('fila-resultado'),
  partida: document.getElementById('fila-partida')
};

let documentoSeleccionado = null;
let etiquetasCampos = {};

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
      boton.addEventListener('click', () => cargarDocumento(registro));
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

    etiquetasCampos = datos.etiquetas || {};
    elementos.descripcionDocumento.textContent = `Editando ${datos.documento.descripcion}.`;
    elementos.resumenDocumento.hidden = false;
    elementos.detalleClave.textContent = datos.documento.cveDoc;
    elementos.detalleCliente.textContent = datos.documento.cliente || 'Sin cliente';
    elementos.detalleFecha.textContent = formatearFechaLocal(datos.documento.fechaDoc) || 'Sin fecha';

    pintarCamposLibres(datos.camposLibres || {});
    pintarPartidas(datos.partidas || []);
  } catch (error) {
    mostrarMensaje(error.message);
  }
}

function pintarCamposLibres(campos = {}) {
  elementos.formularioCampos.hidden = false;
  elementos.contenedorCampos.innerHTML = '';

  for (let indice = 1; indice <= 11; indice += 1) {
    const clave = `CAMPLIB${indice}`;
    const etiqueta = etiquetasCampos[clave] || `Campo libre ${indice}`;

    const campo = document.createElement('label');
    campo.className = 'campo-libre';

    const span = document.createElement('span');
    span.textContent = etiqueta;
    campo.appendChild(span);

    const entrada = document.createElement('input');
    entrada.type = 'text';
    entrada.value = campos[clave] || '';
    entrada.dataset.claveCampo = clave;
    entrada.maxLength = 100;
    campo.appendChild(entrada);

    elementos.contenedorCampos.appendChild(campo);
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

function ocultarFormularioCampos() {
  elementos.formularioCampos.hidden = true;
  elementos.resumenDocumento.hidden = true;
  elementos.descripcionDocumento.textContent =
    'Selecciona un documento para mostrar su información y editar los campos libres.';
}

function mostrarMensaje(texto) {
  elementos.estadoGuardado.textContent = limpiarMensaje(texto);
  elementos.estadoGuardado.classList.add('estado-guardado--error');
  setTimeout(() => {
    elementos.estadoGuardado.textContent = '';
    elementos.estadoGuardado.classList.remove('estado-guardado--error');
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

  elementos.estadoGuardado.textContent = 'Guardando…';
  elementos.estadoGuardado.classList.remove('estado-guardado--error');

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

    elementos.estadoGuardado.textContent = 'Cambios guardados';
    setTimeout(() => {
      elementos.estadoGuardado.textContent = '';
    }, 2500);
  } catch (error) {
    mostrarMensaje(error.message);
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  try {
    await cargarTiposDocumento();
  } catch (error) {
    mostrarMensaje(error.message);
  }
});

elementos.formularioBusqueda.addEventListener('submit', buscarDocumentos);
elementos.formularioCampos.addEventListener('submit', guardarCampos);
