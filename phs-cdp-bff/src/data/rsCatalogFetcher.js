/**
 * rsCatalogFetcher.js — fetches connector catalog from GitHub at BFF startup
 * Caches to rs-catalog-cache.json; refreshes in background if > 24h old.
 */
const https   = require('https');
const fs      = require('fs');
const path    = require('path');

const CACHE_FILE = path.join(__dirname, 'rs-catalog-cache.json');
const BASE_RAW   = 'https://raw.githubusercontent.com/rudderlabs/rudder-integrations-config/main';
const BASE_API   = 'https://api.github.com/repos/rudderlabs/rudder-integrations-config/contents';

let _catalog = null;

function fetchRaw(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'phs-cdp-bff/1.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302)
        return fetchRaw(res.headers.location).then(resolve).catch(reject);
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => res.statusCode === 200 ? resolve(body) : reject(new Error(`HTTP ${res.statusCode}`)));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}
async function fetchJSON(url) { return JSON.parse(await fetchRaw(url)); }


const DEST_CAT = {
  am:'Analytics',mixpanel:'Analytics',ga4:'Analytics',google_analytics:'Analytics',
  heap:'Analytics',fullstory:'Analytics',posthog:'Analytics',hotjar:'Analytics',
  matomo:'Analytics',indicative:'Analytics',chartbeat:'Analytics',june:'Analytics',
  facebook_pixel:'Advertising',google_ads:'Advertising',bingads:'Advertising',
  bingads_audience:'Advertising',pinterest_tag:'Advertising',tiktok_ads:'Advertising',
  snapchat:'Advertising',adroll:'Advertising',criteo:'Advertising',
  reddit_pixel:'Advertising',quora_pixel:'Advertising',fb_custom_audience:'Advertising',
  linkedin_insight_tag:'Advertising',
  braze:'Marketing',klaviyo:'Marketing',hs:'Marketing',hubspot:'Marketing',
  mautic:'Marketing',mailchimp:'Marketing',customer_io:'Marketing',
  active_campaign:'Marketing',intercom:'Marketing',salesforce:'Marketing',
  freshmarketer:'Marketing',marketo:'Marketing',pardot:'Marketing',
  iterable:'Marketing',clevertap:'Marketing',moengage:'Marketing',
  leanplum:'Marketing',onesignal:'Marketing',emarsys:'Marketing',
  blueshift:'Marketing',airship:'Marketing',drip:'Marketing',
  sendinblue:'Marketing',ortto:'Marketing',mailjet:'Marketing',
  loops:'Marketing',bloomreach:'Marketing',attentive_tag:'Marketing',
  rs:'Data Warehouse',snowflake:'Data Warehouse',bq:'Data Warehouse',
  redshift:'Data Warehouse',databricks:'Data Warehouse',minio:'Data Warehouse',
  s3:'Data Warehouse',gcs:'Data Warehouse',azure_blob:'Data Warehouse',
  postgres:'Data Warehouse',clickhouse:'Data Warehouse',deltalake:'Data Warehouse',
  bigquery:'Data Warehouse',
  kafka:'Streaming',kinesis:'Streaming',kinesis_firehose:'Streaming',
  eventbridge:'Streaming',confluent:'Streaming',azure_event_hub:'Streaming',
  google_pubsub:'Streaming',bqstream:'Streaming',
  webhook:'Webhook / API',aws_lambda:'Webhook / API',
  af:'Attribution',adj:'Attribution',kochava:'Attribution',branch:'Attribution',
  pendo:'Product',appcues:'Product',gainsight:'Product',
  bugsnag:'Monitoring',new_relic:'Monitoring',pagerduty:'Monitoring',sentry:'Monitoring',
};

