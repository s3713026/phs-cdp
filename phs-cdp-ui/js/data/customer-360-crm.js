/*
  PHS CDP — Customer 360 CRM / eKYC / Support-ticket mock data.

  Customer-360-scoped only. Does NOT modify js/data/customers.js — the
  5 existing CUSTOMERS records stay the single source of truth for
  identity/behavior/engagement; this file only adds CRM-classification
  and customer-care records, linked by the existing CUSTOMERS[].id.

  SOURCE GROUNDING — field names and representative values below are
  taken from two real PHS workbooks inspected for this task (both live
  outside this repo, under "Phu Hung Securities/Big project/"):
    - "CCC gọi Failed E-kyc Accounts.xlsx" (33 rows) → EKYC_FOLLOWUPS
      shape: NO., Trans ID, Status, Step, Branch, Account, Email, Phone
      number, Created date, Error, PIC, Ngày gọi, Số lần follow,
      Tình Trạng, Kết quả cuộc gọi "nghe máy", CS comment, CS Follow.
      Email/Phone number/CS Follow were 100% empty in the real sample —
      kept absent here too rather than invented. Only 2 PIC names
      appeared (Mai, Hà); reused. `Status` was always "DOING" in the
      sample (no variance) — not treated as a useful signal.
    - "Báo cáo Ticket mẫu.xlsx" (14 rows) → SUPPORT_TICKETS shape:
      Ngày tạo, Mã Ticket, Phân loại, Danh mục hỗ trợ, Số tài khoản,
      Loại khách hàng, Nguồn Ticket, Tình trạng, Mức độ ưu tiên, Mô tả,
      Hướng xử lý, Phân loại VIP, Tổng thời gian, Tổng thời gian xử lý,
      Giao cho. Same 2 staff names appeared in "Giao cho" as the eKYC
      sheet's PIC column.

  TWO VALUES BELOW GO BEYOND WHAT THE 14-ROW TICKET SAMPLE SHOWS, and
  are flagged at their definition site:
    1. Tình trạng "Đang xử lý" (in progress) — the real sample only
       ever showed "Đã đóng" / "Đã hủy" (both terminal). Without an
       in-progress example, the "unresolved ticket" recommendation
       rule (Rule D) would never have anything to fire on.
    2. Mức độ ưu tiên "Cao" — the real sample only ever showed
       "Bình thường".
  Everything else below mirrors an actually-observed value or pattern
  from the source (e.g. the two real "CMSN" / VIP Gold / Zalo tickets
  are mirrored almost exactly for a High Engagement Gold customer).

  "Tổng thời gian" vs "Tổng thời gian xử lý": pairwise comparison across
  all 14 real rows showed no consistent ordering (sometimes equal,
  sometimes either one larger) — their exact semantic difference could
  not be determined from the sample. Both are kept as opaque duration
  figures under their literal Vietnamese labels; no derived "SLA" or
  "resolution speed" metric is computed from their difference anywhere
  in this module.
*/

import { CUSTOMERS, getCustomerById } from "./customers.js";
import { GOLDEN_CUSTOMER } from "./customer-360-golden.js";

// The Golden Customer fixture (see customer-360-golden.js for why it
// lives outside customers.js) still needs to resolve through this
// file's own id lookups below — folded in once here rather than at
// every call site.
function resolveCustomerIncludingGolden(customerId) {
  return getCustomerById(customerId) || (customerId === GOLDEN_CUSTOMER.id ? GOLDEN_CUSTOMER : undefined);
}

/* ------------------------------------------------------------------ */
/* CRM classification (A–H)                                            */
/* Not found in either inspected workbook — reproduced exactly as      */
/* specified in the enhancement task itself (business taxonomy as      */
/* given, not discovered in a source file). These describe a lead /    */
/* customer-care CONTACT OUTCOME, never an investment-risk score, a    */
/* confirmed lifecycle stage, or a prediction of value/intent.         */
/* ------------------------------------------------------------------ */
export const CRM_CLASSIFICATIONS = [
  { code: "A", label: "Rất tiềm năng" },
  { code: "B", label: "Tiềm năng" },
  { code: "C", label: "Nuôi dưỡng" },
  { code: "D", label: "Không tiềm năng" },
  { code: "E", label: "Không nghe máy" },
  { code: "F", label: "SĐT không hợp lệ" },
  { code: "G", label: "Không có SĐT (chỉ gửi mail)" },
  { code: "H", label: "Tài khoản ảo" },
];

