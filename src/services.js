// ==============================================================
// AI ASSISTANT (rule-based safety guide)
// ==============================================================
//
// This is a free, offline, keyword-matching assistant — NOT a
// real generative AI model. It answers common disaster-safety
// questions instantly with no API key, no cost, and no backend.
//
// If you later want a true conversational AI (can answer
// anything, not just these topics), swap `getAssistantReply()`
// for a call to the Anthropic or OpenAI Messages API. That
// needs an API key kept on a small backend (never in the
// frontend bundle) since it costs money per message.
// ==============================================================

const TOPICS = [
  {
    keywords: ["flood", "flooding", "waterlog", "rain water"],
    reply:
      "🌊 During a flood: move to higher ground immediately, avoid walking or driving through moving water (even 15cm can knock you over), stay off bridges over fast-moving water, and turn off electricity at the main switch if water is entering your home. Check the Weather tab for live rainfall alerts for your area.",
  },
  {
    keywords: ["earthquake", "quake", "tremor"],
    reply:
      "🏚️ During an earthquake: Drop, Cover, and Hold On — get under a sturdy table, protect your head/neck, and stay away from windows and heavy furniture. If outdoors, move to an open area away from buildings and power lines. After shaking stops, check for injuries and be ready for aftershocks.",
  },
  {
    keywords: ["fire", "burning", "smoke"],
    reply:
      "🔥 During a fire: get low and go (smoke rises, cleaner air is near the floor), never use elevators, check doors for heat before opening them, and call 101 (Fire) or 112 immediately. Have a planned exit route from your home.",
  },
  {
    keywords: ["cyclone", "storm", "hurricane", "wind"],
    reply:
      "🌀 During a cyclone/storm: stay indoors away from windows, keep emergency supplies (water, food, torch, power bank) ready, and follow evacuation orders from local authorities immediately if issued. Check the Weather tab for live alerts.",
  },
  {
    keywords: ["hospital", "doctor", "medical", "injured", "injury"],
    reply:
      "🏥 Go to Emergency → Find Hospitals to see real nearby hospitals and clinics sorted by distance, with a Call and Directions button on each. For life-threatening emergencies, call 108 (Ambulance) or 112 immediately.",
  },
  {
    keywords: ["shelter", "evacuat", "safe place", "safe building"],
    reply:
      "🏫 Go to Emergency → Find Shelters (or the Safe Map) to see real nearby schools, community centres and marked emergency shelters with directions.",
  },
  {
    keywords: ["sos", "emergency contact", "call for help"],
    reply:
      "📞 Set up your SOS contacts from the Citizen Portal → SOS Contacts. Once saved, use the big SOS button in the Emergency section to alert them instantly.",
  },
  {
    keywords: ["report", "missing person", "lost house", "incident"],
    reply:
      "📋 Go to Citizen Portal → Incident Reporting to report a missing person, a damaged/lost property, or describe an incident. Your report is saved and visible to the Admin Portal immediately.",
  },
  {
    keywords: ["number", "helpline", "police", "ambulance number"],
    reply:
      "☎️ Key India helpline numbers: 112 (Unified Emergency), 100 (Police), 101 (Fire), 102/108 (Ambulance), 1091 (Women in Distress). Full list is on the SOS Contacts screen.",
  },
  {
    keywords: ["hi", "hello", "hey"],
    reply:
      "👋 Hi, I'm your SafeHelp safety assistant. Ask me about floods, earthquakes, fires, cyclones, finding hospitals/shelters, or how to use SOS — I'll walk you through it.",
  },
  {
    keywords: ["thank", "thanks"],
    reply: "You're welcome — stay safe! 🙏",
  },
];

const FALLBACK_REPLY =
  "I can help with flood, earthquake, fire and cyclone safety, finding hospitals/shelters, SOS contacts, and incident reporting. Try asking something like \"what do I do in a flood?\" or \"find nearby hospitals\".";

export function getAssistantReply(userMessage) {
  const message = userMessage.toLowerCase();

  const matched = TOPICS.find((topic) =>
    topic.keywords.some((keyword) => message.includes(keyword))
  );

  return matched ? matched.reply : FALLBACK_REPLY;
}

export const ASSISTANT_SUGGESTIONS = [
  "What do I do in a flood?",
  "Find nearby hospitals",
  "How does SOS work?",
  "Earthquake safety tips",
];