const SRC_CAT = {
  javascript:'EventStream',android:'EventStream',android_kotlin:'EventStream',
  ios:'EventStream',ios_swift:'EventStream',react_native:'EventStream',
  flutter:'EventStream',unity:'EventStream',cordova:'EventStream',
  amp:'EventStream',http:'EventStream',node:'EventStream',python:'EventStream',
  go:'EventStream',ruby:'EventStream',java:'EventStream',php:'EventStream',
  dotnet:'EventStream',kotlin:'EventStream',rust:'EventStream',
  webhook:'EventStream',segment:'EventStream',auth0:'EventStream',
  shopify:'EventStream',
  google_analytics:'Cloud Extract',facebook_ads:'Cloud Extract',
  hubspot:'Cloud Extract',salesforce:'Cloud Extract',mailchimp:'Cloud Extract',
  bigquery:'Reverse ETL',snowflake:'Reverse ETL',redshift:'Reverse ETL',
  postgres:'Reverse ETL',mysql:'Reverse ETL',databricks:'Reverse ETL',clickhouse:'Reverse ETL',
};

const POPULAR_D = new Set(['am','mixpanel','ga4','facebook_pixel','google_ads','braze',
  'hs','klaviyo','rs','snowflake','bq','postgres','webhook','mautic','customer_io','intercom']);
const POPULAR_S = new Set(['javascript','android','android_kotlin','ios','ios_swift',
  'node','python','amp','http','react_native','flutter','webhook']);

const SIMPLE_ICONS = {
  amplitude:'amplitude',mixpanel:'mixpanel',ga4:'googleanalytics',
  google_analytics:'googleanalytics',fullstory:'fullstory',posthog:'posthog',
  hotjar:'hotjar',matomo:'matomo',
  facebook_pixel:'facebook',google_ads:'googleads',linkedin_insight_tag:'linkedin',
  tiktok_ads:'tiktok',snapchat:'snapchat',criteo:'criteo',
  braze:'braze',klaviyo:'klaviyo',hs:'hubspot',hubspot:'hubspot',
  mailchimp:'mailchimp',intercom:'intercom',salesforce:'salesforce',
  marketo:'marketo',iterable:'iterable',moengage:'moengage',onesignal:'onesignal',
  customer_io:'customerio',
  mautic:'mautic',segment:'segment',shopify:'shopify',
  postgres:'postgresql',bq:'googlebigquery',snowflake:'snowflake',
  rs:'amazonredshift',redshift:'amazonredshift',databricks:'databricks',
  s3:'amazons3',gcs:'googlecloudstorage',
  kafka:'apachekafka',kinesis:'amazonkinesis',
  javascript:'javascript',node:'nodedotjs',python:'python',
  go:'go',ruby:'ruby',java:'java',php:'php',dotnet:'dotnet',kotlin:'kotlin',
  flutter:'flutter',unity:'unity',android:'android',ios:'swift',ios_swift:'swift',
  react_native:'react',amp:'amp',auth0:'auth0',
  af:'appsflyer',adj:'adjust',
  pendo:'pendo',sentry:'sentry',pagerduty:'pagerduty',
};

function logoUrl(folder) {
  const slug = SIMPLE_ICONS[folder] || SIMPLE_ICONS[folder.toLowerCase()] || null;
  return slug ? `https://cdn.simpleicons.org/${slug}` : null;
}


