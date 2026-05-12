<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1ypBh7TOXJUZ3HVspoy1GhB7APFQpLhqG

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Preparar para Supabase (opcional)

Este projeto já funciona em modo "local" (state em React). Para guardar **fotos de suporte** (faturas/comprovativos) e preparar persistência em **Supabase**, foram adicionados:

- `supabaseClient.ts` (cliente opcional)
- `supabaseStorage.ts` (upload de imagens a partir de data URL)
- `supabase/schema.sql` (esquema base de tabelas)

### Passos

1) Instale deps:
`npm install`

2) Configure as variáveis no `.env.local`:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_BUCKET` (por defeito: `gestoresto`)

3) No painel do Supabase:
- Execute o SQL de `supabase/schema.sql`
- Crie o bucket indicado (ex: `gestoresto`)
  - Para o MVP, marque o bucket como **público**
  - Se preferir privado, terá de gerar **Signed URLs** no frontend

> Nota: neste momento o app já tenta subir as imagens para Storage quando as variáveis estão configuradas. A persistência completa (CRUD nas tabelas) fica pronta para a próxima iteração.

## Arquivo digital e PostgreSQL

O esquema PostgreSQL em `supabase/schema.sql` já inclui:

- aliases/equivalências por fornecedor (`product_aliases`)
- conversões de unidades (`unit_conversions`)
- linhas estruturadas de fatura (`purchase_invoice_lines`)
- arquivo digital (`digital_archive_documents`)
- índices para pesquisa, unicidade, histórico e paginação

No servidor, o disco 2 está montado em `/mnt/bunker`. Foi criada a pasta:

`/mnt/bunker/resto`

Subpastas:

- `/mnt/bunker/resto/faturas`
- `/mnt/bunker/resto/comprovativos`
- `/mnt/bunker/resto/imports`
- `/mnt/bunker/resto/tmp`

Nota técnica: uma app Vite/React a correr no browser não consegue gravar diretamente em `/mnt/bunker/resto`. Para arquivo local real nesse disco, o próximo passo é criar uma API pequena no servidor que receba o ficheiro, grave no bunker e devolva o caminho para guardar em `digital_archive_documents`. Enquanto isso, a app mantém compatibilidade com Supabase Storage.
