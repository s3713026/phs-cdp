-- ============================================================
-- PHS CDP Profile Store — Initial Schema
-- Runs automatically when cdp-postgres container first starts
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── cdp_customers — Unified Customer Profile (source of truth) ──
CREATE TABLE IF NOT EXISTS cdp_customers (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phs_account_id    VARCHAR(128) UNIQUE,            -- ground truth identifier
  anonymous_id      VARCHAR(255),
  email             VARCHAR(255),
  phone             VARCHAR(50),
  full_name         VARCHAR(255),
  lifecycle_stage   VARCHAR(64)                      -- prospect/lead/ekyc/account_opening/funding/first_trade/active_investor/vip/dormant/churn_risk
                    CHECK (lifecycle_stage IN (
                      'prospect','lead','ekyc','account_opening','funding',
                      'first_trade','active_investor','vip','dormant','churn_risk','reactivation'
                    )),
  kyc_status        VARCHAR(64),
  product_interests JSONB DEFAULT '[]',              -- ["margin","elites_pick","elites_portfolio"]
  custom_attributes JSONB DEFAULT '{}',
  first_seen_at     TIMESTAMP WITH TIME ZONE,
  last_seen_at      TIMESTAMP WITH TIME ZONE,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_phs_account_id ON cdp_customers(phs_account_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON cdp_customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON cdp_customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_lifecycle ON cdp_customers(lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_customers_anonymous_id ON cdp_customers(anonymous_id);

-- ─── cdp_identities — Identity Graph ─────────────────────────
CREATE TABLE IF NOT EXISTS cdp_identities (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id      UUID NOT NULL REFERENCES cdp_customers(id) ON DELETE CASCADE,
  identifier_type  VARCHAR(64) NOT NULL
                   CHECK (identifier_type IN (
                     'phs_account_id','email','phone','anonymous_id',
                     'device_id','appsflyer_id','zalo_id'
                   )),
  identifier_value VARCHAR(512) NOT NULL,
  source           VARCHAR(64) DEFAULT 'rudderstack'
                   CHECK (source IN ('web','mobile','crm','rudderstack','server')),
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(identifier_type, identifier_value)
);

CREATE INDEX IF NOT EXISTS idx_identities_customer_id ON cdp_identities(customer_id);
CREATE INDEX IF NOT EXISTS idx_identities_value ON cdp_identities(identifier_value);
CREATE INDEX IF NOT EXISTS idx_identities_type_value ON cdp_identities(identifier_type, identifier_value);

-- ─── cdp_events — Behavioral Event History ───────────────────
CREATE TABLE IF NOT EXISTS cdp_events (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id    UUID REFERENCES cdp_customers(id) ON DELETE SET NULL,  -- nullable: unknown user
  anonymous_id   VARCHAR(255),
  event_name     VARCHAR(255) NOT NULL,
  event_category VARCHAR(128),
  properties     JSONB DEFAULT '{}',
  source         VARCHAR(64) DEFAULT 'web'
                 CHECK (source IN ('web','mobile','server')),
  session_id     VARCHAR(255),
  occurred_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_customer_id ON cdp_events(customer_id);
CREATE INDEX IF NOT EXISTS idx_events_anonymous_id ON cdp_events(anonymous_id);
CREATE INDEX IF NOT EXISTS idx_events_name ON cdp_events(event_name);
CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON cdp_events(occurred_at DESC);

-- ─── cdp_consents — Consent Management ───────────────────────
CREATE TABLE IF NOT EXISTS cdp_consents (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id   UUID NOT NULL REFERENCES cdp_customers(id) ON DELETE CASCADE,
  consent_type  VARCHAR(64) NOT NULL
                CHECK (consent_type IN (
                  'marketing_email','push_notification','sms','data_processing'
                )),
  status        BOOLEAN NOT NULL DEFAULT false,
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(customer_id, consent_type)
);

CREATE INDEX IF NOT EXISTS idx_consents_customer_id ON cdp_consents(customer_id);

-- ─── cdp_audiences — Audience Definitions ────────────────────
CREATE TABLE IF NOT EXISTS cdp_audiences (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                VARCHAR(255) NOT NULL,
  description         TEXT,
  type                VARCHAR(32) NOT NULL DEFAULT 'dynamic'
                      CHECK (type IN ('dynamic','static','behavioral')),
  conditions          JSONB DEFAULT '[]',
  status              VARCHAR(32) NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','active','paused','archived')),
  mautic_segment_id   INTEGER,
  estimated_size      INTEGER DEFAULT 0,
  last_calculated_at  TIMESTAMP WITH TIME ZONE,
  created_by          VARCHAR(128),
  approved_by         VARCHAR(128),
  version             INTEGER NOT NULL DEFAULT 1,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audiences_status ON cdp_audiences(status);
CREATE INDEX IF NOT EXISTS idx_audiences_mautic_segment_id ON cdp_audiences(mautic_segment_id);

-- ─── cdp_audience_versions — Audit Trail ─────────────────────
CREATE TABLE IF NOT EXISTS cdp_audience_versions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  audience_id UUID NOT NULL REFERENCES cdp_audiences(id) ON DELETE CASCADE,
  conditions  JSONB DEFAULT '[]',
  changed_by  VARCHAR(128),
  changed_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  note        TEXT
);

CREATE INDEX IF NOT EXISTS idx_audience_versions_audience_id ON cdp_audience_versions(audience_id);

-- ─── Auto-update updated_at trigger ──────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_cdp_customers_updated_at'
  ) THEN
    CREATE TRIGGER update_cdp_customers_updated_at
      BEFORE UPDATE ON cdp_customers
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_cdp_audiences_updated_at'
  ) THEN
    CREATE TRIGGER update_cdp_audiences_updated_at
      BEFORE UPDATE ON cdp_audiences
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