async function fetchAll(folders, baseRaw, catMap, popularSet, kind) {
  const results = [];
  const CONCURRENCY = 6;
  let i = 0;
  async function worker() {
    while (i < folders.length) {
      const folder = folders[i++];
      if (folder.startsWith('singer_') || folder.startsWith('singer-')) continue;
      try {
        const cfg  = await fetchJSON(`${baseRaw}/${folder}/db-config.json`);
        const name = cfg.displayName || cfg.name || folder;
        const id   = kind === 'destination'
          ? (cfg.name || folder).toUpperCase().replace(/[^A-Z0-9]/g,'_')
          : (cfg.name || folder);
        const cat  = catMap[folder] || (kind === 'destination' ? 'Other' : 'EventStream');
        const logo = logoUrl(folder);
        const tags = popularSet.has(folder) ? ['Popular'] : [];
        results.push({ id, folder, name, category: cat, logo, tags, type: cfg.type });
      } catch (_) { /* skip missing configs */ }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return results;
}

async function buildCatalog() {
  console.log('[RS Catalog] Fetching from GitHub...');
  const [destFolders, srcFolders] = await Promise.all([
    fetchJSON(`${BASE_API}/src/configurations/destinations`)
      .then(d => d.filter(x => x.type === 'dir').map(x => x.name)),
    fetchJSON(`${BASE_API}/src/configurations/sources`)
      .then(d => d.filter(x => x.type === 'dir').map(x => x.name)),
  ]);
  console.log(`[RS Catalog] Folders: ${destFolders.length} dest, ${srcFolders.length} src`);
  const [destinations, sources] = await Promise.all([
    fetchAll(destFolders, `${BASE_RAW}/src/configurations/destinations`, DEST_CAT, POPULAR_D, 'destination'),
    fetchAll(srcFolders,  `${BASE_RAW}/src/configurations/sources`,      SRC_CAT,  POPULAR_S, 'source'),
  ]);
  console.log(`[RS Catalog] Built: ${destinations.length} dest, ${sources.length} src`);
  const catalog = { generatedAt: new Date().toISOString(), destinations, sources };
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(catalog)); } catch (_) {}
  return catalog;
}


