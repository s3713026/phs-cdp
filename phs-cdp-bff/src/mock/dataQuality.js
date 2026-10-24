const DQ_OVERVIEW = {
  overallScore: 92, identityCoverage: 94, eventCompleteness: 89,
  trackingCoverage: 91, dataFreshness: 98,
  totalCustomers: 48420, identifiedCustomers: 45515,
  anonymousVisitors: 12840, duplicateProfiles: 234,
  missingEmails: 2905, invalidPhones: 412,
};

const DQ_ISSUES = [
  { id:'dqi_001', severity:'critical', type:'missing_identifier', title:'Missing Email Addresses', description:'2,905 customer profiles are missing email addresses, preventing email campaign delivery.', affectedCount:2905, recommendation:'Trigger email collection campaign for affected customers.', source:'CRM' },
  { id:'dqi_002', severity:'warning', type:'duplicate_identity', title:'Duplicate Customer Profiles', description:'234 duplicate profiles detected across Web and Mobile sources.', affectedCount:234, recommendation:'Run identity resolution to merge duplicate profiles.', source:'RudderStack' },
  { id:'dqi_003', severity:'warning', type:'invalid_data', title:'Invalid Phone Numbers', description:'412 phone numbers do not match Vietnamese mobile format.', affectedCount:412, recommendation:'Validate and clean phone number field.', source:'CRM' },
  { id:'dqi_004', severity:'info', type:'event_missing_property', title:'Missing Campaign ID in Events', description:'Some Campaign Clicked events are missing campaign_id property.', affectedCount:1820, recommendation:'Update SDK to always include campaign_id.', source:'Web SDK' },
];

module.exports = { DQ_OVERVIEW, DQ_ISSUES };
