# GestoResto

Gestao de stock, fornecedores, pagamentos e arquivo digital de faturas para restaurante.

## Arquitetura

- Frontend: React + Vite
- API local: Express em `server/`
- Base de dados: PostgreSQL local do servidor
- Arquivo digital: `/mnt/bunker/resto`

O Supabase foi removido do fluxo principal. A fonte de verdade passa a ser PostgreSQL local.

## Arranque

1. Instalar dependencias:

```bash
npm install
```

2. Criar/aplicar base de dados:

```bash
sudo -u postgres createdb gestoresto
sudo -u postgres psql -d gestoresto -f database/schema.sql
```

3. Garantir arquivo no disco 2:

```bash
mkdir -p /mnt/bunker/resto/{faturas,comprovativos,imports,tmp}
```

4. Correr API:

```bash
npm run api
```

5. Correr frontend:

```bash
npm run dev
```

## Variaveis

Pode usar `.env.local`:

```bash
GEMINI_API_KEY=...
PGDATABASE=gestoresto
PGUSER=ubuntu
PGHOST=/var/run/postgresql
ARCHIVE_ROOT=/mnt/bunker/resto
API_PORT=8790
VITE_API_URL=
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
INVOICE_OK_EMAIL_TO=geral@mrebelo.com
IMAP_HOST=
IMAP_PORT=993
IMAP_SECURE=true
IMAP_USER=
IMAP_PASS=
IMAP_MAILBOX=INBOX
```

Em desenvolvimento, o Vite encaminha `/api` para `http://localhost:8790`.

## Vercel

O Vercel hospeda apenas o frontend. A API e o PostgreSQL ficam no servidor.

Para o site `gestoresto.vercel.app` funcionar, a API do servidor tem de estar publicada por HTTPS.

Por defeito, o frontend em produção usa:

```bash
https://gestoresto.mpr.pt
```

Se quiser alterar, defina no Vercel:

```bash
VITE_API_URL=https://gestoresto.mpr.pt
```

Depois de alterar a variável no Vercel, faça novo deploy.

Sem `VITE_API_URL`, o frontend tenta chamar `/api` dentro do Vercel e recebe `NOT_FOUND`.

Reverse proxy Nginx:

```bash
deploy/nginx/gestoresto-api.conf
```

## Funcionalidades estruturais

- `database/schema.sql`: schema PostgreSQL local.
- `server/routes/archive.js`: upload real para `/mnt/bunker/resto`.
- `server/routes/invoices.js`: entrada transacional de fatura.
- `product_aliases`: equivalencias por fornecedor.
- `product_unit_conversions`: conversoes especificas por artigo/fornecedor.
- `purchase_invoice_lines`: linhas estruturadas de fatura.
- `digital_archive_documents`: metadados do arquivo digital.
- `app_users`: autenticacao simples.
- `audit_log`: auditoria de alteracoes criticas.
- `restaurant_profile`: dados locais do restaurante usados para validar se o NIF do cliente na fatura corresponde ao restaurante.

## Backup

Scripts em `scripts/`:

```bash
./scripts/backup.sh
./scripts/restore.sh /mnt/bunker/resto/backups/<ficheiro>.dump /mnt/bunker/resto/backups/<arquivo>.tar.gz
```

## Serviço API

Para deixar a API a arrancar sozinha:

```bash
./scripts/install-systemd.sh
```

Logs:

```bash
journalctl -u gestoresto-api -f
```

Remover serviço:

```bash
./scripts/uninstall-systemd.sh
```

## Email

Para envio real de relatórios por email, configure SMTP:

```bash
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

Se SMTP não estiver configurado, o sistema regista o email como `SIMULADO`, para testar o fluxo sem perder histórico.

Quando uma fatura é guardada com sucesso, a API envia/regista automaticamente um email para:

```bash
INVOICE_OK_EMAIL_TO=geral@mrebelo.com
```

IMAP serve para ler/receber emails de uma caixa. O envio continua a usar SMTP:

```bash
IMAP_HOST=
IMAP_PORT=993
IMAP_SECURE=true
IMAP_USER=
IMAP_PASS=
IMAP_MAILBOX=INBOX
```
