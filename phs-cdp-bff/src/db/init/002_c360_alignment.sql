-- ============================================================
-- PHS CDP — Migration 002: C360 Schema Alignment
-- Aligns CDP tables with DWH C360 Data Model (v28/10/2026)
-- Table naming convention:
--   c360_* = mirrors DWH C360 tables (future: swap connection string to DWH)
--   cdp_*  = CDP-only tables (BFF-managed, no DWH equivalent)
-- ============================================================

-- ─── 1. ALTER cdp_customers — add C360 identity & profile fields ──────────
-- Rename phs_account_id → c360_customer_id to match DWH primary key name
ALTER TABLE cdp_customers
  RENAME COLUMN phs_account_id TO c360_customer_id;

-- C360 Group A: Identity fields
ALTER TABLE cdp_customers
  ADD COLUMN IF NOT EXISTS customer_type        VARCHAR(32)
      CHECK (customer_type IN ('domestic_individual','foreign_individual','organization')),
  ADD COLUMN IF NOT EXISTS app_user_id          VARCHAR(128),
  ADD COLUMN IF NOT EXISTS xpro_user_id         VARCHAR(128),
  ADD COLUMN IF NOT EXISTS zalo_user_id         VARCHAR(128),
  ADD COLUMN IF NOT EXISTS cloudgo_contact_id   VARCHAR(128),
  ADD COLUMN IF NOT EXISTS email_verified       BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_source         VARCHAR(64),
  ADD COLUMN IF NOT EXISTS mobile_otp_number    VARCHAR(50),
  -- C360 Group B: Personal Profile & KYC fields
  ADD COLUMN IF NOT EXISTS salutation           VARCHAR(16),
  ADD COLUMN IF NOT EXISTS gender               VARCHAR(16),
  ADD COLUMN IF NOT EXISTS birth_date           DATE,
  ADD COLUMN IF NOT EXISTS birthday_dd_mm       VARCHAR(5),
  ADD COLUMN IF NOT EXISTS age_band             VARCHAR(16),
  ADD COLUMN IF NOT EXISTS occupation           VARCHAR(128),
  ADD COLUMN IF NOT EXISTS province             VARCHAR(128),
  ADD COLUMN IF NOT EXISTS account_open_date    DATE,
  ADD COLUMN IF NOT EXISTS open_channel         VARCHAR(64),
  ADD COLUMN IF NOT EXISTS acquisition_source   VARCHAR(128),
  ADD COLUMN IF NOT EXISTS referral_code        VARCHAR(64),
  ADD COLUMN IF NOT EXISTS branch_code          VARCHAR(32),
  ADD COLUMN IF NOT EXISTS kyc_last_update      DATE,
  ADD COLUMN IF NOT EXISTS professional_investor BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS preferred_language   VARCHAR(16) DEFAULT 'vi',
  -- CDP-managed status fields
  ADD COLUMN IF NOT EXISTS account_status       VARCHAR(32) DEFAULT 'lead'
      CHECK (account_status IN ('lead','active','dormant','churned','suspended')),
  ADD COLUMN IF NOT EXISTS converted_at         TIMESTAMP WITH TIME ZONE;

-- Drop old lifecycle CHECK constraint and add new one aligned with C360
ALTER TABLE cdp_customers DROP CONSTRAINT IF EXISTS cdp_customers_lifecycle_stage_check;
ALTER TABLE cdp_customers
  ADD CONSTRAINT cdp_customers_lifecycle_stage_check
  CHECK (lifecycle_stage IN (
    'prospect','lead','ekyc','account_opening','funding',
    'first_trade','active_investor','vip','dormant','churn_risk','reactivation',
    -- C360 Group Q values:
    'newly_opened','unfunded','no_trade','active','declining','churned'
  ));

