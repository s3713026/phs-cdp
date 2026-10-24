/**
 * Fetch full RudderStack connector catalog from GitHub
 * Run: node scripts/fetch-rs-catalog.js
 * Output: src/data/rs-catalog.json
 */
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const BASE_RAW = 'https://raw.githubusercontent.com/rudderlabs/rudder-integrations-config/main';
const BASE_API = 'https://api.github.com/repos/rudderlabs/rudder-integrations-config/contents';

function fetch(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'phs-cdp-bff/1.0' } }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode === 200) resolve(body);
        else reject(new Error(`HTTP ${res.statusCode} ${url}`));
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout: ' + url)); });
  });
}

async function fetchJSON(url) { return JSON.parse(await fetch(url)); }

// Map folder names to category for destinations
const DEST_CATEGORY_MAP = {
  // Analytics
  am: 'Analytics', mixpanel: 'Analytics', ga4: 'Analytics', google_analytics: 'Analytics',
  heap: 'Analytics', fullstory: 'Analytics', posthog: 'Analytics', hotjar: 'Analytics',
  matomo: 'Analytics', indicative: 'Analytics', chartbeat: 'Analytics', amplitude: 'Analytics',
  june: 'Analytics', june_analytics: 'Analytics', accoil_analytics: 'Analytics',
  // Advertising
  facebook_pixel: 'Advertising', google_ads: 'Advertising', bq: 'Data Warehouse',
  bingads: 'Advertising', bingads_audience: 'Advertising', pinterest_tag: 'Advertising',
  tiktok_ads: 'Advertising', snapchat: 'Advertising', adroll: 'Advertising',
  criteo: 'Advertising', reddit_pixel: 'Advertising', quora_pixel: 'Advertising',
  fb_custom_audience: 'Advertising', linkedin_insight_tag: 'Advertising',
  // Marketing
  braze: 'Marketing', klaviyo: 'Marketing', hs: 'Marketing', hubspot: 'Marketing',
  mautic: 'Marketing', mailchimp: 'Marketing', customer_io: 'Marketing',
  active_campaign: 'Marketing', intercom: 'Marketing', salesforce: 'Marketing',
  freshmarketer: 'Marketing', marketo: 'Marketing', pardot: 'Marketing',
  iterable: 'Marketing', clevertap: 'Marketing', moengage: 'Marketing',
  leanplum: 'Marketing', onesignal: 'Marketing', emarsys: 'Marketing',
  blueshift: 'Marketing', airship: 'Marketing', drip: 'Marketing',
  sendinblue: 'Marketing', ortto: 'Marketing', mailjet: 'Marketing',
  loops: 'Marketing', bloomreach: 'Marketing', attentive_tag: 'Marketing',
  // Data Warehouse
  rs: 'Data Warehouse', snowflake: 'Data Warehouse', bigquery: 'Data Warehouse',
  redshift: 'Data Warehouse', databricks: 'Data Warehouse', minio: 'Data Warehouse',
  s3: 'Data Warehouse', gcs: 'Data Warehouse', azure_blob: 'Data Warehouse',
  digitalocean: 'Data Warehouse', postgres: 'Data Warehouse', clickhouse: 'Data Warehouse',
  deltalake: 'Data Warehouse', azure_datalake: 'Data Warehouse', azure_synapse: 'Data Warehouse',
  // Streaming
  kafka: 'Streaming', kinesis: 'Streaming', kinesis_firehose: 'Streaming',
  eventbridge: 'Streaming', confluent: 'Streaming', azure_event_hub: 'Streaming',
  google_pubsub: 'Streaming', bqstream: 'Streaming',
  // Webhook
  webhook: 'Webhook / API', aws_lambda: 'Webhook / API', google_cloud_fn: 'Webhook / API',
  // Attribution
  af: 'Attribution', adj: 'Attribution', kochava: 'Attribution', branch: 'Attribution',
  appsflyer: 'Attribution',
  // Product
  pendo: 'Product', appcues: 'Product', gainsight: 'Product', candu: 'Product',
  // Monitoring
  bugsnag: 'Monitoring', new_relic: 'Monitoring', pagerduty: 'Monitoring', sentry: 'Monitoring',
  redis: 'Monitoring',
};

const POPULAR_DESTS = new Set(['am','mixpanel','ga4','facebook_pixel','google_ads','braze','hs','klaviyo','rs','snowflake','bq','postgres','webhook']);
const POPULAR_SRCS  = new Set(['javascript','android','ios','android_kotlin','ios_swift','node','python','amp','http','react_native','flutter','webhook']);