export function getClassificationLabel(code) {
  return CRM_CLASSIFICATIONS.find((c) => c.code === code)?.label;
}

/* One CRM link per customer who is actually in an active lead/
 * reactivation-contact workflow — NOT every customer has one. An
 * already-onboarded active or engaged investor correctly has NO
 * classification record (see getClassificationForCustomer below). */
export const CUSTOMER_CRM_LINKS = [
  {
    customerId: "PHS-CUS-1002833", // Lê Hoàng Nam — New User
    classificationCode: "B",
    lastContactDate: "16 Sep 2026",
    lastContactOutcome: "Nghe máy — trao đổi",
    followUpAttempts: 1,
    source: "CS call log",
  },
  {
    customerId: "PHS-CUS-1002835", // Demo Profile 5 — Dormant Customer
    classificationCode: "E",
    lastContactDate: "03 Jul 2026",
    lastContactOutcome: "Không nghe máy",
    followUpAttempts: 3,
    source: "CS call log",
  },
  // Golden Customer fixture — classification used here in a
  // POST-conversion, relationship/upsell-scoring sense (CS continuing
  // to nurture a newly-active investor toward deeper engagement), not
  // a pre-registration lead sense. Precedented above: Demo Profile 5
  // already reuses this same taxonomy for a dormant-reactivation
  // contact, so classification isn't limited to brand-new leads.
  {
    customerId: "PHS-CUS-GOLDEN-001",
    classificationCode: "A",
    lastContactDate: "10 Sep 2026",
    lastContactOutcome: "Nghe máy — trao đổi",
    followUpAttempts: 1,
    source: "CS call log",
  },
];

export function getClassificationForCustomer(customerId) {
  return CUSTOMER_CRM_LINKS.find((l) => l.customerId === customerId);
}

/* ------------------------------------------------------------------ */
/* eKYC follow-up records                                              */
/* Scoped to customers still early in onboarding — this is literally   */
/* what the source workbook tracks (CS calling customers whose eKYC    */
/* failed). An already-onboarded customer correctly has none.          */
/* ------------------------------------------------------------------ */
export const EKYC_FOLLOWUPS = [
  {
    id: "ekyc-0001",
    customerId: "PHS-CUS-1002833", // Lê Hoàng Nam
    transId: "a14f2c8e-7b31-4d9a-9e6c-1f2a3b4c5d6e",
    status: "DOING",
    step: "EKYC",
    error: "Giấy tờ không hợp lệ, bị mờ/bóng",
    pic: "Mai",
    callDate: "16 Sep 2026",
    followCount: "Lần 1",
    reachability: "Nghe máy",
    callOutcome: "KH cần thử lại",
    csComment: "KH sẽ thử lại sau.",
  },
  // Golden Customer fixture — deliberately the ONE clean/resolved
  // record, no `error` field. Rule A (customer-360-recommendations.js)
  // fires on ANY row with a truthy `.error`, with no resolution-
  // awareness — a historical "failed, later fixed" row would make
  // Rule A misfire forever for a customer long past eKYC, and the
  // rule engine must not be patched just to fit this profile. `status`
  // is kept "DOING" (the only value ever observed in the real source
  // sample, documented above as not a useful signal) rather than
  // inventing a new value for the resolved case.
  {
    id: "ekyc-golden-0001",
    customerId: "PHS-CUS-GOLDEN-001",
    transId: "f00dba55-7b31-4d9a-9e6c-1f2a3b4c5d6e",
    status: "DOING",
    step: "EKYC",
    pic: "Hà",
    callDate: "09 Jul 2026",
    followCount: "Lần 1",
    reachability: "Nghe máy",
    callOutcome: "Thành công",
    csComment: "KH đã xác thực thành công, không cần theo dõi thêm.",
  },
];

export function getEkycFollowupsForCustomer(customerId) {
  return EKYC_FOLLOWUPS.filter((r) => r.customerId === customerId);
}

