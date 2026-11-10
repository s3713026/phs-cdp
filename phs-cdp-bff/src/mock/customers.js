/**
 * BFF mock customers — chỉ giữ 1 GOLDEN profile để demo.
 * Tất cả customers thật sẽ đến từ Postgres (cdp_customers).
 */
const CUSTOMERS = [
  {
    id:               'PHS-CUS-GOLDEN-001',
    name:             'Nguyễn Thị Lan Anh',
    email:            'an****@example.com',
    phone:            '+84 90 **** 0001',
    lifecycle:        'active_investor',
    tier:             'gold',
    segment:          'growth_investor',
    joinDate:         '2026-07-06',
    lastActive:       '2026-09-17T08:00:00Z',
    tradingFrequency: 'high',
    cashUtilization:  28,
    productInterests: ['margin', 'elites_pick'],
    emailOpenRate:    74,
    pushEngagement:   81,
    webVisits:        42,
    productViews:     28,
    kycStatus:        'verified',
    _isGolden:        true,
  },
];

const LIFECYCLE_LABELS = {
  prospect:        'Prospect',
  lead:            'Lead',
  ekyc:            'eKYC',
  new_account:     'New Account',
  account_opening: 'Account Opening',
  funding:         'Funding',
  first_trade:     'First Trade',
  active_investor: 'Active Investor',
  vip:             'VIP',
  dormant:         'Dormant',
  churn_risk:      'Churn Risk',
  reactivation:    'Reactivation',
};

module.exports = { CUSTOMERS, LIFECYCLE_LABELS };