function getBuiltinFallback() {
  return {
    generatedAt: new Date().toISOString(),
    destinations: [
      { id:'AMPLITUDE',     folder:'am',           name:'Amplitude',          category:'Analytics',     logo:'https://cdn.simpleicons.org/amplitude',      tags:['Popular'] },
      { id:'MIXPANEL',      folder:'mixpanel',      name:'Mixpanel',           category:'Analytics',     logo:'https://cdn.simpleicons.org/mixpanel',       tags:['Popular'] },
      { id:'GA4',           folder:'ga4',           name:'Google Analytics 4', category:'Analytics',     logo:'https://cdn.simpleicons.org/googleanalytics', tags:['Popular'] },
      { id:'FULLSTORY',     folder:'fullstory',     name:'FullStory',          category:'Analytics',     logo:'https://cdn.simpleicons.org/fullstory',      tags:[] },
      { id:'POSTHOG',       folder:'posthog',       name:'PostHog',            category:'Analytics',     logo:'https://cdn.simpleicons.org/posthog',        tags:[] },
      { id:'HOTJAR',        folder:'hotjar',        name:'Hotjar',             category:'Analytics',     logo:'https://cdn.simpleicons.org/hotjar',         tags:[] },
      { id:'FACEBOOK_PIXEL',folder:'facebook_pixel',name:'Facebook Pixel',     category:'Advertising',   logo:'https://cdn.simpleicons.org/facebook',       tags:['Popular'] },
      { id:'GOOGLE_ADS',    folder:'google_ads',    name:'Google Ads',         category:'Advertising',   logo:'https://cdn.simpleicons.org/googleads',      tags:['Popular'] },
      { id:'TIKTOK_ADS',    folder:'tiktok_ads',   name:'TikTok Ads',         category:'Advertising',   logo:'https://cdn.simpleicons.org/tiktok',         tags:[] },
      { id:'LINKEDIN',      folder:'linkedin_insight_tag',name:'LinkedIn',     category:'Advertising',   logo:'https://cdn.simpleicons.org/linkedin',       tags:[] },
      { id:'BRAZE',         folder:'braze',         name:'Braze',              category:'Marketing',     logo:'https://cdn.simpleicons.org/braze',          tags:['Popular'] },
      { id:'KLAVIYO',       folder:'klaviyo',       name:'Klaviyo',            category:'Marketing',     logo:'https://cdn.simpleicons.org/klaviyo',        tags:['Popular'] },
      { id:'HUBSPOT',       folder:'hs',            name:'HubSpot',            category:'Marketing',     logo:'https://cdn.simpleicons.org/hubspot',        tags:['Popular'] },
      { id:'MAUTIC',        folder:'mautic',        name:'Mautic',             category:'Marketing',     logo:'https://cdn.simpleicons.org/mautic',         tags:[] },
      { id:'MAILCHIMP',     folder:'mailchimp',     name:'Mailchimp',          category:'Marketing',     logo:'https://cdn.simpleicons.org/mailchimp',      tags:[] },
      { id:'CUSTOMER_IO',   folder:'customer_io',   name:'Customer.io',        category:'Marketing',     logo:'https://cdn.simpleicons.org/customerio',     tags:['Popular'] },
      { id:'INTERCOM',      folder:'intercom',      name:'Intercom',           category:'Marketing',     logo:'https://cdn.simpleicons.org/intercom',       tags:['Popular'] },
      { id:'SALESFORCE',    folder:'salesforce',    name:'Salesforce',         category:'Marketing',     logo:'https://cdn.simpleicons.org/salesforce',     tags:[] },
      { id:'POSTGRES',      folder:'postgres',      name:'PostgreSQL',         category:'Data Warehouse',logo:'https://cdn.simpleicons.org/postgresql',     tags:['Popular'] },
      { id:'BIGQUERY',      folder:'bq',            name:'Google BigQuery',    category:'Data Warehouse',logo:'https://cdn.simpleicons.org/googlebigquery',  tags:['Popular'] },
      { id:'SNOWFLAKE',     folder:'snowflake',     name:'Snowflake',          category:'Data Warehouse',logo:'https://cdn.simpleicons.org/snowflake',      tags:['Popular'] },
      { id:'REDSHIFT',      folder:'rs',            name:'Amazon Redshift',    category:'Data Warehouse',logo:'https://cdn.simpleicons.org/amazonredshift',  tags:['Popular'] },
      { id:'DATABRICKS',    folder:'databricks',    name:'Databricks',         category:'Data Warehouse',logo:'https://cdn.simpleicons.org/databricks',     tags:[] },
      { id:'S3',            folder:'s3',            name:'Amazon S3',          category:'Data Warehouse',logo:'https://cdn.simpleicons.org/amazons3',       tags:[] },
      { id:'KAFKA',         folder:'kafka',         name:'Apache Kafka',       category:'Streaming',     logo:'https://cdn.simpleicons.org/apachekafka',    tags:[] },
      { id:'KINESIS',       folder:'kinesis',       name:'Amazon Kinesis',     category:'Streaming',     logo:'https://cdn.simpleicons.org/amazonkinesis',  tags:[] },
      { id:'WEBHOOK',       folder:'webhook',       name:'Webhook',            category:'Webhook / API', logo:null,                                         tags:['Popular'] },
      { id:'AWS_LAMBDA',    folder:'aws_lambda',    name:'AWS Lambda',         category:'Webhook / API', logo:null,                                         tags:[] },
      { id:'APPSFLYER',     folder:'af',            name:'AppsFlyer',          category:'Attribution',   logo:'https://cdn.simpleicons.org/appsflyer',      tags:[] },
      { id:'ADJUST',        folder:'adj',           name:'Adjust',             category:'Attribution',   logo:'https://cdn.simpleicons.org/adjust',         tags:[] },
      { id:'PENDO',         folder:'pendo',         name:'Pendo',              category:'Product',       logo:'https://cdn.simpleicons.org/pendo',          tags:[] },
      { id:'SENTRY',        folder:'sentry',        name:'Sentry',             category:'Monitoring',    logo:'https://cdn.simpleicons.org/sentry',         tags:[] },
    ],
    sources: [
      { id:'javascript',   folder:'javascript',   name:'JavaScript',      category:'EventStream', logo:'https://cdn.simpleicons.org/javascript', tags:['Popular'] },
      { id:'android',      folder:'android',      name:'Android (Java)',   category:'EventStream', logo:'https://cdn.simpleicons.org/android',    tags:['Popular'] },
      { id:'android_kotlin',folder:'android_kotlin',name:'Android (Kotlin)',category:'EventStream',logo:'https://cdn.simpleicons.org/android',   tags:[] },
      { id:'ios',          folder:'ios',          name:'iOS (Obj-C)',      category:'EventStream', logo:'https://cdn.simpleicons.org/apple',      tags:[] },
      { id:'ios_swift',    folder:'ios_swift',    name:'iOS (Swift)',      category:'EventStream', logo:'https://cdn.simpleicons.org/swift',      tags:['Popular'] },
      { id:'react_native', folder:'react_native', name:'React Native',    category:'EventStream', logo:'https://cdn.simpleicons.org/react',      tags:[] },
      { id:'flutter',      folder:'flutter',      name:'Flutter',         category:'EventStream', logo:'https://cdn.simpleicons.org/flutter',    tags:[] },
      { id:'node',         folder:'node',         name:'Node.js',         category:'EventStream', logo:'https://cdn.simpleicons.org/nodedotjs',  tags:['Popular'] },
      { id:'python',       folder:'python',       name:'Python',          category:'EventStream', logo:'https://cdn.simpleicons.org/python',     tags:['Popular'] },
      { id:'go',           folder:'go',           name:'Go',              category:'EventStream', logo:'https://cdn.simpleicons.org/go',         tags:[] },
      { id:'ruby',         folder:'ruby',         name:'Ruby',            category:'EventStream', logo:'https://cdn.simpleicons.org/ruby',       tags:[] },
      { id:'java',         folder:'java',         name:'Java',            category:'EventStream', logo:'https://cdn.simpleicons.org/java',       tags:[] },
      { id:'php',          folder:'php',          name:'PHP',             category:'EventStream', logo:'https://cdn.simpleicons.org/php',        tags:[] },
      { id:'amp',          folder:'amp',          name:'AMP',             category:'EventStream', logo:'https://cdn.simpleicons.org/amp',        tags:['Popular'] },
      { id:'http',         folder:'http',         name:'HTTP API',        category:'EventStream', logo:null,                                     tags:['Popular'] },
      { id:'webhook',      folder:'webhook',      name:'Webhook',         category:'EventStream', logo:null,                                     tags:['Popular'] },
      { id:'auth0',        folder:'auth0',        name:'Auth0',           category:'EventStream', logo:'https://cdn.simpleicons.org/auth0',      tags:[] },
      { id:'shopify',      folder:'shopify',      name:'Shopify',         category:'EventStream', logo:'https://cdn.simpleicons.org/shopify',    tags:[] },
      { id:'postgres',     folder:'postgres',     name:'PostgreSQL',      category:'Reverse ETL', logo:'https://cdn.simpleicons.org/postgresql', tags:[] },
      { id:'snowflake',    folder:'snowflake',    name:'Snowflake',       category:'Reverse ETL', logo:'https://cdn.simpleicons.org/snowflake',  tags:[] },
      { id:'bigquery',     folder:'bigquery',     name:'BigQuery',        category:'Reverse ETL', logo:'https://cdn.simpleicons.org/googlebigquery',tags:[] },
    ],
  };
}

async function getCatalog() {
  if (_catalog) return _catalog;
  if (fs.existsSync(CACHE_FILE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      const age = Date.now() - new Date(cached.generatedAt).getTime();
      _catalog = cached;
      if (age > 86400_000) {
        buildCatalog().then(c => { _catalog = c; })
          .catch(e => console.warn('[RS Catalog] refresh failed:', e.message));
      }
      return _catalog;
    } catch (_) {}
  }
  try {
    _catalog = await buildCatalog();
  } catch (e) {
    console.warn('[RS Catalog] GitHub unavailable, using fallback:', e.message);
    _catalog = getBuiltinFallback();
  }
  return _catalog;
}

module.exports = { getCatalog };
