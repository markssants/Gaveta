# 🗄️ Gaveta

**Feche as abas. Guarde na gaveta.**

Painel pessoal para salvar links organizados por categorias ("gavetas"), feito para quem acumula centenas de abas abertas.

## Funcionalidades

- **Início**: atalhos para as gavetas, links mais visitados, alguns favoritos e as listas **Importante** (bandeira) e **Ver depois** (relógio), marcadas pelos ícones de cada card
- **Gavetas** com nome, emoji e cor, além de **Caixa de entrada** (links ainda não organizados) e **Favoritos**
- **Guardar rápido**: cole um ou vários links de uma vez (um por linha ou separados por espaço) e aperte Enter; o título da página é buscado automaticamente
- **O título fica congelado**: ele é gravado no momento em que você salva e nunca é atualizado depois. Se um vídeo for removido, o card continua mostrando o nome original. Vídeos do YouTube e do Vimeo são salvos como `Título · Canal`
- **Importar abas em massa**: cole uma lista de links (um por linha, ou no formato do OneTab `url | título`). Links repetidos são ignorados
- **Miniatura congelada**: a imagem é gravada no momento em que você salva e só muda se você clicar no ícone de recarregar do card. A extensão tira um print da aba atual; nos outros casos, o Gaveta usa a imagem de preview do site (no YouTube e no Vimeo, a capa do vídeo)
- **Subpastas**: crie gavetas dentro de gavetas, em quantos níveis quiser. Ao excluir uma, os links e subpastas dela sobem um nível
- **Agrupamento automático por site** (ligue nas configurações): links guardados sem escolher gaveta vão sozinhos para a gaveta do site, como YouTube, e as gavetas criadas assim ficam na seção **Sites** da barra lateral
- **Arrastar e soltar**:
  - arraste um card para uma gaveta na barra lateral para mover o link
  - arraste um link de outra aba ou da barra de endereço para dentro do painel para guardar
- **Botão de favoritos (bookmarklet)**: guarda a página atual de qualquer site em um popup
- **Busca** em título, URL, nota e nome da gaveta (atalho `/`). Atalho `n` abre um link novo
- Avisa quando um link já foi salvo
- Login com Google, sincronização em tempo real entre dispositivos e cache offline
- Exportação de backup em JSON
- Tema claro e escuro automáticos, funciona no celular

## Stack

Vite + React + TypeScript · Firebase Auth + Firestore · Vercel (site estático + 1 função serverless em `api/title.js`)

---

## Configuração

### 1. Firebase

1. Crie um projeto em <https://console.firebase.google.com>
2. **Authentication** → *Começar* → *Sign-in method* → ative **Google**
3. **Firestore Database** → *Criar banco de dados* (modo produção, região `southamerica-east1` se estiver no Brasil)
4. Em **Firestore → Regras**, cole o conteúdo de [`firestore.rules`](firestore.rules) e publique
5. **Configurações do projeto** (⚙️) → *Seus apps* → adicione um app **Web** (`</>`) e copie o objeto `firebaseConfig`

### 2. Rodar localmente

```bash
npm install
cp .env.example .env.local   # preencha com os valores do firebaseConfig
npm run dev
```

Abra <http://localhost:5180>. O `localhost` já vem autorizado no Firebase Auth.

### 3. Deploy no Vercel

1. Suba o repositório para o GitHub
2. Em <https://vercel.com/new>, importe o repositório (o Vercel detecta Vite sozinho)
3. Em **Environment Variables**, adicione as 6 variáveis `VITE_FIREBASE_*` do `.env.example`
4. Faça o deploy
5. No Firebase: **Authentication → Configurações → Domínios autorizados** → adicione o domínio do Vercel (ex.: `gaveta.vercel.app`). Sem isso, o login com Google falha em produção

> A `apiKey` do Firebase não é secreta: ela identifica o projeto. O que protege os dados são as **regras do Firestore**, em que cada usuário só acessa os próprios documentos.

---

## Extensão do navegador

A pasta [`extension/`](extension/) tem uma extensão que funciona no **Firefox** e nos navegadores baseados em Chromium (**Vivaldi**, Chrome, Edge, Brave, Opera). É o mesmo código para todos:

- **Escolher ou criar a gaveta no próprio popup**, incluindo subpastas. A lista é atualizada sempre que você abre o site do Gaveta, e a última escolha fica lembrada
- **Guardar esta aba**: guarda direto na gaveta escolhida. Para editar título e nota antes, use *Editar título e nota antes de guardar*
- **Guardar todas as abas desta janela**: abre o Gaveta com a lista pronta para importar (abas fixadas ficam de fora)
- **Fechar as abas depois de guardar** (opcional): as abas só fecham depois que o Gaveta confirma que gravou no banco. Se você cancelar ou der erro, nenhuma aba fecha
- Usa o título da aba aberta, ou seja, o título exato daquele momento
- Atalho `Alt+Shift+G` e menu do botão direito em páginas e links

**Pelo próprio site:** clique em **Instalar extensão** (barra lateral ou configurações). O site detecta o navegador, oferece o download e mostra o passo a passo. Nada passa por loja: o `.zip` (Chromium) e o `.xpi` (Firefox) são gerados sozinhos a cada `npm run dev`/`npm run build` (`scripts/pack-extension.mjs`). No Vercel, ele já vem com o endereço do site preenchido.

Depois de instalar, a extensão abre uma tela pedindo o endereço do seu Gaveta (ex.: `https://gaveta.vercel.app` ou `http://localhost:5180`). Informe e clique em **Permitir**.

### Vivaldi (e outros Chromium)

1. Abra `vivaldi://extensions` (no Chrome: `chrome://extensions`) e ative o **Modo do desenvolvedor**
2. Clique em **Carregar sem compactação** e selecione a pasta `extension`
3. O ícone aparece na barra de endereço. Clique com o botão direito para fixar ou mover

> Se mudar algo no código da extensão, clique em ↻ no card dela na página de extensões.

### Firefox

Sem loja e sem conta na Mozilla. O site gera um `.xpi` não assinado (`public/downloads/gaveta-firefox.xpi`):

- **Firefox Developer Edition, Nightly ou ESR** (instalação permanente): em `about:config`, mude `xpinstall.signatures.required` para `false`. Depois arraste o `.xpi` para o Firefox, ou use `about:addons` → ⚙ → *Instalar extensão a partir de arquivo*
- **Firefox comum**: ele não aceita extensões sem assinatura de forma permanente. Use `about:debugging#/runtime/this-firefox` → *Carregar extensão temporária* e escolha o `.xpi`. A extensão some quando o Firefox fecha

Para desenvolver: `npm run ext:firefox` abre um Firefox separado com a extensão carregada.

## Dicas de uso

**Esvaziar o navegador:** use a extensão do Gaveta (**Guardar todas as abas desta janela**). Também dá para colar uma lista de links em **Importar**. Tudo vai para a Caixa de entrada e você organiza depois arrastando os cards para as gavetas.

**Bookmarklet:** clique no seu avatar (canto superior direito) e arraste o botão **Guardar na Gaveta** para a barra de favoritos.

## Estrutura dos dados

```
users/{uid}/categories/{id}  → { name, emoji, color, order, createdAt, parentId?, domain? }
users/{uid}/links/{id}       → { url, title, note, categoryId | null, favorite, createdAt, hasThumb? }
users/{uid}/thumbs/{id}      → { data }  (miniatura em base64, mesmo id do link)
users/{uid}/meta/settings    → { autoGroup }
```
