/*
  Content / Templates (Activation) — a single reusable content library,
  not one page per channel. A Content record holds exactly one
  channel's message; Campaigns reference content by id
  (CAMPAIGNS[].templateIds[]) rather than copying message bodies — see
  js/data/campaigns.js and js/pages/content.js renderUsage() for the
  reverse lookup that keeps reuse visible.

  Data source: 100% local mock data, synchronous, zero fetch/BFF calls.
  // TODO: Replace the mock content provider with a BFF endpoint when
  // the backend contract exists. getContentById() / addContent() /
  // updateContent() / duplicateContent() are the functions to swap.
*/

export const CONTENT_CHANNELS = ["Email", "Push", "Web Message", "In-App", "SMS", "Zalo"];
export const CONTENT_TYPES = ["Template"];
export const CONTENT_STATUSES = ["Draft", "Active"];
export const CONTENT_VARIABLES = ["{{first_name}}", "{{product_interest}}", "{{account_status}}"];

export const EMAIL_BLOCK_TYPES = ["Header", "Text", "Image", "Button", "Divider", "Spacer", "Columns", "Social", "Footer"];
export const WEB_MESSAGE_TEMPLATES = ["Banner", "Modal", "Interstitial", "Web Inbox"];
export const IN_APP_TEMPLATES = ["Banner", "Top Bar", "Bottom Bar", "Interstitial", "Image + Text", "Image Only", "Full Screen"];
export const LAYOUT_BLOCK_TYPES = ["Text", "Image", "Button", "Container"];

