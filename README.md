# 🗄️ Gaveta

**Feche as abas. Guarde na gaveta.**

Painel pessoal para salvar links organizados por categorias ("gavetas"), feito para quem acumula centenas de abas abertas.

## Funcionalidades

- **Gavetas** com nome, emoji e cor, além de **Caixa de entrada** (links ainda não organizados) e **Favoritos**
- **Guardar rápido**: cole um link e aperte Enter; o título da página é buscado automaticamente
- **Importar abas em massa**: cole uma lista de links (um por linha, ou no formato do OneTab `url | título`). Links repetidos são ignorados
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

Abra <http://localhost:5173>. O `localhost` já vem autorizado no Firebase Auth.

### 3. Deploy no Vercel

1. Suba o repositório para o GitHub
2. Em <https://vercel.com/new>, importe o repositório (o Vercel detecta Vite sozinho)
3. Em **Environment Variables**, adicione as 6 variáveis `VITE_FIREBASE_*` do `.env.example`
4. Faça o deploy
5. No Firebase: **Authentication → Configurações → Domínios autorizados** → adicione o domínio do Vercel (ex.: `gaveta.vercel.app`). Sem isso, o login com Google falha em produção

> A `apiKey` do Firebase não é secreta: ela identifica o projeto. O que protege os dados são as **regras do Firestore**, em que cada usuário só acessa os próprios documentos.

---

## Dicas de uso

**Esvaziar o navegador:** instale uma extensão como *Copy All URLs* ou *OneTab*, copie todas as abas, clique em **Importar** e cole. Tudo vai para a Caixa de entrada e você organiza depois arrastando os cards para as gavetas.

**Bookmarklet:** clique no seu avatar (canto superior direito) e arraste o botão **Guardar na Gaveta** para a barra de favoritos.

## Estrutura dos dados

```
users/{uid}/categories/{id}  → { name, emoji, color, order, createdAt }
users/{uid}/links/{id}       → { url, title, note, categoryId | null, favorite, createdAt }
```
