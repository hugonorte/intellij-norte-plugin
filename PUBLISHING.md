# Publicar o Norte no JetBrains Marketplace

Passo a passo para publicar o plugin a partir de um computador **Ubuntu**. Os comandos são para o terminal (bash).

**Situação atual**

| Item | Estado |
|---|---|
| ID `com.hugonorte.norte`, nome `Norte`, vendor `Hugo Norte <norte.plugin@nortte.com>`, versão `1.0.0` | Pronto |
| Descrição e change notes (geradas a partir do `CHANGELOG.md`) | Pronto |
| Conta no Marketplace (login feito, perfil "Hugo Norte") | Pronto |
| Certificado de assinatura | **A fazer** (passo 2) |
| `.zip` assinado, testado e enviado | **A fazer** (passos 3 a 5) |

O `build.gradle.kts` já lê a assinatura e o token de variáveis de ambiente: `CERTIFICATE_CHAIN`, `PRIVATE_KEY`, `PRIVATE_KEY_PASSWORD` e `PUBLISH_TOKEN`. Nada disso deve ser gravado em arquivo dentro do projeto.

---

## 1. Preparar o Ubuntu

```bash
sudo apt update
sudo apt install -y git openssl unzip openjdk-21-jdk
java -version      # deve mostrar 21 ou mais novo
openssl version
```

Node.js só é necessário para **regenerar** as cores (pasta `converter/`). Para assinar e publicar, não precisa: os temas gerados já estão no repositório.

Traga o projeto para o computador (clone do repositório ou cópia da pasta) e entre nele:

```bash
cd ~/intellij-norte-theme      # ajuste para onde o projeto ficou
chmod +x gradlew               # garante a permissão de execução
./gradlew --version            # baixa o Gradle na primeira vez
```

---

## 2. Gerar o certificado de assinatura

Sem assinatura o plugin instala, mas o usuário vê um aviso de plugin não assinado. As chaves ficam **fora do projeto**, numa pasta só sua:

```bash
mkdir -p ~/.norte-signing
chmod 700 ~/.norte-signing
cd ~/.norte-signing
```

Chave privada RSA 4096, criptografada com senha:

```bash
openssl genpkey -aes-256-cbc -algorithm RSA -out private_encrypted.pem -pkeyopt rsa_keygen_bits:4096
```

O comando pede a senha duas vezes, e nada aparece enquanto você digita. Guarde a senha num gerenciador de senhas: sem ela, a chave não serve para nada.

Certificado autoassinado válido por 10 anos:

```bash
openssl req -key private_encrypted.pem -new -x509 -days 3650 -out chain.crt
```

O comando pede a senha da chave e faz algumas perguntas:

| Pergunta | Resposta |
|---|---|
| Country Name | `BR` |
| State / Locality / Organization / Organizational Unit | Enter (vazio) |
| **Common Name** | `Hugo Norte` |
| Email Address | `norte.plugin@nortte.com` |

Proteja os arquivos e confira:

```bash
chmod 600 ~/.norte-signing/*
ls -l ~/.norte-signing
openssl x509 -in ~/.norte-signing/chain.crt -noout -subject -enddate
```

Devem existir `chain.crt` e `private_encrypted.pem`, e o certificado deve mostrar `CN = Hugo Norte` e uma data de validade daqui a 10 anos.

**Backup:** guarde uma cópia de `~/.norte-signing` (os dois arquivos) num lugar seguro e offline, por exemplo um pendrive criptografado ou o cofre do gerenciador de senhas. Todas as versões futuras devem ser assinadas com o mesmo certificado.

---

## 3. Gerar o `.zip` assinado

Carregue as variáveis **na sessão atual do terminal**. Os arquivos vão em Base64 numa linha só, e o plugin do Gradle decodifica sozinho. A senha é lida sem eco e não fica no histórico do bash:

```bash
export CERTIFICATE_CHAIN="$(base64 -w0 ~/.norte-signing/chain.crt)"
export PRIVATE_KEY="$(base64 -w0 ~/.norte-signing/private_encrypted.pem)"
read -rs -p "Senha da chave: " PRIVATE_KEY_PASSWORD && echo && export PRIVATE_KEY_PASSWORD
```

Gere, assine e verifique:

```bash
cd ~/intellij-norte-theme
./gradlew buildPlugin signPlugin verifyPluginSignature
ls -l build/distributions/
```