async function main() {
  const outDir = path.join(__dirname, '../src/data');
  fs.mkdirSync(outDir, { recursive: true });

  // ── Destinations ──────────────────────────────────────────────────────────
  console.log('Fetching destination folders...');
  const destFolders = (await fetchJSON(`${BASE_API}/src/configurations/destinations`))
    .filter(x => x.type === 'dir').map(x => x.name);
  console.log(`Found ${destFolders.length} destination folders`);

  const destinations = [];
  let di = 0;
  for (const folder of destFolders) {
    di++;
    try {
      const cfg = await fetchJSON(`${BASE_RAW}/src/configurations/destinations/${folder}/db-config.json`);
      const id   = (cfg.name || folder).toUpperCase().replace(/ /g,'_');
      const name = cfg.displayName || cfg.name || folder;
      const cat  = DEST_CATEGORY_MAP[folder] || DEST_CATEGORY_MAP[folder.toLowerCase()] || 'Other';
      const icon = cfg.options?.icon || folder;
      const tags = [];
      if (POPULAR_DESTS.has(folder)) tags.push('Popular');
      destinations.push({ id, folder, name, category: cat, icon, tags });
      if (di % 20 === 0) console.log(`  ${di}/${destFolders.length} destinations...`);
    } catch (e) {
      console.warn(`  skip dest ${folder}: ${e.message}`);
    }
  }

  // ── Sources ───────────────────────────────────────────────────────────────
  console.log('\nFetching source folders...');
  const srcFolders = (await fetchJSON(`${BASE_API}/src/configurations/sources`))
    .filter(x => x.type === 'dir').map(x => x.name);
  console.log(`Found ${srcFolders.length} source folders`);

  const SRC_CAT_MAP = {
    javascript:'EventStream',android:'EventStream',android_kotlin:'EventStream',
    ios:'EventStream',ios_swift:'EventStream',react_native:'EventStream',
    flutter:'EventStream',unity:'EventStream',cordova:'EventStream',
    amp:'EventStream',http:'EventStream',node:'EventStream',python:'EventStream',
    go:'EventStream',ruby:'EventStream',java:'EventStream',php:'EventStream',
    dotnet:'EventStream',kotlin:'EventStream',rust:'EventStream',
    webhook:'EventStream',segment:'EventStream',auth0:'EventStream',
    appcenter:'EventStream',firebase:'EventStream',shopify:'EventStream',
    // Cloud Extract
    google_analytics:'Cloud Extract',google_analytics_v4:'Cloud Extract',
    facebook_ads:'Cloud Extract',google_adwords:'Cloud Extract',
    hubspot:'Cloud Extract',salesforce:'Cloud Extract',mailchimp:'Cloud Extract',
    stripe:'Cloud Extract',mixpanel:'Cloud Extract',
    // Reverse ETL
    bigquery:'Reverse ETL',snowflake:'Reverse ETL',redshift:'Reverse ETL',
    postgres:'Reverse ETL',mysql:'Reverse ETL',databricks:'Reverse ETL',clickhouse:'Reverse ETL',
  };

  const sources = [];
  let si = 0;
  for (const folder of srcFolders) {
    si++;
    // Skip singer_ connectors (internal pipeline)
    if (folder.startsWith('singer_') || folder.startsWith('singer-')) continue;
    try {
      const cfg = await fetchJSON(`${BASE_RAW}/src/configurations/sources/${folder}/db-config.json`);
      const id   = cfg.name || folder;
      const name = cfg.displayName || cfg.name || folder;
      const cat  = SRC_CAT_MAP[folder] || SRC_CAT_MAP[folder.toLowerCase()] || 'EventStream';
      const icon = cfg.options?.icon || folder;
      const type = cfg.type || 'sdk';
      const tags = [];
      if (POPULAR_SRCS.has(folder)) tags.push('Popular');
      if (cfg.options?.isCloudEventBased) tags.push('Cloud');
      sources.push({ id, folder, name, category: cat, icon, type, tags });
    } catch (e) {
      console.warn(`  skip src ${folder}: ${e.message}`);
    }
  }

  const catalog = {
    generatedAt: new Date().toISOString(),
    destinations,
    sources,
  };

  const outFile = path.join(outDir, 'rs-catalog.json');
  fs.writeFileSync(outFile, JSON.stringify(catalog, null, 2));
  console.log(`\nDone! ${destinations.length} destinations, ${sources.length} sources`);
  console.log(`Saved to ${outFile}`);
}

main().catch(e => { console.error(e); process.exit(1); });
