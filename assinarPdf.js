/*
  PONTO FUTURO PARA ASSINATURA ICP-BRASIL AUTOMÁTICA

  Este arquivo NÃO é usado no GitHub Pages.
  GitHub Pages é somente frontend e não pode guardar certificado A1, senha, token A3 ou credenciais de API.

  Fluxo correto com backend/API:
  1. Receber receitaId e dentistaUid autenticado.
  2. Buscar PDF original no Cloudinary ou armazenamento privado.
  3. Enviar PDF/hash para provedor de assinatura ICP-Brasil.
  4. Cirurgião-dentista autoriza no certificado em nuvem/token/app.
  5. Receber PDF assinado.
  6. Calcular hash SHA-256.
  7. Salvar PDF assinado no Cloudinary ou armazenamento privado.
  8. Atualizar receitasPrivadas e receitasPublicas.

  Nunca coloque .pfx, .p12, senha ou client_secret no frontend.
*/

exports.assinarPdf = async function assinarPdfPlaceholder(req, res) {
  res.status(501).json({
    ok: false,
    message: "Assinatura ICP automática exige backend/API de assinatura. Use o fluxo manual do MVP ou implemente este endpoint em Cloud Functions/servidor seguro."
  });
};
