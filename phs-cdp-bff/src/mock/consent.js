const CONSENT_SUMMARY = {
  totalCustomers: 48420,
  marketingGranted: 38420, analyticsGranted: 41200, personalizationGranted: 29800,
  marketingRate: 79.4, analyticsRate: 85.1, personalizationRate: 61.5,
  recentChanges: [
    { customerId:'PHS-001234', type:'marketing', action:'granted', timestamp:'2024-01-15T09:30:00Z' },
    { customerId:'PHS-001237', type:'personalization', action:'revoked', timestamp:'2024-01-15T08:15:00Z' },
    { customerId:'PHS-001239', type:'analytics', action:'granted', timestamp:'2024-01-14T16:45:00Z' },
  ],
};

const CUSTOMER_CONSENTS = {
  'PHS-001234': { marketing:true,  analytics:true,  personalization:true,  updatedAt:'2024-01-15T09:30:00Z' },
  'PHS-001235': { marketing:true,  analytics:true,  personalization:false, updatedAt:'2023-12-01T10:00:00Z' },
  'PHS-001236': { marketing:true,  analytics:true,  personalization:true,  updatedAt:'2024-01-01T00:00:00Z' },
  'PHS-001237': { marketing:false, analytics:true,  personalization:false, updatedAt:'2024-01-15T08:15:00Z' },
  'PHS-001238': { marketing:true,  analytics:false, personalization:false, updatedAt:'2023-11-15T12:00:00Z' },
};

module.exports = { CONSENT_SUMMARY, CUSTOMER_CONSENTS };
