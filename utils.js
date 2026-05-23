function solicitarPack(pack) {
  // En producción: redirigir a Stripe con el pack seleccionado
  // Por ahora muestra el login si no está logueado
  if (typeof usuarioActual !== 'undefined' && usuarioActual) {
    showToast('En producción aquí se abriría el pago de ' + pack);
  } else {
    abrirLogin();
  }
}