-- New indexes
CREATE INDEX IF NOT EXISTS idx_customers_c360_customer_id  ON cdp_customers(c360_customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_app_user_id       ON cdp_customers(app_user_id);
CREATE INDEX IF NOT EXISTS idx_customers_zalo_user_id      ON cdp_customers(zalo_user_id);
CREATE INDEX IF NOT EXISTS idx_customers_account_status    ON cdp_customers(account_status);

-- ─── 2. ALTER cdp_identities — add tier & priority for identity hierarchy ─
ALTER TABLE cdp_identities
  ADD COLUMN IF NOT EXISTS tier     SMALLINT DEFAULT 3
      CHECK (tier IN (1, 2, 3)),
  ADD COLUMN IF NOT EXISTS priority SMALLINT DEFAULT 99,
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE;

-- Expand identifier_type to include C360 identifiers
ALTER TABLE cdp_identities DROP CONSTRAINT IF EXISTS cdp_identities_identifier_type_check;
ALTER TABLE cdp_identities
  ADD CONSTRAINT cdp_identities_identifier_type_check
  CHECK (identifier_type IN (
    'phs_account_id',
    'national_id_hash',
    'phone',
    'email',
    'idfa',
    'idfv',
    'gaid',
    'anonymous_id',
    'app_user_id',
    'xpro_user_id',
    'zalo_id',
    'cloudgo_contact_id'
  ));

-- ─── 3. CREATE c360_event — Group S: Event Stream ─────────────────────────
CREATE TABLE IF NOT EXISTS c360_event (
  event_id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id            VARCHAR(20),
  cdp_customer_uuid      UUID REFERENCES cdp_customers(id) ON DELETE SET NULL,
  anonymous_id           VARCHAR(100),
  event_name             VARCHAR(50)  NOT NULL,
  event_category         VARCHAR(30),
  platform               VARCHAR(20),
  app_version            VARCHAR(20),
  screen_name            VARCHAR(100),
  channel                VARCHAR(20),
  properties             JSONB DEFAULT '{}',
  occurred_at            TIMESTAMPTZ NOT NULL,
  received_at            TIMESTAMPTZ DEFAULT NOW(),
  session_id             VARCHAR(100),
  confidence_score       SMALLINT DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 100),
  rudderstack_message_id VARCHAR(100),
  CONSTRAINT uq_c360_event_rs_message_id UNIQUE (rudderstack_message_id)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS idx_c360_event_customer_id      ON c360_event(customer_id);
CREATE INDEX IF NOT EXISTS idx_c360_event_anonymous_id     ON c360_event(anonymous_id);
CREATE INDEX IF NOT EXISTS idx_c360_event_name             ON c360_event(event_name);
CREATE INDEX IF NOT EXISTS idx_c360_event_occurred_at      ON c360_event(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_c360_event_category         ON c360_event(event_category);
CREATE INDEX IF NOT EXISTS idx_c360_event_cdp_uuid         ON c360_event(cdp_customer_uuid);

-- Keep cdp_events columns in sync
ALTER TABLE cdp_events
  ADD COLUMN IF NOT EXISTS platform              VARCHAR(20),
  ADD COLUMN IF NOT EXISTS app_version           VARCHAR(20),
  ADD COLUMN IF NOT EXISTS screen_name           VARCHAR(100),
  ADD COLUMN IF NOT EXISTS received_at           TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS confidence_score      SMALLINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rs_message_id         VARCHAR(255),
  ADD COLUMN IF NOT EXISTS rs_job_id             BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_rs_message_id
  ON cdp_events(rs_message_id)
  WHERE rs_message_id IS NOT NULL;

-- ─── 4. CREATE cdp_identity_config — Admin-configurable identity hierarchy ─
CREATE TABLE IF NOT EXISTS cdp_identity_config (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identifier_type  VARCHAR(64) NOT NULL UNIQUE,
  display_name     VARCHAR(128) NOT NULL,
  tier             SMALLINT NOT NULL CHECK (tier IN (1, 2, 3)),
  priority         SMALLINT NOT NULL DEFAULT 99,
  merge_strategy   VARCHAR(32) NOT NULL DEFAULT 'track_only'
      CHECK (merge_strategy IN ('permanent','pre_account','track_only')),
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  description      TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_identity_config_tier     ON cdp_identity_config(tier);
CREATE INDEX IF NOT EXISTS idx_identity_config_active   ON cdp_identity_config(is_active);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_cdp_identity_config_updated_at'
  ) THEN
    CREATE TRIGGER update_cdp_identity_config_updated_at
      BEFORE UPDATE ON cdp_identity_config
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ─── 5. SEED default identity config ─────────────────────────────────────
INSERT INTO cdp_identity_config
  (identifier_type, display_name, tier, priority, merge_strategy, description)
VALUES
  ('phs_account_id',   'PHS Account ID (Depository)',  1, 1, 'permanent',   'Primary ground-truth identifier. Depository account number e.g. 022C123486'),
  ('national_id_hash', 'National ID / CCCD (hashed)',  1, 2, 'permanent',   'SHA-256 hash of CCCD/CMND/Passport. Never store raw value in CDP.'),
  ('phone',            'Mobile Phone Number',          2, 1, 'pre_account', 'Contact phone number E.164 format. Merge pre-account; store only after account.'),
  ('email',            'Email Address',                2, 2, 'pre_account', 'Contact email. 1 email per customer; latest overwrites. Not a permanent merge key.'),
  ('idfa',             'iOS Advertising ID (IDFA)',    2, 3, 'pre_account', 'Apple Advertising Identifier. Reset by user; treat as weak signal.'),
  ('idfv',             'iOS Vendor ID (IDFV)',         2, 4, 'pre_account', 'Apple Vendor Identifier. More stable than IDFA but device-scoped.'),
  ('gaid',             'Google Advertising ID (GAID)', 2, 5, 'pre_account', 'Google Advertising Identifier. Reset by user; treat as weak signal.'),
  ('anonymous_id',     'Anonymous Visitor ID',         3, 1, 'track_only',  'RudderStack anonymous_id. Browser/device scoped. Never used as merge key.')
ON CONFLICT (identifier_type) DO NOTHING;

-- ─── 6. ALTER cdp_consents — align with C360 Group P ─────────────────────
ALTER TABLE cdp_consents DROP CONSTRAINT IF EXISTS cdp_consents_consent_type_check;
ALTER TABLE cdp_consents
  ADD CONSTRAINT cdp_consents_consent_type_check
  CHECK (consent_type IN (
    'data_processing','marketing_email','zns',
    'push_notification','sms','advisory_call','do_not_contact'
  ));

ALTER TABLE cdp_consents
  ADD COLUMN IF NOT EXISTS policy_version VARCHAR(32),
  ADD COLUMN IF NOT EXISTS source         VARCHAR(64);

-- ─── 7. CREATE cdp_dna_scores — Group T: Investment DNA Score ────────────
CREATE TABLE IF NOT EXISTS cdp_dna_scores (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id             VARCHAR(20) NOT NULL,
  cdp_customer_uuid       UUID REFERENCES cdp_customers(id) ON DELETE SET NULL,
  dna_version             VARCHAR(20) NOT NULL,
  risk_tolerance_score    SMALLINT CHECK (risk_tolerance_score BETWEEN 0 AND 100),
  growth_orientation_score SMALLINT CHECK (growth_orientation_score BETWEEN 0 AND 100),
  income_orientation_score SMALLINT CHECK (income_orientation_score BETWEEN 0 AND 100),
  trading_frequency_dna   VARCHAR(20)
      CHECK (trading_frequency_dna IN ('low','medium','high','very_high')),
  sector_concentration    NUMERIC(5,2),
  investor_persona        VARCHAR(64)
      CHECK (investor_persona IN ('active_trader','long_term_investor','conservative_saver','balanced_investor')),
  calculated_at           TIMESTAMPTZ NOT NULL,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (customer_id, dna_version)
);

CREATE INDEX IF NOT EXISTS idx_dna_scores_customer_id  ON cdp_dna_scores(customer_id);
CREATE INDEX IF NOT EXISTS idx_dna_scores_calculated   ON cdp_dna_scores(calculated_at DESC);

-- ─── 8. CREATE cdp_transactions — Group W: CDP Transactions (anonymized) ─
CREATE TABLE IF NOT EXISTS cdp_transactions (
  id               BIGSERIAL PRIMARY KEY,
  customer_id      VARCHAR(20) NOT NULL,
  cdp_customer_uuid UUID REFERENCES cdp_customers(id) ON DELETE SET NULL,
  transaction_date DATE NOT NULL,
  transaction_type VARCHAR(20) NOT NULL
      CHECK (transaction_type IN ('stock','fund','bond','derivative','covered_warrant')),
  direction        VARCHAR(10) NOT NULL
      CHECK (direction IN ('buy','sell')),
  value_band       VARCHAR(20) NOT NULL
      CHECK (value_band IN ('<10M','10-50M','50-100M','>100M')),
  symbol           VARCHAR(20),
  sector           VARCHAR(50),
  channel          VARCHAR(20)
      CHECK (channel IN ('app','web','xpro','counter','phone')),
  status           VARCHAR(20) DEFAULT 'matched'
      CHECK (status IN ('matched','cancelled','pending')),
  session_date     DATE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cdp_transactions_customer_id   ON cdp_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_cdp_transactions_session_date  ON cdp_transactions(session_date DESC);
CREATE INDEX IF NOT EXISTS idx_cdp_transactions_symbol        ON cdp_transactions(symbol);

-- ─── 9. CREATE cdp_campaign_interactions — Group V ───────────────────────
CREATE TABLE IF NOT EXISTS cdp_campaign_interactions (
  id                   BIGSERIAL PRIMARY KEY,
  customer_id          VARCHAR(20),
  cdp_customer_uuid    UUID REFERENCES cdp_customers(id) ON DELETE SET NULL,
  campaign_id          VARCHAR(50) NOT NULL,
  message_id           VARCHAR(50) NOT NULL UNIQUE,
  channel              VARCHAR(20) NOT NULL
      CHECK (channel IN ('email','zns','push','sms')),
  event_type           VARCHAR(20) NOT NULL
      CHECK (event_type IN ('sent','delivered','opened','clicked','converted','bounced','unsubscribed')),
  occurred_at          TIMESTAMPTZ NOT NULL,
  conversion_value     BIGINT DEFAULT 0,
  journey_step         VARCHAR(50),
  suppression_applied  BOOLEAN DEFAULT FALSE,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_interactions_customer_id ON cdp_campaign_interactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_campaign_interactions_campaign_id ON cdp_campaign_interactions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_interactions_occurred_at ON cdp_campaign_interactions(occurred_at DESC);

-- ─── 10. CREATE cdp_signals — Group R: Signals to Process ────────────────
CREATE TABLE IF NOT EXISTS cdp_signals (
  signal_id        VARCHAR(64) PRIMARY KEY,
  customer_id      VARCHAR(20) NOT NULL,
  cdp_customer_uuid UUID REFERENCES cdp_customers(id) ON DELETE SET NULL,
  signal_code      VARCHAR(64) NOT NULL
      CHECK (signal_code IN (
        'FIRST_DEPOSIT','NO_TRADE_AFTER_DEPOSIT','DORMANT',
        'TIER_AT_RISK','TIER_UPGRADE_NEAR','TIER_CHANGED',
        'LARGE_WITHDRAWAL','STOCK_TRANSFER_OUT','MARGIN_WARNING',
        'TICKET_OVERDUE','REPEAT_COMPLAINT','NO_BROKER_HIGH_VALUE',
        'KYC_EXPIRING','BIRTHDAY_UPCOMING','ORDER_REJECTED_REPEAT',
        'PRODUCT_INTEREST','ACTIVITY_DROP','RISK_PROFILE_MISSING','RISK_PROFILE_MISMATCH'
      )),
  signal_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signal_owner_team VARCHAR(64),
  signal_evidence   JSONB DEFAULT '{}',
  signal_status     VARCHAR(20) DEFAULT 'new'
      CHECK (signal_status IN ('new','in_progress','processed','skipped')),
  processed_at      TIMESTAMPTZ,
  processed_by      VARCHAR(128)
);

CREATE INDEX IF NOT EXISTS idx_cdp_signals_customer_id    ON cdp_signals(customer_id);
CREATE INDEX IF NOT EXISTS idx_cdp_signals_code           ON cdp_signals(signal_code);
CREATE INDEX IF NOT EXISTS idx_cdp_signals_status         ON cdp_signals(signal_status);
CREATE INDEX IF NOT EXISTS idx_cdp_signals_created_at     ON cdp_signals(signal_created_at DESC);

-- ─── 11. ALTER cdp_audiences — align with C360 Group U ───────────────────
ALTER TABLE cdp_audiences
  ADD COLUMN IF NOT EXISTS audience_type        VARCHAR(32)
      CHECK (audience_type IN ('static','dynamic','event_triggered','behavioral','lifecycle')),
  ADD COLUMN IF NOT EXISTS refresh_frequency    VARCHAR(20) DEFAULT 'daily'
      CHECK (refresh_frequency IN ('realtime','daily','weekly')),
  ADD COLUMN IF NOT EXISTS member_count         INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_computed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mautic_pushed_at     TIMESTAMPTZ;

-- ─── 12. CREATE cdp_audience_members — Group U: audience_member ──────────
CREATE TABLE IF NOT EXISTS cdp_audience_members (
  id           BIGSERIAL PRIMARY KEY,
  audience_id  UUID NOT NULL REFERENCES cdp_audiences(id) ON DELETE CASCADE,
  customer_id  VARCHAR(20) NOT NULL,
  cdp_customer_uuid UUID REFERENCES cdp_customers(id) ON DELETE SET NULL,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at   TIMESTAMPTZ,
  UNIQUE (audience_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_audience_members_audience_id  ON cdp_audience_members(audience_id);
CREATE INDEX IF NOT EXISTS idx_audience_members_customer_id  ON cdp_audience_members(customer_id);
CREATE INDEX IF NOT EXISTS idx_audience_members_active       ON cdp_audience_members(audience_id) WHERE removed_at IS NULL;

-- ─── 13. ALTER cdp_audience_versions — align with Group X ────────────────
ALTER TABLE cdp_audience_versions
  ADD COLUMN IF NOT EXISTS version       INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS member_count  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status        VARCHAR(20) DEFAULT 'completed'
      CHECK (status IN ('completed','failed','computing')),
  ADD COLUMN IF NOT EXISTS computed_at   TIMESTAMPTZ DEFAULT NOW();
