const trackingPlan = {
  version: "1.0.0",
  categories: [
    {
      id: "account",
      name: "Account & Identity",
      events: [
        { id: "account_registered", name: "Account Registered", category: "account", status: "active", platforms: ["web","mobile","server"], properties: [{name:"registration_method",type:"string",required:true},{name:"referral_source",type:"string",required:false}] },
        { id: "account_opened", name: "Account Opened", category: "account", status: "active", platforms: ["web","mobile","server"], properties: [{name:"account_type",type:"string",required:true},{name:"account_id",type:"string",required:true}] },
        { id: "ekyc_started", name: "eKYC Started", category: "account", status: "active", platforms: ["web","mobile"], properties: [{name:"kyc_method",type:"string",required:true}] },
        { id: "ekyc_completed", name: "eKYC Completed", category: "account", status: "active", platforms: ["web","mobile","server"], properties: [{name:"kyc_method",type:"string",required:true},{name:"verification_result",type:"string",required:true}] }
      ]
    },
    {
      id: "trading",
      name: "Trading & Investment",
      events: [
        { id: "first_deposit", name: "First Deposit", category: "trading", status: "active", platforms: ["web","mobile","server"], properties: [{name:"amount",type:"number",required:true},{name:"payment_method",type:"string",required:true},{name:"account_id",type:"string",required:true}] },
        { id: "first_trade", name: "First Trade", category: "trading", status: "active", platforms: ["web","mobile","server"], properties: [{name:"symbol",type:"string",required:true},{name:"trade_type",type:"string",required:true},{name:"quantity",type:"number",required:true},{name:"price",type:"number",required:true}] }
      ]
    },
    {
      id: "product",
      name: "Product Interest",
      events: [
        { id: "product_viewed", name: "Product Viewed", category: "product", status: "active", platforms: ["web","mobile"], properties: [{name:"product_id",type:"string",required:true},{name:"product_name",type:"string",required:true},{name:"product_category",type:"string",required:true},{name:"page_url",type:"string",required:false}] }
      ]
    },
    {
      id: "engagement",
      name: "Engagement",
      events: [
        { id: "login", name: "Login", category: "engagement", status: "active", platforms: ["web","mobile"], properties: [{name:"login_method",type:"string",required:true},{name:"platform",type:"string",required:true}] },
        { id: "campaign_opened", name: "Campaign Opened", category: "engagement", status: "active", platforms: ["web","mobile","server"], properties: [{name:"campaign_id",type:"string",required:true},{name:"channel",type:"string",required:true}] },
        { id: "campaign_clicked", name: "Campaign Clicked", category: "engagement", status: "active", platforms: ["web","mobile","server"], properties: [{name:"campaign_id",type:"string",required:true},{name:"channel",type:"string",required:true},{name:"cta_id",type:"string",required:false}] }
      ]
    }
  ]
};
module.exports = trackingPlan;
