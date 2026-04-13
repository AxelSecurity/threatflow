import uuid
from sqlalchemy import create_engine, text
import os

# Carichiamo la stringa di connessione dall'ambiente o usiamo il default del progetto
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://tf_user:tf_pass@postgres:5432/threatflow")

engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    print("Verifica e aggiornamento schema tabella node_ioc...")
    try:
        # Aggiunta source_node_id
        conn.execute(text("ALTER TABLE node_ioc ADD COLUMN IF NOT EXISTS source_node_id VARCHAR(64)"))
        # Aggiunta last_seen_at
        conn.execute(text("ALTER TABLE node_ioc ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP"))
        conn.commit()
        print("Migrazione completata con successo!")
    except Exception as e:
        print(f"Errore durante la migrazione: {e}")
