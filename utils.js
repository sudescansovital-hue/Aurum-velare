function solicitarPack(pack) {
  if (!window.usuarioActual) {
    if (typeof abrirLogin === 'function') abrirLogin();
    if (typeof showToast === 'function') showToast('Regístrate o entra antes de continuar.');
    return;
  }
  var links = {
    'umbral': 'https://buy.stripe.com/6oU8wR2FRd4bdWa4dY3ZK01',
    'raiz':   'https://buy.stripe.com/3cI8wR0xJ1lt2dscKu3ZK02',
    'senda':  null,
    'cima':   null,
    'vip':    null
  };
  if (links[pack] === null) {
    if (typeof showToast === 'function') showToast('Próximamente disponible.');
    return;
  }
  if (links[pack]) {
    window.open(links[pack], '_blank');
  }
}
