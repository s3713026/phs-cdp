/**
 * dest-configs.js — RudderStack-compatible destination field definitions.
 * Field types: text | password | url | number | select | toggle | taglist | textarea | section
 */
export const DEST_CONFIGS = {

  /* ─── ANALYTICS ─── */
  ga4: [
    { key: 'measurementId', label: 'Measurement ID', type: 'text', required: true, placeholder: 'G-XXXXXXXXXX', hint: 'GA4 Admin → Data Streams → your stream.' },
    { key: 'apiSecret', label: 'API Secret', type: 'password', hint: 'Required for Measurement Protocol (server-side). GA4 Admin → Data Streams → Measurement Protocol API secrets.' },
    { key: 'clientType', label: 'Client Type', type: 'select', options: ['gtag', 'firebase'], defaultValue: 'gtag', hint: 'gtag for web, firebase for app.' },
    { key: 'extendPageViewParams', label: 'Extend Page View Params', type: 'toggle' },
    { key: 'sendUserId', label: 'Send User ID', type: 'toggle', hint: 'Forward userId to GA4 as user_id.' },
    { key: 'blockPageViewEvent', label: 'Block Page View Event', type: 'toggle' },
  ],
  googleanalyticsua: [
    { key: 'trackingId', label: 'Tracking ID', type: 'text', required: true, placeholder: 'UA-XXXXXXXXX-X' },
    { key: 'doubleClick', label: 'DoubleClick', type: 'toggle' },
    { key: 'enhancedLinkAttribution', label: 'Enhanced Link Attribution', type: 'toggle' },
    { key: 'includeSearch', label: 'Include Search Term', type: 'toggle' },
    { key: 'trackCategorizedPages', label: 'Track Categorized Pages', type: 'toggle' },
    { key: 'trackNamedPages', label: 'Track Named Pages', type: 'toggle' },
    { key: 'sampleRate', label: 'Sample Rate (%)', type: 'number', placeholder: '100' },
    { key: 'siteSpeedSampleRate', label: 'Site Speed Sample Rate (%)', type: 'number', placeholder: '1' },
  ],
  amplitude: [
    { key: 'apiKey', label: 'API Key', type: 'text', required: true, placeholder: 'Your Amplitude project API key', hint: 'Amplitude → Settings → Projects → General.' },
    { key: 'secretKey', label: 'Secret Key', type: 'password', hint: 'Required for GDPR user deletion.' },
    { key: 'residencyServer', label: 'Residency Server', type: 'select', required: true, options: ['Standard Server (US)', 'EU Residency Server'], defaultValue: 'Standard Server (US)' },
    { key: 'trackSessionEvents', label: 'Track Session Events', type: 'toggle' },
    { key: 'trackRevenuePerProduct', label: 'Track Revenue Per Product', type: 'toggle' },
    { key: 'useAdvertisingIdForDeviceId', label: 'Use Advertising ID for Device ID', type: 'toggle' },
    { key: 'groupTypeTrait', label: 'Group Type Trait', type: 'text', placeholder: 'e.g. company' },
    { key: 'groupValueTrait', label: 'Group Value Trait', type: 'text', placeholder: 'e.g. name' },
  ],
  mixpanel: [
    { key: 'token', label: 'Project Token', type: 'text', required: true, placeholder: 'Your Mixpanel project token' },
    { key: 'apiSecret', label: 'API Secret', type: 'password' },
    { key: 'dataResidency', label: 'Data Residency', type: 'select', options: ['US', 'EU'], defaultValue: 'US' },
    { key: 'setAllTraitsAsSuperProperties', label: 'Set All Traits as Super Properties', type: 'toggle' },
    { key: 'consolidatedPageCalls', label: 'Consolidated Page Calls', type: 'toggle' },
    { key: 'trackCategorizedPages', label: 'Track Categorized Pages', type: 'toggle' },
    { key: 'trackNamedPages', label: 'Track Named Pages', type: 'toggle' },
    { key: 'identifyAnonymousUsers', label: 'Identify Anonymous Users', type: 'toggle' },
  ],
  segment: [{ key: 'writeKey', label: 'Write Key', type: 'text', required: true, placeholder: 'Your Segment write key' }],
  heap:    [{ key: 'appId', label: 'App ID', type: 'text', required: true, placeholder: 'Your Heap environment ID' }],
  posthog: [
    { key: 'apiKey', label: 'API Key', type: 'text', required: true, placeholder: 'phc_xxxxxxxxxxxx' },
    { key: 'host', label: 'Host', type: 'url', placeholder: 'https://app.posthog.com', defaultValue: 'https://app.posthog.com' },
    { key: 'capturePageView', label: 'Capture Page View', type: 'toggle' },
  ],
  fullstory: [{ key: 'orgId', label: 'Org ID', type: 'text', required: true, placeholder: 'Your FullStory Org ID' }],
  hotjar:    [{ key: 'siteId', label: 'Site ID', type: 'text', required: true, placeholder: 'Your Hotjar numeric Site ID' }],

  /* ─── PUSH / NOTIFICATIONS ─── */
  onesignal: [
    { key: 'appId', label: 'App ID', type: 'text', required: true, placeholder: 'e.g. 7acc2c99-XXXX-XXXX-XXXX-6cd8a994da65', hint: 'OneSignal Dashboard → Settings → Keys & IDs.' },
    { key: 'eventVersion', label: 'Event Version to Use', type: 'select', options: ['User Model (Recommended)', 'Device Model (Deprecated)'], defaultValue: 'User Model (Recommended)' },
    { key: 'useEmailDevice', label: 'Add device/subscription using Email', type: 'toggle', hint: 'Adds a new OneSignal subscription using email.' },
    { key: 'usePhoneDevice', label: 'Add device/subscription using Phone Number', type: 'toggle', hint: 'Adds a new OneSignal subscription using phone.' },
    { key: 'concatEventProps', label: 'Concatenate Event Name with Properties', type: 'toggle', hint: 'E.g. add_to_cart + brand → add_to_cart_brand tag.' },
    { key: 'allowedPropList', label: 'Allowed Property List', type: 'taglist', hint: 'Properties to send as device tags (track/group calls only).' },
    { key: '__s_consent', label: 'Web SDK & Consent Settings', type: 'section' },
    { key: 'consentProvider', label: 'Consent Management Provider', type: 'select', options: ['', 'OneTrust', 'Ketch', 'Custom'] },
    { key: 'consentCategoryIds', label: 'Consent Category IDs', type: 'taglist', hint: 'Consent category IDs (e.g. Marketing). Use IDs, not names.' },
  ],
  firebase: [
    { key: 'serverKey', label: 'FCM Server Key (Legacy)', type: 'password' },
    { key: 'projectId', label: 'Project ID', type: 'text', required: true, placeholder: 'your-firebase-project-id' },
  ],
  appsflyer: [
    { key: 'devKey', label: 'Dev Key', type: 'password', required: true, placeholder: 'Your AppsFlyer Dev Key' },
    { key: 'appIdIos', label: 'App ID (iOS)', type: 'text', placeholder: 'id123456789' },
    { key: 'appIdAndroid', label: 'App ID (Android)', type: 'text', placeholder: 'com.example.app' },
    { key: 'trackEvents', label: 'Track Events', type: 'toggle' },
    { key: 'useS2S', label: 'Use S2S (Server-to-Server)', type: 'toggle' },
  ],

  /* ─── ADVERTISING ─── */
  facebookpixel: [
    { key: 'pixelId', label: 'Pixel ID', type: 'text', required: true, placeholder: 'Your Facebook Pixel ID' },
    { key: 'accessToken', label: 'Access Token (CAPI)', type: 'password', hint: 'Conversions API token for server-side events.' },
    { key: 'testEventCode', label: 'Test Event Code', type: 'text', placeholder: 'TEST12345' },
    { key: 'limitedDataUse', label: 'Limited Data Use', type: 'toggle', hint: 'Enable LDU for CCPA compliance.' },
    { key: 'blacklistPiiProperties', label: 'Blacklist PII Properties', type: 'taglist' },
    { key: 'standardPageCall', label: 'Standard PageView on Page Call', type: 'toggle' },
    { key: 'valueFieldIdentifier', label: 'Value Field Identifier', type: 'select', options: ['properties.price', 'properties.value', 'properties.revenue'], defaultValue: 'properties.price' },
  ],
  googleads: [
    { key: 'conversionId', label: 'Conversion ID', type: 'text', required: true, placeholder: 'AW-XXXXXXXXXX' },
    { key: 'conversionLabel', label: 'Conversion Label', type: 'text' },
    { key: 'pageLoadConversions', label: 'Send Page Load as Conversion', type: 'toggle' },
  ],
  tiktok: [
    { key: 'pixelId', label: 'Pixel ID', type: 'text', required: true, placeholder: 'Your TikTok Pixel ID' },
    { key: 'accessToken', label: 'Access Token', type: 'password', hint: 'For TikTok Events API (server-side).' },
    { key: 'hashUserData', label: 'Hash User Data', type: 'toggle', defaultValue: true },
  ],
  linkedin: [{ key: 'partnerId', label: 'Partner ID', type: 'text', required: true, placeholder: 'Your LinkedIn Partner ID' }],

  /* ─── CRM / MARKETING AUTOMATION ─── */
  hubspot: [
    { key: 'hubId', label: 'Hub ID', type: 'text', placeholder: 'Your HubSpot portal/hub ID' },
    { key: 'apiKey', label: 'Private App Token', type: 'password', required: true, placeholder: 'pat-xx-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', hint: 'HubSpot → Settings → Private Apps.' },
    { key: 'lookupField', label: 'Lookup Field', type: 'text', placeholder: 'email', hint: 'Property to identify contacts. Defaults to email.' },
    { key: 'createContacts', label: 'Create Contacts', type: 'toggle' },
    { key: 'trackPageViews', label: 'Track Page Views', type: 'toggle' },
  ],
  salesforce: [
    { key: 'instanceUrl', label: 'Instance URL', type: 'url', required: true, placeholder: 'https://yourorg.salesforce.com' },
    { key: 'username', label: 'Username', type: 'text', required: true },
    { key: 'password', label: 'Password', type: 'password', required: true },
    { key: 'securityToken', label: 'Security Token', type: 'password', hint: 'Append to password if your IP is not whitelisted.' },
    { key: 'sandbox', label: 'Sandbox', type: 'toggle' },
    { key: 'mapTraits', label: 'Map Traits to Salesforce Fields', type: 'toggle' },
  ],
  intercom: [
    { key: 'accessToken', label: 'Access Token', type: 'password', required: true },
    { key: 'appId', label: 'App ID', type: 'text', placeholder: 'Your Intercom App ID' },
    { key: 'collectContext', label: 'Collect Context', type: 'toggle' },
    { key: 'sendAnonymousId', label: 'Send Anonymous ID', type: 'toggle' },
  ],
  braze: [
    { key: 'apiKey', label: 'REST API Key', type: 'password', required: true, hint: 'Braze Dashboard → Settings → API Keys.' },
    { key: 'restEndpoint', label: 'REST Endpoint URL', type: 'url', required: true, placeholder: 'https://rest.iad-01.braze.com' },
    { key: 'appKey', label: 'App Identifier Key', type: 'text', hint: 'Required for Web/Mobile SDK mode.' },
    { key: 'trackEvents', label: 'Track Events', type: 'toggle' },
    { key: 'trackAnonymousUser', label: 'Track Anonymous Users', type: 'toggle' },
    { key: 'supportDedup', label: 'Support Deduplication', type: 'toggle' },
  ],
  klaviyo: [
    { key: 'apiKey', label: 'Private API Key', type: 'password', required: true, placeholder: 'pk_xxxxxxxxxxxx', hint: 'Klaviyo → Account → Settings → API Keys.' },
    { key: 'publicApiKey', label: 'Public API Key (Site ID)', type: 'text', placeholder: 'XXXXXX' },
    { key: 'flattenProperties', label: 'Flatten Properties', type: 'toggle' },
  ],
  mailchimp: [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'xxxx-us1', hint: 'Mailchimp → Account → Extras → API Keys.' },
    { key: 'audienceId', label: 'Audience ID', type: 'text', required: true, placeholder: 'Your Mailchimp list/audience ID' },
    { key: 'dataCenter', label: 'Data Center', type: 'text', placeholder: 'us1' },
    { key: 'doubleOptIn', label: 'Double Opt-in', type: 'toggle' },
  ],
  sendgrid: [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true, hint: 'SendGrid → Settings → API Keys.' },
    { key: 'sandboxMode', label: 'Sandbox Mode', type: 'toggle' },
  ],
  activecampaign: [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true },
    { key: 'apiUrl', label: 'API URL', type: 'url', required: true, placeholder: 'https://youraccountname.api-us1.com' },
    { key: 'actId', label: 'Account ID', type: 'text' },
  ],
  customerio: [
    { key: 'siteId', label: 'Site ID', type: 'text', required: true, hint: 'Customer.io → Settings → API Credentials.' },
    { key: 'apiKey', label: 'API Key', type: 'password', required: true },
    { key: 'region', label: 'Region', type: 'select', options: ['US', 'EU'], defaultValue: 'US' },
    { key: 'trackAnonymousUsers', label: 'Track Anonymous Users', type: 'toggle' },
  ],
  iterable: [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true, hint: 'Iterable → Integrations → API Keys.' },
    { key: 'preferUserId', label: 'Prefer User ID', type: 'toggle' },
    { key: 'mergeNestedObjects', label: 'Merge Nested Objects', type: 'toggle' },
    { key: 'trackAllPages', label: 'Track All Pages', type: 'toggle' },
  ],
  clevertap: [
    { key: 'accountId', label: 'Account ID', type: 'text', required: true, hint: 'CleverTap Dashboard → Settings → Integration → Account Info.' },
    { key: 'passcode', label: 'Passcode', type: 'password', required: true },
    { key: 'region', label: 'Region', type: 'select', options: ['US', 'EU', 'IN', 'SG', 'SK'], defaultValue: 'US' },
    { key: 'enableObjectIdMapping', label: 'Enable Object ID Mapping', type: 'toggle' },
  ],
  moengage: [
    { key: 'appId', label: 'App ID', type: 'text', required: true, hint: 'MoEngage Dashboard → Settings → API Settings.' },
    { key: 'apiKey', label: 'API Key', type: 'password', required: true },
    { key: 'region', label: 'Data Center', type: 'select', options: ['DC_1 (US)', 'DC_2 (EU)', 'DC_3 (APAC)'], defaultValue: 'DC_1 (US)' },
    { key: 'enableNativeSdk', label: 'Enable Native SDK', type: 'toggle' },
  ],
  leanplum: [
    { key: 'appId', label: 'App ID', type: 'text', required: true },
    { key: 'clientKey', label: 'Client Key', type: 'password', hint: 'For client-side calls.' },
    { key: 'productionKey', label: 'Production Key', type: 'password', hint: 'For server-side calls.' },
    { key: 'devMode', label: 'Dev Mode', type: 'toggle' },
  ],
  adjust: [
    { key: 'appToken', label: 'App Token', type: 'text', required: true, hint: 'Adjust Dashboard → App Settings.' },
    { key: 'environment', label: 'Environment', type: 'select', options: ['Production', 'Sandbox'], defaultValue: 'Production' },
    { key: 'delayStart', label: 'Delay Start (seconds)', type: 'number', placeholder: '0' },
  ],
  branch: [
    { key: 'branchKey', label: 'Branch Key', type: 'text', required: true, hint: 'Branch Dashboard → Account Settings → App.' },
    { key: 'branchSecret', label: 'Branch Secret', type: 'password', hint: 'Required for server-side calls.' },
    { key: 'enablePlugin', label: 'Enable Plugin', type: 'toggle' },
  ],
  slack: [
    { key: 'webhookUrl', label: 'Webhook URL', type: 'url', required: true, placeholder: 'https://hooks.slack.com/services/...' },
    { key: 'channel', label: 'Default Channel', type: 'text', placeholder: '#marketing-alerts' },
    { key: 'botName', label: 'Bot Name', type: 'text', defaultValue: 'CDP Bot' },
    { key: 'whitelistedEvents', label: 'Allowed Events', type: 'taglist', hint: 'Only these events will be sent to Slack.' },
  ],
  zendesk: [
    { key: 'email', label: 'Email', type: 'text', required: true, placeholder: 'agent@yourcompany.com' },
    { key: 'apiToken', label: 'API Token', type: 'password', required: true },
    { key: 'subdomain', label: 'Subdomain', type: 'text', required: true, placeholder: 'yourcompany' },
    { key: 'createUsersAsVerified', label: 'Create Users as Verified', type: 'toggle' },
  ],

  /* ─── DATA WAREHOUSE ─── */
  postgres: [
    { key: 'host', label: 'Host', type: 'text', required: true, placeholder: 'localhost' },
    { key: 'database', label: 'Database', type: 'text', required: true },
    { key: 'port', label: 'Port', type: 'number', defaultValue: '5432' },
    { key: 'user', label: 'Username', type: 'text', required: true },
    { key: 'password', label: 'Password', type: 'password', required: true },
    { key: 'sslMode', label: 'SSL Mode', type: 'select', options: ['disable','require','verify-ca','verify-full'], defaultValue: 'disable' },
    { key: 'namespace', label: 'Namespace (Schema)', type: 'text', placeholder: 'public' },
    { key: 'syncFrequency', label: 'Sync Frequency', type: 'select', options: ['30 minutes','1 hour','3 hours','6 hours','12 hours','24 hours'], defaultValue: '6 hours' },
  ],
  mysql: [
    { key: 'host', label: 'Host', type: 'text', required: true, placeholder: 'localhost' },
    { key: 'database', label: 'Database', type: 'text', required: true },
    { key: 'port', label: 'Port', type: 'number', defaultValue: '3306' },
    { key: 'user', label: 'Username', type: 'text', required: true },
    { key: 'password', label: 'Password', type: 'password', required: true },
    { key: 'namespace', label: 'Namespace (Schema)', type: 'text' },
    { key: 'syncFrequency', label: 'Sync Frequency', type: 'select', options: ['30 minutes','1 hour','3 hours','6 hours','12 hours','24 hours'], defaultValue: '6 hours' },
  ],
  redshift: [
    { key: 'host', label: 'Host', type: 'text', required: true, placeholder: 'cluster.region.redshift.amazonaws.com' },
    { key: 'database', label: 'Database', type: 'text', required: true, defaultValue: 'dev' },
    { key: 'port', label: 'Port', type: 'number', defaultValue: '5439' },
    { key: 'user', label: 'Username', type: 'text', required: true },
    { key: 'password', label: 'Password', type: 'password', required: true },
    { key: 'bucketName', label: 'S3 Staging Bucket', type: 'text' },
    { key: 'accessKeyId', label: 'AWS Access Key ID', type: 'text' },
    { key: 'secretAccessKey', label: 'AWS Secret Access Key', type: 'password' },
    { key: 'region', label: 'AWS Region', type: 'text', placeholder: 'ap-southeast-1' },
    { key: 'namespace', label: 'Namespace (Schema)', type: 'text' },
    { key: 'syncFrequency', label: 'Sync Frequency', type: 'select', options: ['30 minutes','1 hour','3 hours','6 hours','12 hours','24 hours'], defaultValue: '6 hours' },
  ],
  snowflake: [
    { key: 'account', label: 'Account', type: 'text', required: true, placeholder: 'orgname-accountname', hint: 'Snowflake URL: <account>.snowflakecomputing.com.' },
    { key: 'warehouse', label: 'Warehouse', type: 'text', required: true, defaultValue: 'COMPUTE_WH' },
    { key: 'database', label: 'Database', type: 'text', required: true },
    { key: 'schema', label: 'Schema', type: 'text', placeholder: 'PUBLIC' },
    { key: 'user', label: 'Username', type: 'text', required: true },
    { key: 'password', label: 'Password', type: 'password', required: true },
    { key: 'role', label: 'Role', type: 'text', placeholder: 'SYSADMIN' },
    { key: 'namespace', label: 'Namespace', type: 'text' },
    { key: 'syncFrequency', label: 'Sync Frequency', type: 'select', options: ['30 minutes','1 hour','3 hours','6 hours','12 hours','24 hours'], defaultValue: '6 hours' },
  ],
  bigquery: [
    { key: 'projectId', label: 'Project ID', type: 'text', required: true },
    { key: 'datasetId', label: 'Dataset ID', type: 'text' },
    { key: 'location', label: 'Location', type: 'select', options: ['US','EU','asia-southeast1','asia-east1','australia-southeast1'], defaultValue: 'US' },
    { key: 'credentials', label: 'Service Account JSON', type: 'textarea', required: true, placeholder: '{"type":"service_account",...}', hint: 'Paste your GCP Service Account key JSON.' },
    { key: 'namespace', label: 'Namespace', type: 'text' },
    { key: 'syncFrequency', label: 'Sync Frequency', type: 'select', options: ['30 minutes','1 hour','3 hours','6 hours','12 hours','24 hours'], defaultValue: '6 hours' },
  ],
  amazons3: [
    { key: 'bucket', label: 'S3 Bucket Name', type: 'text', required: true },
    { key: 'accessKeyId', label: 'Access Key ID', type: 'text', hint: 'Leave blank to use IAM role credentials.' },
    { key: 'secretAccessKey', label: 'Secret Access Key', type: 'password' },
    { key: 'region', label: 'Region', type: 'text', defaultValue: 'ap-southeast-1' },
    { key: 'prefix', label: 'Prefix (Folder)', type: 'text', placeholder: 'rudderstack/' },
    { key: 'enableSSE', label: 'Enable SSE', type: 'toggle' },
    { key: 'syncFrequency', label: 'Sync Frequency', type: 'select', options: ['30 minutes','1 hour','3 hours','6 hours','12 hours','24 hours'], defaultValue: '6 hours' },
  ],
  clickhouse: [
    { key: 'host', label: 'Host', type: 'text', required: true, placeholder: 'localhost' },
    { key: 'database', label: 'Database', type: 'text', required: true },
    { key: 'port', label: 'Port', type: 'number', defaultValue: '9000' },
    { key: 'user', label: 'Username', type: 'text', required: true, defaultValue: 'default' },
    { key: 'password', label: 'Password', type: 'password' },
    { key: 'cluster', label: 'Cluster', type: 'text', hint: 'ClickHouse cluster name for distributed setup.' },
    { key: 'namespace', label: 'Namespace', type: 'text' },
    { key: 'syncFrequency', label: 'Sync Frequency', type: 'select', options: ['30 minutes','1 hour','3 hours','6 hours','12 hours','24 hours'], defaultValue: '6 hours' },
  ],

  /* ─── STREAMING ─── */
  kafka: [
    { key: 'bootstrapServers', label: 'Bootstrap Servers', type: 'text', required: true, placeholder: 'broker1:9092,broker2:9092', hint: 'Comma-separated broker addresses.' },
    { key: 'topic', label: 'Topic', type: 'text', required: true, placeholder: 'rudderstack-events' },
    { key: 'securityProtocol', label: 'Security Protocol', type: 'select', options: ['PLAINTEXT','SSL','SASL_PLAINTEXT','SASL_SSL'], defaultValue: 'PLAINTEXT' },
    { key: 'sslCACert', label: 'SSL CA Certificate', type: 'textarea' },
    { key: 'saslType', label: 'SASL Type', type: 'select', options: ['','PLAIN','SCRAM-SHA-256','SCRAM-SHA-512','GSSAPI'] },
    { key: 'saslUsername', label: 'SASL Username', type: 'text' },
    { key: 'saslPassword', label: 'SASL Password', type: 'password' },
  ],
  redis: [
    { key: 'address', label: 'Address', type: 'text', required: true, placeholder: 'redis://localhost:6379' },
    { key: 'password', label: 'Password', type: 'password' },
    { key: 'dbIndex', label: 'DB Index', type: 'number', defaultValue: '0' },
    { key: 'secure', label: 'Secure (TLS)', type: 'toggle' },
    { key: 'skipVerify', label: 'Skip TLS Verify', type: 'toggle', hint: 'Not recommended in production.' },
    { key: 'clusterMode', label: 'Cluster Mode', type: 'toggle' },
    { key: 'prefix', label: 'Key Prefix', type: 'text', placeholder: 'rs_' },
  ],

  /* ─── WEBHOOK ─── */
  webhook: [
    { key: 'webhookUrl', label: 'Webhook URL', type: 'url', required: true, placeholder: 'https://hooks.example.com/endpoint' },
    { key: 'method', label: 'Method', type: 'select', required: true, options: ['POST','PUT','GET'], defaultValue: 'POST' },
    { key: 'headers', label: 'Headers', type: 'taglist', hint: 'One header per line: "Key: Value"' },
    { key: 'useOAuth', label: 'Use OAuth 2.0', type: 'toggle' },
  ],

  /* ─── MAUTIC ─── */
  mautic: [
    { key: 'baseUrl', label: 'Mautic Base URL', type: 'url', required: true, placeholder: 'https://mautic.example.com' },
    { key: 'username', label: 'Username', type: 'text', required: true },
    { key: 'password', label: 'Password', type: 'password', required: true },
    { key: 'createContactForLeads', label: 'Create Contact for Anonymous Events', type: 'toggle' },
    { key: 'updateExistingContacts', label: 'Update Existing Contacts', type: 'toggle', defaultValue: true },
  ],
};