function pad2(n) {
  return String(n).padStart(2, "0");
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function today() {
  const d = new Date();
  return `${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export const CONTENT = [
  {
    id: "cnt-001",
    name: "Welcome New Account",
    channel: "Email",
    type: "Template",
    status: "Active",
    description: "Welcome message for newly registered accounts.",
    owner: "Marketing",
    updatedAt: "02 Oct 2026",
    version: "v2",
    versions: [
      { version: "v1", updatedAt: "20 Aug 2026", status: "Active" },
      { version: "v2", updatedAt: "02 Oct 2026", status: "Active" },
    ],
    email: {
      subject: "Chào mừng bạn đến với PHS!",
      previewText: "Tài khoản của bạn đã sẵn sàng. Bắt đầu hành trình đầu tư ngay hôm nay.",
      body: "Xin chào {{first_name}},\n\nCảm ơn bạn đã đăng ký tài khoản PHS. Chúng tôi rất vui được đồng hành cùng bạn trên hành trình đầu tư.\n\nKhám phá các sản phẩm phù hợp với {{product_interest}} của bạn ngay hôm nay.",
    },
  },
  {
    id: "cnt-002",
    name: "First Trade Reminder — Email",
    channel: "Email",
    type: "Template",
    status: "Active",
    description: "Reminder email encouraging funded customers to complete their first trade.",
    owner: "Growth",
    updatedAt: "05 Oct 2026",
    version: "v1",
    versions: [{ version: "v1", updatedAt: "05 Oct 2026", status: "Active" }],
    email: {
      subject: "Bạn đã sẵn sàng cho giao dịch đầu tiên?",
      previewText: "Hoàn tất giao dịch đầu tiên để bắt đầu trải nghiệm đầu tư.",
      body: "Xin chào {{first_name}},\n\nTài khoản của bạn đã sẵn sàng. Hãy hoàn tất giao dịch đầu tiên để khám phá các sản phẩm phù hợp với {{product_interest}}.",
    },
  },
  {
    id: "cnt-003",
    name: "First Trade Reminder — Push",
    channel: "Push",
    type: "Template",
    status: "Active",
    description: "Push notification encouraging funded customers to complete their first trade.",
    owner: "Growth",
    updatedAt: "05 Oct 2026",
    version: "v1",
    versions: [{ version: "v1", updatedAt: "05 Oct 2026", status: "Active" }],
    push: {
      title: "Sẵn sàng cho giao dịch đầu tiên?",
      body: "{{first_name}}, tài khoản của bạn đã sẵn sàng cho giao dịch đầu tiên.",
      deepLink: "/trading",
    },
  },
  {
    id: "cnt-004",
    name: "First Trade Reminder — Zalo",
    channel: "Zalo",
    type: "Template",
    status: "Draft",
    description: "Zalo OA message encouraging funded customers to complete their first trade.",
    owner: "Growth",
    updatedAt: "05 Oct 2026",
    version: "v1",
    versions: [{ version: "v1", updatedAt: "05 Oct 2026", status: "Draft" }],
    zalo: {
      title: "Sẵn sàng cho giao dịch đầu tiên?",
      message: "{{first_name}}, tài khoản của bạn đã sẵn sàng cho giao dịch đầu tiên với {{product_interest}}.",
      image: "",
      ctaLabel: "Giao dịch ngay",
      ctaLink: "/trading",
    },
  },
  {
    id: "cnt-005",
    name: "Reactivation Day 1",
    channel: "Zalo",
    type: "Template",
    status: "Draft",
    description: "First touchpoint in the reactivation sequence for dormant customers.",
    owner: "Lifecycle Team",
    updatedAt: "28 Sep 2026",
    version: "v1",
    versions: [{ version: "v1", updatedAt: "28 Sep 2026", status: "Draft" }],
    zalo: {
      title: "Chúng tôi nhớ bạn!",
      message: "{{first_name}}, đã lâu rồi chúng ta chưa gặp nhau! Thị trường có nhiều cơ hội mới dành cho bạn.",
      image: "",
      ctaLabel: "Khám phá ngay",
      ctaLink: "/dashboard",
    },
  },
  {
    id: "cnt-006",
    name: "Reactivation Day 3",
    channel: "Email",
    type: "Template",
    status: "Active",
    description: "Second touchpoint in the reactivation sequence for dormant customers.",
    owner: "Lifecycle Team",
    updatedAt: "28 Sep 2026",
    version: "v1",
    versions: [{ version: "v1", updatedAt: "28 Sep 2026", status: "Active" }],
    email: {
      subject: "Thị trường đang chờ bạn quay lại",
      previewText: "Nhiều cơ hội đầu tư mới phù hợp với {{product_interest}} của bạn.",
      body: "Xin chào {{first_name}},\n\nChúng tôi nhận thấy bạn chưa quay lại gần đây. Thị trường đã có nhiều thay đổi thú vị đang chờ bạn khám phá.",
    },
  },
  {
    id: "cnt-007",
    name: "eKYC Reminder — Email",
    channel: "Email",
    type: "Template",
    status: "Active",
    description: "Email reminder for customers with incomplete eKYC verification.",
    owner: "CRM Team",
    updatedAt: "01 Oct 2026",
    version: "v1",
    versions: [{ version: "v1", updatedAt: "01 Oct 2026", status: "Active" }],
    email: {
      subject: "Hoàn tất xác thực eKYC của bạn",
      previewText: "Chỉ mất vài phút để hoàn tất và bắt đầu giao dịch.",
      body: "Xin chào {{first_name}},\n\nTài khoản của bạn đang chờ hoàn tất eKYC. Vui lòng hoàn tất xác thực để bắt đầu giao dịch.",
    },
  },
  {
    id: "cnt-008",
    name: "eKYC Reminder — Zalo",
    channel: "Zalo",
    type: "Template",
    status: "Active",
    description: "Zalo OA reminder for customers with incomplete eKYC verification.",
    owner: "CRM Team",
    updatedAt: "01 Oct 2026",
    version: "v1",
    versions: [{ version: "v1", updatedAt: "01 Oct 2026", status: "Active" }],
    zalo: {
      title: "Hoàn tất xác thực eKYC",
      message: "{{first_name}}, bạn chưa hoàn tất xác thực eKYC. Hoàn tất ngay để bắt đầu giao dịch.",
      image: "",
      ctaLabel: "Xác thực ngay",
      ctaLink: "/ekyc",
    },
  },
  {
    id: "cnt-009",
    name: "Market Alert",
    channel: "SMS",
    type: "Template",
    status: "Draft",
    description: "Short-form SMS alert template for market or account notices.",
    owner: "CRM Team",
    updatedAt: "25 Sep 2026",
    version: "v1",
    versions: [{ version: "v1", updatedAt: "25 Sep 2026", status: "Draft" }],
    sms: {
      message: "PHS: {{first_name}}, tai khoan cua ban co cap nhat moi. Dang nhap de xem chi tiet.",
    },
  },
  {
    id: "cnt-010",
    name: "First Trade Reminder — Web Banner",
    channel: "Web Message",
    type: "Template",
    status: "Draft",
    description: "On-site banner encouraging funded customers to complete their first trade.",
    owner: "Growth",
    updatedAt: "05 Oct 2026",
    version: "v1",
    versions: [{ version: "v1", updatedAt: "05 Oct 2026", status: "Draft" }],
    webMessage: {
      template: "Banner",
      elements: [
        { id: "el-1", type: "Text", props: { text: "{{first_name}}, your account is ready for your first trade.", align: "left" } },
        { id: "el-2", type: "Button", props: { label: "Start Trading", link: "/trading" } },
      ],
    },
  },
  {
    id: "cnt-011",
    name: "Welcome In-App Banner",
    channel: "In-App",
    type: "Template",
    status: "Active",
    description: "In-app banner welcoming newly registered accounts.",
    owner: "Marketing",
    updatedAt: "02 Oct 2026",
    version: "v1",
    versions: [{ version: "v1", updatedAt: "02 Oct 2026", status: "Active" }],
    inApp: {
      template: "Image + Text",
      elements: [
        { id: "el-1", type: "Image", props: { url: "", alt: "Welcome" } },
        { id: "el-2", type: "Text", props: { text: "Welcome to PHS, {{first_name}}! Explore {{product_interest}} today.", align: "center" } },
        { id: "el-3", type: "Button", props: { label: "Get Started", link: "/home" } },
      ],
    },
  },
];

export function getContentById(id) {
  return CONTENT.find((c) => c.id === id);
}
export function usedByCampaigns(contentId, campaigns) {
  return campaigns.filter((c) => c.templateIds.includes(contentId));
}
export function channelFieldKey(channel) {
  return { Email: "email", Push: "push", "Web Message": "webMessage", "In-App": "inApp", SMS: "sms", Zalo: "zalo" }[channel];
}
export function templatesByChannel(channel) {
  return CONTENT.filter((c) => c.channel === channel);
}
export function nextContentId() {
  const n = CONTENT.reduce((max, c) => Math.max(max, Number(c.id.split("-")[1]) || 0), 0) + 1;
  return `cnt-${String(n).padStart(3, "0")}`;
}
export function addContent(record) {
  const content = {
    id: nextContentId(),
    versions: [{ version: "v1", updatedAt: today(), status: record.status || "Draft" }],
    version: "v1",
    updatedAt: today(),
    ...record,
  };
  CONTENT.push(content);
  return content;
}
export function updateContent(id, patch) {
  const content = getContentById(id);
  if (!content) return;
  Object.assign(content, patch, { updatedAt: today() });
  return content;
}
export function duplicateContent(id) {
  const source = getContentById(id);
  if (!source) return;
  const copy = JSON.parse(JSON.stringify(source));
  copy.id = nextContentId();
  copy.name = `${source.name} (Copy)`;
  copy.status = "Draft";
  copy.version = "v1";
  copy.versions = [{ version: "v1", updatedAt: today(), status: "Draft" }];
  CONTENT.push(copy);
  return copy;
}