/* ------------------------------------------------------------------ */
/* Support tickets                                                      */
/* ------------------------------------------------------------------ */
function customerTypeFor(customer) {
  const hasTradingAccount = customer?.attributes?.["Trading Account"] && customer.attributes["Trading Account"] !== "—";
  return hasTradingAccount ? "KH có tài khoản" : "KH không có tài khoản";
}

export const SUPPORT_TICKETS = [
  {
    id: "ticket-0001",
    code: "#160926001",
    customerId: "PHS-CUS-1002831", // Nguyễn Minh Anh
    createdDate: "16 Sep 2026",
    classification: "Tư vấn thông tin",
    category: "Flash API",
    source: "Email",
    status: "Đã đóng",
    priority: "Bình thường",
    description: "KH hỏi về tích hợp Flash API cho giao dịch tự động.",
    resolution: "CCC đã gửi tài liệu hướng dẫn tích hợp.",
    vipClassification: "Bình thường",
    totalTime: "48",
    totalProcessingTime: "48",
    assignedTo: "Thái Thị Hà (hathai@phs.vn)",
  },
  {
    id: "ticket-0002",
    code: "#170926004",
    customerId: "PHS-CUS-1002832", // Trần Quốc Bảo
    createdDate: "17 Sep 2026",
    classification: "Yêu cầu xử lý",
    category: "Quản lý Tài khoản PHS",
    source: "Hotline",
    // Beyond the observed sample (see module header note #1) — the
    // real 14-row sample never showed an in-progress ticket; this
    // value exists so an "unresolved ticket" recommendation has a
    // real record to point to.
    status: "Đang xử lý",
    // Beyond the observed sample (see module header note #2).
    priority: "Cao",
    description: "KH yêu cầu cập nhật thông tin tài khoản giao dịch.",
    resolution: "",
    vipClassification: "Bình thường",
    totalTime: "2",
    totalProcessingTime: "0",
    assignedTo: "Đỗ Thị Như Mai (maido@phs.vn)",
  },
  {
    id: "ticket-0003",
    code: "#160926010",
    customerId: "PHS-CUS-1002833", // Lê Hoàng Nam
    createdDate: "16 Sep 2026",
    classification: "Khác",
    category: "Failed E-Kyc",
    source: "Hotline",
    status: "Đã đóng",
    priority: "Bình thường",
    description: "CS liên hệ KH về lỗi eKYC.",
    resolution: "CS liên hệ KH failed eKYC, hướng dẫn chụp lại giấy tờ.",
    vipClassification: "",
    totalTime: "0",
    totalProcessingTime: "1",
    assignedTo: "Đỗ Thị Như Mai (maido@phs.vn)",
  },
  // The two tickets below mirror an actually-observed repeated-ticket
  // pattern from the real sample closely (two real rows: same
  // category "CMSN", same "Đã đóng" status, same "VIP Gold", same
  // "Zalo" source) — used here to demonstrate the "repeated issue"
  // recommendation rule on a real, not invented, pattern.
  {
    id: "ticket-0004",
    code: "#140926002",
    customerId: "PHS-CUS-1002834", // Phạm Thu Hà
    createdDate: "14 Sep 2026",
    classification: "Khác",
    category: "CMSN",
    source: "Zalo",
    status: "Đã đóng",
    priority: "Bình thường",
    description: "Gửi ZNS CMSN KH VIP",
    resolution: "Gửi ZNS thành công",
    vipClassification: "VIP Gold",
    totalTime: "1",
    totalProcessingTime: "0",
    assignedTo: "Thái Thị Hà (hathai@phs.vn)",
  },
  {
    id: "ticket-0005",
    code: "#170926012",
    customerId: "PHS-CUS-1002834", // Phạm Thu Hà
    createdDate: "17 Sep 2026",
    classification: "Khác",
    category: "CMSN",
    source: "Zalo",
    status: "Đã đóng",
    priority: "Bình thường",
    description: "Gửi ZNS CMSN KH VIP",
    resolution: "Gửi ZNS thành công",
    vipClassification: "VIP Gold",
    totalTime: "0",
    totalProcessingTime: "0",
    assignedTo: "Thái Thị Hà (hathai@phs.vn)",
  },
  {
    id: "ticket-0006",
    code: "#030726006",
    customerId: "PHS-CUS-1002835", // Demo Profile 5
    createdDate: "03 Jul 2026",
    classification: "Khác",
    category: "Dịch vụ CSKH",
    source: "Email",
    status: "Đã hủy",
    priority: "Bình thường",
    description: "KH không phản hồi sau nhiều lần liên hệ.",
    resolution: "",
    vipClassification: "Bình thường",
    totalTime: "0",
    totalProcessingTime: "0",
    assignedTo: "Đỗ Thị Như Mai (maido@phs.vn)",
  },
  // Golden Customer fixture — one historical resolved ticket in a
  // distinct category, plus a resolved/open PAIR in the SAME category
  // ("Quản lý Tài khoản PHS") so Rule E (repeated category) and Rule D
  // (open ticket, "Cao" priority) both genuinely fire. "Đang xử lý" /
  // "Cao" reuse the exact synthetic-beyond-sample values already
  // flagged at the top of this file, rather than inventing a third.
  {
    id: "ticket-golden-0001",
    code: "#100726003",
    customerId: "PHS-CUS-GOLDEN-001",
    createdDate: "10 Jul 2026",
    classification: "Tư vấn thông tin",
    category: "Mở tài khoản",
    source: "Hotline",
    status: "Đã đóng",
    priority: "Bình thường",
    description: "KH hỏi về quy trình mở tài khoản giao dịch và xác thực eKYC.",
    resolution: "CCC đã hướng dẫn KH hoàn tất mở tài khoản.",
    vipClassification: "VIP Gold",
    totalTime: "3",
    totalProcessingTime: "2",
    assignedTo: "Thái Thị Hà (hathai@phs.vn)",
  },
  {
    id: "ticket-golden-0002",
    code: "#200826007",
    customerId: "PHS-CUS-GOLDEN-001",
    createdDate: "20 Aug 2026",
    classification: "Yêu cầu xử lý",
    category: "Quản lý Tài khoản PHS",
    source: "Email",
    status: "Đã đóng",
    priority: "Bình thường",
    description: "KH yêu cầu cập nhật thông tin liên hệ trên tài khoản giao dịch.",
    resolution: "CCC đã cập nhật thông tin theo yêu cầu.",
    vipClassification: "VIP Gold",
    totalTime: "4",
    totalProcessingTime: "3",
    assignedTo: "Đỗ Thị Như Mai (maido@phs.vn)",
  },
  {
    id: "ticket-golden-0003",
    code: "#100926011",
    customerId: "PHS-CUS-GOLDEN-001",
    createdDate: "10 Sep 2026",
    classification: "Yêu cầu xử lý",
    category: "Quản lý Tài khoản PHS",
    source: "Hotline",
    status: "Đang xử lý",
    priority: "Cao",
    description: "KH yêu cầu nâng hạn mức giao dịch trực tuyến cho tài khoản VIP.",
    resolution: "",
    vipClassification: "VIP Gold",
    totalTime: "2",
    totalProcessingTime: "0",
    assignedTo: "Đỗ Thị Như Mai (maido@phs.vn)",
  },
];

export function getTicketsForCustomer(customerId) {
  return SUPPORT_TICKETS.filter((t) => t.customerId === customerId);
}

/** "Loại khách hàng" is derived from the customer's own existing
 * Trading Account attribute (already in customers.js, or the Golden
 * Customer fixture) rather than stored redundantly on every ticket
 * record. */
export function getCustomerTypeLabel(customerId) {
  const customer = resolveCustomerIncludingGolden(customerId);
  return customerTypeFor(customer);
}

/* ------------------------------------------------------------------ */
/* Sanity check (dev-time only) — every link above must resolve to a   */
/* real CUSTOMERS id, and vice versa nothing is silently orphaned.     */
/* ------------------------------------------------------------------ */
const knownIds = new Set([...CUSTOMERS.map((c) => c.id), GOLDEN_CUSTOMER.id]);
[...CUSTOMER_CRM_LINKS, ...EKYC_FOLLOWUPS, ...SUPPORT_TICKETS].forEach((r) => {
  if (!knownIds.has(r.customerId)) {
    console.warn(`[customer-360-crm] record references unknown customerId: ${r.customerId}`);
  }
});