Em `build/distributions/` devem aparecer dois arquivos: `norte-1.0.0.zip` (sem assinatura) e o assinado, com `-signed` no nome. **O arquivo para enviar é o `-signed`.**

Se `verifyPluginSignature` falhar, confira se as três variáveis estão definidas (`echo ${#PRIVATE_KEY}` deve mostrar um número grande) e se a senha está certa.

Ao terminar, você pode limpar as variáveis:

```bash
unset CERTIFICATE_CHAIN PRIVATE_KEY PRIVATE_KEY_PASSWORD
```

---

## 4. Testar o pacote assinado

Numa IDE JetBrains 2025.3 ou mais nova (IntelliJ IDEA, PyCharm, WebStorm…):

1. **Settings → Plugins → ⚙ → Install Plugin from Disk…**
2. Escolha o `.zip` com `-signed` no nome.
3. Confira que **não** aparece aviso de plugin não assinado.
4. Em **Settings → Appearance & Behavior → Appearance → Theme**, troque entre as 5 variantes: Norte, Norte Bright, Norte Italic, Norte Bright Italic e Norte Light.
5. Abra alguns arquivos de código e confira o esquema de cores do editor em cada variante.

---

## 5. Primeiro envio (manual, pelo site)

A primeira versão de um plugin **só pode ser enviada pelo site**; o Gradle só publica a partir da segunda.

1. Em https://plugins.jetbrains.com, abra o seu perfil e clique em **Upload Plugin to Marketplace**.
2. Aceite o **Developer Agreement** se o site pedir.
3. Se o site pedir o **Vendor ID**, escolha com cuidado: **ele não pode ser alterado depois**. Sugestão: `hugonorte`.
4. Preencha o formulário:

| Campo | Valor |
|---|---|
| Arquivo | o `.zip` com `-signed` no nome |
| License | MIT |
| Category | Themes |
| Tags | `theme`, `dark theme`, `light theme` |
| Source code URL | opcional (só se o repositório for público) |

5. Envie. Plugins novos costumam passar por uma moderação da JetBrains antes de ficarem públicos; acompanhe pelo perfil e pelo e-mail `norte.plugin@nortte.com`.
6. Depois de aprovado, adicione capturas na página do plugin. Bons candidatos em `docs/screenshots/`: `NRT-java.png`, `NRT-Light-java.png`, `NRT-Italic-html.png`, `NRT-md.png`.

---

## 6. Versões seguintes (automático, pelo Gradle)

### 6.1 Token (uma vez)
No perfil do Marketplace, aba **Tokens** → **Generate Token**. Copie o token na hora: ele só é mostrado uma vez. Guarde-o no gerenciador de senhas.

### 6.2 Publicar uma nova versão
1. Aumente `pluginVersion` em `gradle.properties`, por exemplo `1.0.1`. O Marketplace não aceita repetir uma versão.
2. Adicione a seção da versão no topo do `CHANGELOG.md`, por exemplo `## [1.0.1] - AAAA-MM-DD` com os itens em `### Fixed`, `### Changed` etc. O build **falha** se essa seção não existir, porque ela vira as change notes da página.
3. Se as cores mudaram, regenere os temas (exige Node.js 18+ e o `converter/sources.local.json` configurado; veja o README):
   ```bash
   cd converter && npm test && npm run build && cd ..
   ```
4. Faça commit das mudanças.
5. Carregue as variáveis de assinatura (passo 3) e o token, e publique:
   ```bash
   read -rs -p "Token do Marketplace: " PUBLISH_TOKEN && echo && export PUBLISH_TOKEN
   ./gradlew publishPlugin
   ```
   O `publishPlugin` assina o pacote antes de enviar.

---

## Segurança

- **Nunca** faça commit de `chain.crt`, `private_encrypted.pem`, da senha ou do token, nem os coloque em `gradle.properties`, scripts ou CI sem um cofre de segredos.
- Se a chave privada vazar: gere um certificado novo (passo 2), passe a assinar com ele e revogue o token no Marketplace, se ele também tiver vazado.
- O certificado vale 10 anos (`-days 3650`). Para renovar, gere um novo com o mesmo comando antes do vencimento.

## Referências
- [Publishing a Plugin](https://plugins.jetbrains.com/docs/intellij/publishing-plugin.html)
- [Plugin Signing](https://plugins.jetbrains.com/docs/intellij/plugin-signing.html)
- [Marketplace: Organizations / vendor profile](https://plugins.jetbrains.com/docs/marketplace/organizations.html)
