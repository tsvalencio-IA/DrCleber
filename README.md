# Receita Odontológica Digital — MVP GitHub Pages + Firebase Realtime Database + Cloudinary

Este projeto é um MVP estático para GitHub Pages. Ele usa:

- Firebase Auth para login do cirurgião-dentista.
- Firebase Realtime Database para dados, histórico e validação pública.
- Cloudinary para armazenar os PDFs.
- jsPDF no navegador para gerar o PDF eletrônico inicial.
- Fluxo ICP manual: cirurgião-dentista baixa o PDF, assina fora do sistema com certificado ICP-Brasil e sobe o PDF assinado.

## Atenção sobre validade

Este sistema não assina ICP-Brasil automaticamente no frontend. Para validade criptográfica, o PDF precisa ser assinado por assinador ICP-Brasil externo ou por futura integração com backend/API de assinatura.

Não coloque certificado `.pfx`, senha, token A3, API secret do Cloudinary ou segredo de assinatura dentro do HTML, JavaScript público ou GitHub Pages.

## Arquivos principais

```txt
index.html                       redireciona para public/index.html
public/index.html                tela do sistema
public/validar.html              página pública de validação
public/js/firebase-config.js     Firebase + Cloudinary + UID autorizado
public/js/app.js                 lógica do cirurgião-dentista, PDF, Cloudinary e Realtime Database
public/js/validar.js             leitura pública do registro
firebase/database.rules.json     regras para Realtime Database
firebase/storage.rules           apenas aviso: este MVP não usa Storage
functions/assinarPdf.js          gancho futuro para assinatura automática via backend
```

## Configurar Firebase

1. No Firebase Authentication, ative Email/Password.
2. Crie ou use o cirurgião-dentista com UID:

```txt
s9b9CJPkUYdd5G5O71sGg9ZJSFH2
```

3. No Realtime Database, cole as regras de:

```txt
firebase/database.rules.json
```

## Configurar Cloudinary

1. Entre no Cloudinary.
2. Vá em Settings > Upload.
3. Crie um Upload Preset com Signing Mode = Unsigned.
4. Restrinja o preset para aceitar PDF, se a sua conta/plano permitir.
5. Defina uma pasta padrão, por exemplo:

```txt
receita-odontologica-digital
```

6. Copie o `Cloud name` e o nome do preset.
7. Abra:

```txt
public/js/firebase-config.js
```

8. Preencha:

```js
cloudinary: {
  cloudName: "SEU_CLOUD_NAME",
  uploadPreset: "SEU_UPLOAD_PRESET_UNSIGNED",
  folder: "receita-odontologica-digital",
  resourceType: "raw"
}
```

## Fluxo de uso

1. Cirurgião-dentista faz login.
2. Cadastra paciente.
3. Gera receita.
4. O sistema baixa o PDF e também envia o PDF original não assinado ao Cloudinary.
5. Cirurgião-dentista assina o PDF baixado em assinador ICP-Brasil externo.
6. Cirurgião-dentista volta ao histórico e sobe o PDF assinado.
7. O sistema calcula o hash SHA-256, envia o PDF assinado ao Cloudinary e atualiza a validação pública.
8. Paciente/farmácia abre o link de validação, baixa o PDF assinado e confere no validador oficial.

## Observação de segurança

Com GitHub Pages puro, o Cloudinary precisa usar upload unsigned. Isso funciona para MVP, mas não é o ideal para dados odontológicos sensíveis, porque o arquivo fica acessível por URL. Para produção, use backend/API para upload assinado, entrega privada, autenticação no download, logs, expiração de links e controle de acesso.

Powered by thIAguinho Soluções Digitais
