const GEMINI_MODELS = (process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || 'gemini-flash-latest,gemini-2.5-flash-lite,gemini-2.5-flash')
  .split(',')
  .map((model) => model.trim())
  .filter(Boolean);

async function generateGeminiText(systemPrompt, userPrompt, maxOutputTokens = 180) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  let lastError;
  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens },
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (response.ok) {
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim() || null;
      }
      lastError = new Error(`Gemini request failed with status ${response.status}`);
      if (![429, 500, 502, 503, 504].includes(response.status)) break;
    }
  }
  throw lastError || new Error('Gemini request failed');
}

export async function generateCustomerChatReply(message, context = {}) {
  const language = /\b(naomba|tafadhali|wapi|saa|chakula|bei|oda|imefunguliwa|delivery|asante|habari|mna|mnayo)\b/i.test(message) ? 'Swahili' : 'English';
  return generateGeminiText(
    `You are the concise, friendly customer support assistant for Wrap & Roll restaurant in Dar es Salaam. Answer in ${language}. Answer only about the restaurant, menu, orders, delivery, opening hours, and location. Use the supplied restaurant context as the source of truth. Never invent menu items, prices, availability, delivery promises, or order status. If the context does not answer the question, say a staff member will help shortly. Keep replies under 80 words.`,
    `Customer question: ${message}\n\nDetected language: ${language}\n\nRestaurant context:\n${JSON.stringify(context)}`,
    180,
  );
}

const builtInKnowledge = {
  restaurant: {
    name: 'Wrap & Roll',
    location: 'Wikicha Tower, Mwai Kibaki Road, Dar es Salaam',
    hours: 'Daily from 7:00 AM to 11:00 PM',
    delivery: 'Delivery is available in supported zones and can be confirmed by staff.',
    paymentMethods: ['cash', 'card', 'mobile money'],
    purpose: 'Fast casual restaurant, wraps, rolls, burgers, salads, drinks, and combos.',
  },
  skills: [
    'Operational triage',
    'Customer retention',
    'Low-stock alerting',
    'Payment follow-up',
    'Kitchen queue review',
    'Staff task prioritization',
  ],
};

function formatMoney(value) {
  return `TZS ${Number(value || 0).toLocaleString()}`;
}

function builtInOperationsReport(snapshot) {
  const customerSummary = snapshot?.customerSummary || {};
  const risks = snapshot?.risks || {};
  const recentOrders = snapshot?.recentOrders || {};
  const lowStock = Array.isArray(risks.lowStock) ? risks.lowStock : [];
  const unpaid = risks.unpaidOrders || { count: 0, amount: 0 };
  const vip = Number(customerSummary.vip || 0);
  const inactive = Number(customerSummary.inactive || 0);
  const atRisk = Number(customerSummary.atRisk || 0);
  const unresolved = Number(risks.unresolvedComplaints || 0);
  const delayed = Number(risks.delayedOrders || 0);

  const priorityIssues = [
    `VIP and at-risk customer review: ${vip} VIP and ${atRisk} at-risk customers should be contacted first.`,
    `Inactive customer recovery: ${inactive} customers have not ordered recently and may need a reactivation push.`,
    `Operational risk: ${unresolved} unresolved conversations and ${delayed} delayed orders require immediate attention.`,
    `Cash risk: ${Number(unpaid.count || 0)} unpaid orders remain worth ${formatMoney(unpaid.amount || 0)}.`,
  ];

  const actionItems = [
    'Prioritize a VIP retention campaign and a short recovery message for inactive members.',
    'Review the kitchen backlog and confirm which orders are still pending or delayed.',
    lowStock.length ? `Replenish stock for ${lowStock.slice(0, 3).map((item) => item.name).join(', ')} before the next service window.` : 'Monitor inventory replenishment based on the next shift forecast.',
  ];

  return [
    'Built-in operations report',
    `This offline assistant is using the current restaurant data and built-in operational skill set. Wrap & Roll currently has ${customerSummary.total || 0} tracked customers and ${recentOrders.last30Days || 0} orders in the last 30 days.`,
    'Priority issues',
    priorityIssues.map((item) => `- ${item}`).join('\n'),
    'Recommended actions',
    actionItems.map((item) => `- ${item}`).join('\n'),
    'Operational skills in use',
    builtInKnowledge.skills.map((skill) => `- ${skill}`).join('\n'),
  ].join('\n\n');
}

