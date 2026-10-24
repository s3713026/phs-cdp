const CAMPAIGNS = [
  { id:'camp_001', name:'New Account Activation Q1', status:'active', type:'automated', audience:'aud_002', channel:['push','email'], startDate:'2024-01-01', endDate:'2024-03-31', sent:3240, opened:1620, clicked:486, converted:97, conversionRate:3.0 },
  { id:'camp_002', name:'Margin Product Introduction', status:'active', type:'automated', audience:'aud_001', channel:['email'], startDate:'2024-01-08', endDate:'2024-01-22', sent:12845, opened:8951, clicked:2698, converted:540, conversionRate:4.2 },
  { id:'camp_003', name:'Dormant Win-Back Campaign', status:'draft', type:'one_time', audience:'aud_003', channel:['email','sms'], startDate:null, endDate:null, sent:0, opened:0, clicked:0, converted:0, conversionRate:0 },
  { id:'camp_004', name:'Churn Prevention - Gold Tier', status:'active', type:'automated', audience:'aud_005', channel:['push','email','sms'], startDate:'2024-01-10', endDate:'2024-01-31', sent:1230, opened:984, clicked:320, converted:48, conversionRate:3.9 },
];
module.exports = { CAMPAIGNS };
