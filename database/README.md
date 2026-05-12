# GestoResto PostgreSQL

Base local no servidor:

```bash
sudo -u postgres createdb gestoresto
sudo -u postgres psql -d gestoresto -f database/schema.sql
```

O arquivo físico fica em `/mnt/bunker/resto`; a tabela `digital_archive_documents` guarda os metadados e caminhos.
