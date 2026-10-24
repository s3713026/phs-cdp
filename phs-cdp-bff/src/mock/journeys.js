const JOURNEYS = [
  { id:'jrn_001', name:'New Account Onboarding', status:'active', trigger:'Account Opened', steps:5, activeCustomers:2840, completionRate:34.2, avgDuration:'7 days', createdAt:'2024-01-02T09:00:00Z' },
  { id:'jrn_002', name:'Margin Product Interest Journey', status:'active', trigger:'Margin Viewed', steps:4, activeCustomers:1240, completionRate:18.5, avgDuration:'14 days', createdAt:'2024-01-05T10:00:00Z' },
  { id:'jrn_003', name:'Dormant Reactivation Flow', status:'paused', trigger:'30 Days Inactive', steps:6, activeCustomers:0, completionRate:12.1, avgDuration:'21 days', createdAt:'2023-12-15T08:00:00Z' },
];
module.exports = { JOURNEYS };
