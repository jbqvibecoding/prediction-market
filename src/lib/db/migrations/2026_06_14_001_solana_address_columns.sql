-- Widen fixed-length EVM address/hash columns to text so they can hold base58
-- Solana public keys (~44 chars) and transaction signatures (~88 chars).
-- EVM values (0x addresses/hashes) still fit. Idempotent: only alters columns
-- that are still character/varchar.
DO $$
DECLARE
  col record;
BEGIN
  FOR col IN
    SELECT * FROM (VALUES
      ('conditions', 'creator'),
      ('conditions', 'uma_request_tx_hash'),
      ('conditions', 'uma_oracle_address'),
      ('conditions', 'mirror_uma_request_tx_hash'),
      ('conditions', 'mirror_uma_oracle_address'),
      ('events', 'creator'),
      ('event_creations', 'wallet_address'),
      ('markets', 'resolver')
    ) AS t(table_name, column_name)
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_name = col.table_name
        AND c.column_name = col.column_name
        AND c.data_type IN ('character', 'character varying')
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ALTER COLUMN %I TYPE text',
        col.table_name,
        col.column_name
      );
    END IF;
  END LOOP;
END $$;
