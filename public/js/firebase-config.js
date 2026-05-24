// Firebase do projeto receita-4bb55
// Estes dados podem ficar no frontend. A segurança real vem das regras do Firebase.
// Cirurgião-dentista principal autorizado no MVP: UID abaixo.

window.APP_CONFIG = {
  appName: "Receita Odontológica Digital",
  dentistaUidAutorizado: "s9b9CJPkUYdd5G5O71sGg9ZJSFH2",
  validationBaseUrl: "", // deixe vazio para o sistema detectar automaticamente no GitHub Pages
  firebaseConfig: {
    apiKey: "AIzaSyCNgLRgbKXYhjy3PqCotUvuzpKrJxvAxsI",
    authDomain: "receita-4bb55.firebaseapp.com",
    databaseURL: "https://receita-4bb55-default-rtdb.firebaseio.com",
    projectId: "receita-4bb55",
    messagingSenderId: "382106677358",
    appId: "1:382106677358:web:206ff95918bd13b9bf367f"
  },

  // Cloudinary substitui Firebase Storage neste MVP.
  // Crie um Upload Preset UNSIGNED no Cloudinary, restrito a PDF, e cole aqui.
  // Em produção odontológica, o ideal é usar upload assinado/backend para arquivos privados.
  cloudinary: {
    cloudName: "COLE_SEU_CLOUD_NAME_AQUI",
    uploadPreset: "COLE_SEU_UPLOAD_PRESET_UNSIGNED_AQUI",
    folder: "receita-odontologica-digital",
    resourceType: "raw"
  }
};