const ALIASES = {
  ga4:               ['ga4','googleanalytics4'],
  googleanalyticsua: ['googleanalytics','googleanalyticsua','universalanalytics','ga3'],
  amplitude:         ['amplitude'],
  mixpanel:          ['mixpanel'],
  segment:           ['segment'],
  heap:              ['heap'],
  posthog:           ['posthog'],
  fullstory:         ['fullstory'],
  hotjar:            ['hotjar'],
  onesignal:         ['onesignal'],
  firebase:          ['firebase','fcm','firebasecloudmessaging'],
  appsflyer:         ['appsflyer'],
  facebookpixel:     ['facebookpixel','metapixel','facebookads','meta','facebook'],
  googleads:         ['googleads','googleadwords'],
  tiktok:            ['tiktok','tiktokads'],
  linkedin:          ['linkedin','linkedininsight'],
  hubspot:           ['hubspot'],
  salesforce:        ['salesforce','sfdc'],
  intercom:          ['intercom'],
  braze:             ['braze'],
  klaviyo:           ['klaviyo'],
  mailchimp:         ['mailchimp'],
  sendgrid:          ['sendgrid'],
  activecampaign:    ['activecampaign'],
  customerio:        ['customerio'],
  iterable:          ['iterable'],
  clevertap:         ['clevertap'],
  moengage:          ['moengage'],
  leanplum:          ['leanplum'],
  adjust:            ['adjust'],
  branch:            ['branch'],
  slack:             ['slack'],
  zendesk:           ['zendesk'],
  postgres:          ['postgres','postgresql'],
  mysql:             ['mysql'],
  redshift:          ['redshift','amazonredshift'],
  snowflake:         ['snowflake'],
  bigquery:          ['bigquery','googlebigquery'],
  amazons3:          ['s3','amazons3','awss3'],
  clickhouse:        ['clickhouse'],
  kafka:             ['kafka','apachekafka','confluentkafka'],
  redis:             ['redis'],
  webhook:           ['webhook','customwebhook'],
  mautic:            ['mautic'],
};

export function getDestConfig(item) {
  const id   = (item.id   || '').toLowerCase().replace(/[\s_\-\.]/g, '');
  const name = (item.name || '').toLowerCase().replace(/[\s_\-\.]/g, '');
  for (const [key, aliases] of Object.entries(ALIASES)) {
    if (aliases.some(a => id.includes(a) || name.includes(a))) {
      return DEST_CONFIGS[key] || null;
    }
  }
  return null;
}
