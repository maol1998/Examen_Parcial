/**
 * Cliente Web CRUD - Distribuidora y Exportadora de Mariscos "El Puerto"
 * Vanilla JavaScript (sin frameworks) con consumo asíncrono mediante async/await y fetch()
 */

const API_URL = '/api/mariscos';

// Estado en memoria para filtrado instantáneo y control de modales
let lotesCache = [];
let loteIdAEliminar = null;
let loteIdEnDetalle = null;

// Instancias de Modales Bootstrap
let modalDetalle = null;
let modalEditar = null;
let modalEliminar = null;
let modalSeed = null;

// =========================================================================
// UTILIDADES DE SEGURIDAD Y FORMATO
// =========================================================================

/**
 * Escapa caracteres HTML para evitar inyección XSS al renderizar en el DOM.
 */
function escapeHtml(texto) {
    if (texto === null || texto === undefined) return '';
    return String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatearMoneda(valor) {
    const num = Number(valor) || 0;
    return '$' + num.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatearFecha(isoString) {
    if (!isoString) return 'No disponible';
    const fecha = new Date(isoString);
    return fecha.toLocaleString('es-EC', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function obtenerClaseDestino(destino = '') {
    if (destino.includes('Exportación')) return 'badge-soft-export';
    if (destino.includes('Nacional')) return 'badge-soft-nacional';
    return 'badge-soft-local';
}

function obtenerClaseEstado(estado = '') {
    switch (estado) {
        case 'Recibido en Muelle': return 'badge-estado-recibido';
        case 'En Inspección': return 'badge-estado-inspeccion';
        case 'Empacado': return 'badge-estado-empacado';
        case 'Distribuido': return 'badge-estado-distribuido';
        case 'Cancelado': return 'badge-estado-cancelado';
        default: return 'text-bg-secondary';
    }
}

function actualizarEstadoAPI(online, texto) {
    const pill = document.getElementById('apiStatusPill');
    const label = document.getElementById('apiStatusText');
    if (!pill || !label) return;

    pill.classList.toggle('offline', !online);
    label.textContent = texto;
}

/**
 * Muestra una notificación Bootstrap Toast en la esquina inferior derecha.
 */
function mostrarToast(titulo, mensaje, tipo = 'success') {
    const container = document.getElementById('toastContainer');
    const iconos = {
        success: 'bi-check-circle-fill text-success',
        danger: 'bi-x-circle-fill text-danger',
        warning: 'bi-exclamation-triangle-fill text-warning',
        info: 'bi-info-circle-fill text-info'
    };

    const toastEl = document.createElement('div');
    toastEl.className = 'toast border-0 shadow-lg';
    toastEl.setAttribute('role', 'alert');
    toastEl.setAttribute('aria-live', 'assertive');
    toastEl.setAttribute('aria-atomic', 'true');

    toastEl.innerHTML = `
        <div class="toast-header bg-white border-bottom">
            <i class="bi ${iconos[tipo] || iconos.info} me-2"></i>
            <strong class="me-auto text-dark">${escapeHtml(titulo)}</strong>
            <small class="text-muted">ahora</small>
            <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Cerrar"></button>
        </div>
        <div class="toast-body bg-white text-dark small">
            ${escapeHtml(mensaje)}
        </div>
    `;

    container.appendChild(toastEl);
    const toastInstance = new bootstrap.Toast(toastEl, { delay: 4000 });
    toastInstance.show();

    toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
}

function mostrarAlertaFormulario(alertId, mensaje) {
    const el = document.getElementById(alertId);
    if (!el) return;
    if (!mensaje) {
        el.classList.add('d-none');
        el.textContent = '';
    } else {
        el.textContent = mensaje;
        el.classList.remove('d-none');
    }
}

function actualizarPreviewValor(pesoInputId, precioInputId, outputId) {
    const peso = parseFloat(document.getElementById(pesoInputId)?.value) || 0;
    const precio = parseFloat(document.getElementById(precioInputId)?.value) || 0;
    const total = peso * precio;
    const output = document.getElementById(outputId);
    if (output) {
        output.textContent = `${formatearMoneda(total)} USD`;
    }
}

// =========================================================================
// OPERACIÓN 1 (READ ALL): GET /api/mariscos
// =========================================================================

async function cargarLotes() {
    const tbody = document.getElementById('tablaLotes');
    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="text-center py-5 text-muted">
                <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                <span>Consultando GET /api/mariscos...</span>
            </td>
        </tr>
    `;

    try {
        const response = await fetch(API_URL);
        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(data.msg || `Error HTTP ${response.status}`);
        }

        lotesCache = Array.isArray(data.mariscos) ? data.mariscos : [];
        actualizarEstadoAPI(true, `API Online (${response.status} OK)`);
        aplicarFiltros();
    } catch (error) {
        console.error('Error en GET /api/mariscos:', error);
        actualizarEstadoAPI(false, 'API Desconectada');
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-5 text-danger">
                    <i class="bi bi-wifi-off fs-2 d-block mb-2"></i>
                    <strong>No se pudo conectar con la API (${escapeHtml(API_URL)})</strong>
                    <div class="small text-muted mt-1">${escapeHtml(error.message)}</div>
                </td>
            </tr>
        `;
        document.getElementById('contadorResultados').textContent = 'Sin conexión con el servidor';
    }
}

// =========================================================================
// MANIPULACIÓN DEL DOM: ESTADÍSTICAS, FILTROS Y RENDERIZADO DE TABLA
// =========================================================================

function actualizarEstadisticas(lotes) {
    const totalLotes = lotes.length;
    const totalKg = lotes.reduce((acc, l) => acc + (Number(l.pesoKg) || 0), 0);
    const totalValor = lotes.reduce(
        (acc, l) => acc + ((Number(l.pesoKg) || 0) * (Number(l.precioKilo) || 0)),
        0
    );
    const totalExport = lotes.filter(
        (l) => l.destino && l.destino.includes('Exportación')
    ).length;

    document.getElementById('statTotalLotes').textContent = totalLotes;
    document.getElementById('statTotalKg').textContent =
        `${totalKg.toLocaleString('es-EC', { maximumFractionDigits: 1 })} kg`;
    document.getElementById('statTotalValor').textContent = formatearMoneda(totalValor);
    document.getElementById('statExportacion').textContent = totalExport;
}

function aplicarFiltros() {
    const texto = document.getElementById('busquedaInput').value.trim().toLowerCase();
    const categoria = document.getElementById('filtroCategoria').value;
    const destino = document.getElementById('filtroDestino').value;
    const estado = document.getElementById('filtroEstado').value;

    const filtrados = lotesCache.filter((lote) => {
        const coincideTexto = !texto ||
            (lote.codigoLote && lote.codigoLote.toLowerCase().includes(texto)) ||
            (lote.producto && lote.producto.toLowerCase().includes(texto)) ||
            (lote.embarcacion && lote.embarcacion.toLowerCase().includes(texto)) ||
            (lote.pescadorResponsable && lote.pescadorResponsable.toLowerCase().includes(texto));

        const coincideCategoria = !categoria || lote.categoria === categoria;
        const coincideDestino = !destino || lote.destino === destino;
        const coincideEstado = !estado || lote.estado === estado;

        return coincideTexto && coincideCategoria && coincideDestino && coincideEstado;
    });

    renderizarTabla(filtrados);
    actualizarEstadisticas(filtrados);

    const contador = document.getElementById('contadorResultados');
    if (filtrados.length === lotesCache.length) {
        contador.textContent = `Mostrando ${filtrados.length} lote(s) registrados en MongoDB`;
    } else {
        contador.textContent = `Mostrando ${filtrados.length} de ${lotesCache.length} lote(s) (filtros activos)`;
    }
}

function renderizarTabla(lotes) {
    const tbody = document.getElementById('tablaLotes');

    if (!lotes || lotes.length === 0) {
        const hayFiltros =
            document.getElementById('busquedaInput').value.trim() ||
            document.getElementById('filtroCategoria').value ||
            document.getElementById('filtroDestino').value ||
            document.getElementById('filtroEstado').value;

        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-5 text-muted">
                    <i class="bi bi-inbox fs-2 d-block mb-2 text-secondary"></i>
                    <p class="mb-2 fw-semibold">
                        ${hayFiltros
                            ? 'No hay lotes que coincidan con los filtros aplicados.'
                            : 'No hay lotes registrados en la base de datos.'}
                    </p>
                    <small>
                        ${hayFiltros
                            ? 'Pruebe limpiando los filtros de búsqueda.'
                            : 'Registre un nuevo lote desde el formulario o pulse "Cargar Muestra".'}
                    </small>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = lotes.map((lote) => {
        const totalUSD = (Number(lote.pesoKg) || 0) * (Number(lote.precioKilo) || 0);
        const claseDestino = obtenerClaseDestino(lote.destino);
        const claseEstado = obtenerClaseEstado(lote.estado);

        return `
            <tr data-id="${escapeHtml(lote._id)}">
                <td>
                    <div class="d-flex align-items-center gap-2 mb-1">
                        <span class="lote-codigo-badge font-mono-code">${escapeHtml(lote.codigoLote)}</span>
                        <span class="categoria-chip">${escapeHtml(lote.categoria)}</span>
                    </div>
                    <div class="fw-semibold text-dark">${escapeHtml(lote.producto)}</div>
                </td>
                <td>
                    <div class="fw-medium text-dark">
                        <i class="bi bi-tsunami text-primary me-1"></i>${escapeHtml(lote.embarcacion)}
                    </div>
                    <div class="small text-muted">
                        <i class="bi bi-person me-1"></i>${escapeHtml(lote.pescadorResponsable)}
                    </div>
                </td>
                <td>
                    <div class="fw-semibold text-dark">${Number(lote.pesoKg).toFixed(1)} Kg</div>
                    <div class="small text-muted">${formatearMoneda(lote.precioKilo)} / kg</div>
                </td>
                <td>
                    <div class="fw-bold text-success">${formatearMoneda(totalUSD)}</div>
                    <div class="small text-muted">${escapeHtml(lote.calidad || 'Exportación')}</div>
                </td>
                <td>
                    <div class="mb-1">
                        <span class="badge rounded-pill ${claseDestino} fw-semibold">${escapeHtml(lote.destino)}</span>
                    </div>
                    <div>
                        <span class="badge rounded-pill ${claseEstado} fw-semibold">${escapeHtml(lote.estado)}</span>
                    </div>
                </td>
                <td class="text-center">
                    <div class="d-inline-flex align-items-center gap-1">
                        <button type="button" class="btn btn-sm btn-outline-info btn-action" data-action="ver" data-id="${escapeHtml(lote._id)}" title="Ver detalle (GET /:id)">
                            <i class="bi bi-eye-fill"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-primary btn-action" data-action="editar" data-id="${escapeHtml(lote._id)}" title="Editar lote (PUT /:id)">
                            <i class="bi bi-pencil-fill"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-danger btn-action" data-action="eliminar" data-id="${escapeHtml(lote._id)}" data-codigo="${escapeHtml(lote.codigoLote)}" data-producto="${escapeHtml(lote.producto)}" title="Eliminar lote (DELETE /:id)">
                            <i class="bi bi-trash3-fill"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// =========================================================================
// OPERACIÓN 2 (READ ONE): GET /api/mariscos/:id
// =========================================================================

async function verDetalleLote(id) {
    loteIdEnDetalle = id;
    const body = document.getElementById('modalDetalleBody');
    body.innerHTML = `
        <div class="text-center py-4 text-muted">
            <div class="spinner-border text-primary mb-2" role="status"></div>
            <p class="small mb-0">Consultando GET /api/mariscos/${escapeHtml(id)}...</p>
        </div>
    `;
    modalDetalle.show();

    try {
        const response = await fetch(`${API_URL}/${encodeURIComponent(id)}`);
        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(data.msg || `Error HTTP ${response.status}`);
        }

        const lote = data.marisco;
        const totalUSD = (Number(lote.pesoKg) || 0) * (Number(lote.precioKilo) || 0);

        body.innerHTML = `
            <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 pb-3 mb-3 border-bottom">
                <div>
                    <span class="lote-codigo-badge font-mono-code mb-1">${escapeHtml(lote.codigoLote)}</span>
                    <h4 class="h5 fw-bold text-dark mb-0 mt-1">${escapeHtml(lote.producto)}</h4>
                </div>
                <div class="text-md-end">
                    <span class="badge rounded-pill ${obtenerClaseEstado(lote.estado)} px-3 py-2">${escapeHtml(lote.estado)}</span>
                </div>
            </div>

            <div class="row g-3">
                <div class="col-sm-6 col-md-4">
                    <div class="detail-tile">
                        <div class="detail-tile-label">Categoría</div>
                        <div class="detail-tile-value">${escapeHtml(lote.categoria)}</div>
                    </div>
                </div>
                <div class="col-sm-6 col-md-4">
                    <div class="detail-tile">
                        <div class="detail-tile-label">Calidad</div>
                        <div class="detail-tile-value">${escapeHtml(lote.calidad)}</div>
                    </div>
                </div>
                <div class="col-sm-6 col-md-4">
                    <div class="detail-tile">
                        <div class="detail-tile-label">Cadena de Frío</div>
                        <div class="detail-tile-value text-primary">
                            <i class="bi bi-thermometer-snow me-1"></i>${Number(lote.temperaturaAlmacenamiento ?? -18)} °C
                        </div>
                    </div>
                </div>
                <div class="col-sm-6">
                    <div class="detail-tile">
                        <div class="detail-tile-label">Embarcación Pesquera</div>
                        <div class="detail-tile-value">${escapeHtml(lote.embarcacion)}</div>
                    </div>
                </div>
                <div class="col-sm-6">
                    <div class="detail-tile">
                        <div class="detail-tile-label">Pescador Responsable</div>
                        <div class="detail-tile-value">${escapeHtml(lote.pescadorResponsable)}</div>
                    </div>
                </div>
                <div class="col-sm-4">
                    <div class="detail-tile">
                        <div class="detail-tile-label">Peso del Lote</div>
                        <div class="detail-tile-value">${Number(lote.pesoKg).toFixed(2)} Kg</div>
                    </div>
                </div>
                <div class="col-sm-4">
                    <div class="detail-tile">
                        <div class="detail-tile-label">Precio por Kilo</div>
                        <div class="detail-tile-value">${formatearMoneda(lote.precioKilo)} USD</div>
                    </div>
                </div>
                <div class="col-sm-4">
                    <div class="detail-tile">
                        <div class="detail-tile-label">Valor Total Lote</div>
                        <div class="detail-tile-value text-success">${formatearMoneda(totalUSD)} USD</div>
                    </div>
                </div>
                <div class="col-sm-6">
                    <div class="detail-tile">
                        <div class="detail-tile-label">Destino Comercial</div>
                        <div class="detail-tile-value">${escapeHtml(lote.destino)}</div>
                    </div>
                </div>
                <div class="col-sm-6">
                    <div class="detail-tile">
                        <div class="detail-tile-label">Puerto de Origen</div>
                        <div class="detail-tile-value">${escapeHtml(lote.puertoOrigen || 'Puerto Pesquero Artesanal de Esmeraldas')}</div>
                    </div>
                </div>
                <div class="col-12">
                    <div class="detail-tile">
                        <div class="detail-tile-label">Observaciones de Inspección</div>
                        <div class="small text-dark">${escapeHtml(lote.observaciones || 'Sin observaciones registradas.')}</div>
                    </div>
                </div>
            </div>

            <div class="d-flex flex-wrap justify-content-between gap-2 text-muted small mt-3 pt-3 border-top">
                <span><i class="bi bi-fingerprint me-1"></i>ID: <code class="text-secondary">${escapeHtml(lote._id)}</code></span>
                <span><i class="bi bi-clock-history me-1"></i>Actualizado: ${escapeHtml(formatearFecha(lote.updatedAt || lote.createdAt))}</span>
            </div>
        `;
    } catch (error) {
        console.error('Error en GET /api/mariscos/:id:', error);
        body.innerHTML = `
            <div class="alert alert-danger mb-0">
                <i class="bi bi-exclamation-octagon-fill me-2"></i>
                No se pudo obtener el detalle del lote: ${escapeHtml(error.message)}
            </div>
        `;
    }
}

// =========================================================================
// OPERACIÓN 3 (CREATE): POST /api/mariscos
// =========================================================================

async function crearLote(event) {
    event.preventDefault();
    mostrarAlertaFormulario('formCrearAlert', '');

    const selectProducto = document.getElementById('productoSelect');
    const customProducto = document.getElementById('productoCustom');
    const producto = selectProducto.value === 'otro'
        ? customProducto.value.trim()
        : selectProducto.value;

    const embarcacion = document.getElementById('embarcacion').value.trim();
    const pescadorResponsable = document.getElementById('pescadorResponsable').value.trim();
    const pesoKg = parseFloat(document.getElementById('pesoKg').value);
    const precioKilo = parseFloat(document.getElementById('precioKilo').value);
    const temperatura = parseFloat(document.getElementById('temperaturaAlmacenamiento').value);
    const codigoLote = document.getElementById('codigoLote').value.trim();
    const observaciones = document.getElementById('observaciones').value.trim();

    if (!producto || !embarcacion || !pescadorResponsable || Number.isNaN(pesoKg) || Number.isNaN(precioKilo)) {
        mostrarAlertaFormulario(
            'formCrearAlert',
            'Complete todos los campos obligatorios marcados con asterisco (*).'
        );
        return;
    }

    const payload = {
        producto,
        categoria: document.getElementById('categoria').value,
        calidad: document.getElementById('calidad').value,
        embarcacion,
        pescadorResponsable,
        pesoKg,
        precioKilo,
        temperaturaAlmacenamiento: Number.isNaN(temperatura) ? -18 : temperatura,
        destino: document.getElementById('destino').value,
        estado: document.getElementById('estado').value
    };

    if (codigoLote) payload.codigoLote = codigoLote;
    if (observaciones) payload.observaciones = observaciones;

    const btnGuardar = document.getElementById('btnGuardarLote');
    const textoOriginal = btnGuardar.innerHTML;
    btnGuardar.disabled = true;
    btnGuardar.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Guardando...';

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();

        if (!response.ok || !data.ok) {
            const detalleErrores = Array.isArray(data.errores) ? ` (${data.errores.join(' | ')})` : '';
            mostrarAlertaFormulario('formCrearAlert', `${data.msg || 'Error al registrar el lote'}${detalleErrores}`);
            mostrarToast(`Error ${response.status}`, data.msg || 'Revise los datos enviados.', 'danger');
            return;
        }

        document.getElementById('formCrearLote').reset();
        actualizarCampoProductoPersonalizado();
        actualizarPreviewValor('pesoKg', 'precioKilo', 'crearValorPreview');
        mostrarToast(
            `Lote Creado (${response.status} Created)`,
            `Se registró exitosamente el lote ${data.marisco.codigoLote}.`,
            'success'
        );
        await cargarLotes();
    } catch (error) {
        console.error('Error en POST /api/mariscos:', error);
        mostrarAlertaFormulario('formCrearAlert', `Error de conexión con el servidor: ${error.message}`);
    } finally {
        btnGuardar.disabled = false;
        btnGuardar.innerHTML = textoOriginal;
    }
}

// =========================================================================
// OPERACIÓN 4 (UPDATE): GET /api/mariscos/:id + PUT /api/mariscos/:id
// =========================================================================

async function abrirModalEditar(id) {
    mostrarAlertaFormulario('formEditarAlert', '');

    try {
        const response = await fetch(`${API_URL}/${encodeURIComponent(id)}`);
        const data = await response.json();

        if (!response.ok || !data.ok) {
            mostrarToast(`Error ${response.status}`, data.msg || 'No se pudo cargar el lote para editar.', 'danger');
            return;
        }

        const lote = data.marisco;

        document.getElementById('editId').value = lote._id;
        document.getElementById('editCodigoLote').value = lote.codigoLote || '';
        document.getElementById('editProducto').value = lote.producto || '';
        document.getElementById('editCategoria').value = lote.categoria || 'Crustáceos';
        document.getElementById('editCalidad').value = lote.calidad || 'Exportación';
        document.getElementById('editPuertoOrigen').value = lote.puertoOrigen || 'Puerto Pesquero Artesanal de Esmeraldas';
        document.getElementById('editEmbarcacion').value = lote.embarcacion || '';
        document.getElementById('editPescador').value = lote.pescadorResponsable || '';
        document.getElementById('editPesoKg').value = lote.pesoKg ?? '';
        document.getElementById('editPrecioKilo').value = lote.precioKilo ?? '';
        document.getElementById('editTemperatura').value = lote.temperaturaAlmacenamiento ?? -18;
        document.getElementById('editDestino').value = lote.destino || 'Exportación (EE.UU./UE)';
        document.getElementById('editEstado').value = lote.estado || 'Recibido en Muelle';
        document.getElementById('editObservaciones').value = lote.observaciones || '';

        actualizarPreviewValor('editPesoKg', 'editPrecioKilo', 'editValorPreview');
        modalEditar.show();
    } catch (error) {
        console.error('Error al cargar lote para edición:', error);
        mostrarToast('Error de conexión', 'No se pudo obtener la información del lote.', 'danger');
    }
}

async function actualizarLote(event) {
    event.preventDefault();
    mostrarAlertaFormulario('formEditarAlert', '');

    const id = document.getElementById('editId').value;
    const payload = {
        codigoLote: document.getElementById('editCodigoLote').value.trim(),
        producto: document.getElementById('editProducto').value.trim(),
        categoria: document.getElementById('editCategoria').value,
        calidad: document.getElementById('editCalidad').value,
        puertoOrigen: document.getElementById('editPuertoOrigen').value.trim(),
        embarcacion: document.getElementById('editEmbarcacion').value.trim(),
        pescadorResponsable: document.getElementById('editPescador').value.trim(),
        pesoKg: parseFloat(document.getElementById('editPesoKg').value),
        precioKilo: parseFloat(document.getElementById('editPrecioKilo').value),
        temperaturaAlmacenamiento: parseFloat(document.getElementById('editTemperatura').value),
        destino: document.getElementById('editDestino').value,
        estado: document.getElementById('editEstado').value,
        observaciones: document.getElementById('editObservaciones').value.trim()
    };

    if (!payload.codigoLote || !payload.producto || !payload.embarcacion || !payload.pescadorResponsable || Number.isNaN(payload.pesoKg) || Number.isNaN(payload.precioKilo)) {
        mostrarAlertaFormulario('formEditarAlert', 'Complete todos los campos obligatorios antes de guardar.');
        return;
    }

    const btnGuardar = document.getElementById('btnGuardarEdicion');
    const textoOriginal = btnGuardar.innerHTML;
    btnGuardar.disabled = true;
    btnGuardar.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Actualizando...';

    try {
        const response = await fetch(`${API_URL}/${encodeURIComponent(id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();

        if (!response.ok || !data.ok) {
            const detalleErrores = Array.isArray(data.errores) ? ` (${data.errores.join(' | ')})` : '';
            mostrarAlertaFormulario('formEditarAlert', `${data.msg || 'No se pudo actualizar el lote'}${detalleErrores}`);
            mostrarToast(`Error ${response.status}`, data.msg || 'Verifique los datos ingresados.', 'danger');
            return;
        }

        modalEditar.hide();
        mostrarToast(
            `Lote Actualizado (${response.status} OK)`,
            `Se actualizaron los datos del lote ${data.marisco.codigoLote}.`,
            'success'
        );
        await cargarLotes();
    } catch (error) {
        console.error('Error en PUT /api/mariscos/:id:', error);
        mostrarAlertaFormulario('formEditarAlert', `Error de red al actualizar: ${error.message}`);
    } finally {
        btnGuardar.disabled = false;
        btnGuardar.innerHTML = textoOriginal;
    }
}

// =========================================================================
// OPERACIÓN 5 (DELETE): DELETE /api/mariscos/:id
// =========================================================================

function abrirModalEliminar(id, codigoLote, producto) {
    loteIdAEliminar = id;
    document.getElementById('deleteLoteCodigo').textContent = codigoLote || id;
    document.getElementById('deleteLoteProducto').textContent = producto || 'Lote de marisco';
    modalEliminar.show();
}

async function eliminarLoteConfirmado() {
    if (!loteIdAEliminar) return;

    const btnEliminar = document.getElementById('btnConfirmarEliminar');
    const textoOriginal = btnEliminar.innerHTML;
    btnEliminar.disabled = true;
    btnEliminar.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Eliminando...';

    try {
        const response = await fetch(`${API_URL}/${encodeURIComponent(loteIdAEliminar)}`, {
            method: 'DELETE'
        });
        const data = await response.json();

        if (!response.ok || !data.ok) {
            mostrarToast(`Error ${response.status}`, data.msg || 'No se pudo eliminar el lote.', 'danger');
            return;
        }

        modalEliminar.hide();
        mostrarToast(
            `Lote Eliminado (${response.status} OK)`,
            `El lote ${data.marisco?.codigoLote || ''} fue eliminado correctamente.`,
            'warning'
        );
        loteIdAEliminar = null;
        await cargarLotes();
    } catch (error) {
        console.error('Error en DELETE /api/mariscos/:id:', error);
        mostrarToast('Error de conexión', `No se pudo eliminar el lote: ${error.message}`, 'danger');
    } finally {
        btnEliminar.disabled = false;
        btnEliminar.innerHTML = textoOriginal;
    }
}

// =========================================================================
// RECARGA DE DATOS DE MUESTRA (SEED): POST /api/mariscos/seed
// =========================================================================

async function sembrarDatosConfirmado() {
    const btnSeed = document.getElementById('btnConfirmarSeed');
    const textoOriginal = btnSeed.innerHTML;
    btnSeed.disabled = true;
    btnSeed.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Cargando...';

    try {
        const response = await fetch(`${API_URL}/seed`, { method: 'POST' });
        const data = await response.json();

        if (!response.ok || !data.ok) {
            mostrarToast(`Error ${response.status}`, data.msg || 'No se pudieron cargar los datos muestra.', 'danger');
            return;
        }

        modalSeed.hide();
        mostrarToast(
            `Datos Cargados (${response.status} OK)`,
            `Se cargaron ${data.total} lotes representativos de Esmeraldas.`,
            'info'
        );
        await cargarLotes();
    } catch (error) {
        console.error('Error en POST /api/mariscos/seed:', error);
        mostrarToast('Error de conexión', `Error al cargar la muestra: ${error.message}`, 'danger');
    } finally {
        btnSeed.disabled = false;
        btnSeed.innerHTML = textoOriginal;
    }
}

// =========================================================================
// EVENTOS E INICIALIZACIÓN
// =========================================================================

function actualizarCampoProductoPersonalizado() {
    const select = document.getElementById('productoSelect');
    const custom = document.getElementById('productoCustom');
    const esOtro = select.value === 'otro';
    custom.classList.toggle('d-none', !esOtro);
    custom.required = esOtro;
    if (!esOtro) custom.value = '';
}

document.addEventListener('DOMContentLoaded', () => {
    // Inicializar modales Bootstrap
    modalDetalle = new bootstrap.Modal(document.getElementById('modalDetalle'));
    modalEditar = new bootstrap.Modal(document.getElementById('modalEditar'));
    modalEliminar = new bootstrap.Modal(document.getElementById('modalEliminar'));
    modalSeed = new bootstrap.Modal(document.getElementById('modalSeed'));

    // Botones de navegación
    document.getElementById('btnActualizar').addEventListener('click', cargarLotes);
    document.getElementById('btnAbrirSeed').addEventListener('click', () => modalSeed.show());
    document.getElementById('btnConfirmarSeed').addEventListener('click', sembrarDatosConfirmado);

    // Formulario Crear (POST)
    document.getElementById('productoSelect').addEventListener('change', actualizarCampoProductoPersonalizado);
    document.getElementById('formCrearLote').addEventListener('submit', crearLote);
    document.getElementById('btnLimpiarCrear').addEventListener('click', () => {
        mostrarAlertaFormulario('formCrearAlert', '');
        setTimeout(() => {
            actualizarCampoProductoPersonalizado();
            actualizarPreviewValor('pesoKg', 'precioKilo', 'crearValorPreview');
        }, 0);
    });

    // Vista previa en tiempo real de valor total (Crear y Editar)
    ['pesoKg', 'precioKilo'].forEach((id) => {
        document.getElementById(id).addEventListener('input', () => {
            actualizarPreviewValor('pesoKg', 'precioKilo', 'crearValorPreview');
        });
    });

    ['editPesoKg', 'editPrecioKilo'].forEach((id) => {
        document.getElementById(id).addEventListener('input', () => {
            actualizarPreviewValor('editPesoKg', 'editPrecioKilo', 'editValorPreview');
        });
    });

    // Formulario Editar (PUT)
    document.getElementById('formEditarLote').addEventListener('submit', actualizarLote);

    // Acceso rápido desde Modal Detalle hacia Modal Editar
    document.getElementById('btnEditarDesdeDetalle').addEventListener('click', () => {
        if (!loteIdEnDetalle) return;
        const idAEditar = loteIdEnDetalle;
        modalDetalle.hide();
        abrirModalEditar(idAEditar);
    });

    // Confirmación de Eliminación (DELETE)
    document.getElementById('btnConfirmarEliminar').addEventListener('click', eliminarLoteConfirmado);

    // Delegación de eventos para botones de acción en la tabla (Ver / Editar / Eliminar)
    document.getElementById('tablaLotes').addEventListener('click', (event) => {
        const boton = event.target.closest('button[data-action]');
        if (!boton) return;

        const { action, id, codigo, producto } = boton.dataset;
        if (action === 'ver') verDetalleLote(id);
        if (action === 'editar') abrirModalEditar(id);
        if (action === 'eliminar') abrirModalEliminar(id, codigo, producto);
    });

    // Búsqueda y filtros
    document.getElementById('busquedaInput').addEventListener('input', aplicarFiltros);
    document.getElementById('filtroCategoria').addEventListener('change', aplicarFiltros);
    document.getElementById('filtroDestino').addEventListener('change', aplicarFiltros);
    document.getElementById('filtroEstado').addEventListener('change', aplicarFiltros);

    document.getElementById('btnLimpiarFiltros').addEventListener('click', () => {
        document.getElementById('busquedaInput').value = '';
        document.getElementById('filtroCategoria').value = '';
        document.getElementById('filtroDestino').value = '';
        document.getElementById('filtroEstado').value = '';
        aplicarFiltros();
    });

    // Carga inicial de datos desde MongoDB
    cargarLotes();
});