function builtInStaffAssistantReply(snapshot, question) {
  const normalized = String(question || '').toLowerCase();
  const customerSummary = snapshot?.customerSummary || {};
  const risks = snapshot?.risks || {};
  const unpaid = risks.unpaidOrders || { count: 0, amount: 0 };
  const lowStock = Array.isArray(risks.lowStock) ? risks.lowStock : [];
  const vip = Number(customerSummary.vip || 0);
  const inactive = Number(customerSummary.inactive || 0);
  const atRisk = Number(customerSummary.atRisk || 0);
  const unresolved = Number(risks.unresolvedComplaints || 0);
  const delayed = Number(risks.delayedOrders || 0);

  if (normalized.includes('vip') || normalized.includes('loyalty') || normalized.includes('offer')) {
    return `Built-in recommendation: start with ${vip} VIP customers and ${atRisk} at-risk customers. Prioritize spend-heavy members and recent repeat guests before sending a loyalty offer.`;
  }
  if (normalized.includes('inventory') || normalized.includes('stock')) {
    const stockNames = lowStock.slice(0, 3).map((item) => item.name).join(', ') || 'the current inventory list';
    return `Built-in recommendation: review ${stockNames}. Low stock and expiry warnings should be checked before the next service peak.`;
  }
  if (normalized.includes('payment') || normalized.includes('unpaid')) {
    return `Built-in recommendation: ${Number(unpaid.count || 0)} unpaid orders remain worth ${formatMoney(unpaid.amount || 0)}. Follow up on those payment references before closing the day.`;
  }
  if (normalized.includes('customer') || normalized.includes('inactive') || normalized.includes('retention')) {
    return `Built-in recommendation: handle ${inactive} inactive customers and ${atRisk} at-risk customers first. Use a reactivation message and loyalty follow-up before a broader campaign.`;
  }

  return `Built-in answer: ${customerSummary.total || 0} customers are tracked, with ${vip} VIP, ${inactive} inactive, ${atRisk} at-risk, ${unresolved} unresolved conversations, and ${delayed} delayed orders. Start with VIP retention, payment follow-up, and low-stock checks using the current live POS data.`;
}

export function generateOfflineAgentReply(snapshot, question) {
  return builtInStaffAssistantReply(snapshot, question);
}

export async function generateOperationsReport(snapshot) {
  const offlineReport = builtInOperationsReport(snapshot);
  try {
    const report = await generateGeminiText(
      'You are a practical restaurant operations analyst for Wrap & Roll. Review the supplied live POS snapshot and produce a concise management report. Identify the most important real issues first, cite the relevant numbers, explain business impact, and give specific next actions. Separate urgent issues from watch items. Do not invent facts, blame staff, or claim certainty where the data is incomplete. Mention when data is insufficient. Use plain text headings: Executive summary, Priority issues, Recommended actions, Data gaps.',
      `Analyze this JSON snapshot from the Wrap & Roll POS system:\n${JSON.stringify(snapshot)}`,
      900,
    );
    if (report) return report;
  } catch (_error) {
    // Use the built-in offline restaurant agent when Gemini is unavailable.
  }

  return offlineReport;
}

export async function generateStaffAssistantReply(snapshot, question) {
  const offlineReply = builtInStaffAssistantReply(snapshot, question);
  try {
    const answer = await generateGeminiText(
      'You are the live operations assistant for Wrap & Roll restaurant. Help authenticated staff with practical questions about customers, orders, kitchen flow, inventory, staffing, payments, and daily operations. Use only the supplied POS snapshot. Give concise, specific steps and cite numbers when available. Do not invent facts or expose private customer details. If the data is insufficient, say what staff should check next.',
      `Staff question: ${question}\n\nCurrent POS snapshot:\n${JSON.stringify(snapshot)}`,
      700,
    );
    if (answer) return answer;
  } catch (_error) {
    // Use the built-in offline restaurant agent when Gemini is unavailable.
  }

  return offlineReply;
}