export type SiteSection = "about" | "contact" | "services" | "blog" | "general";

const sections: Record<SiteSection, string> = {
  about: "About page. Company, mission, how AI/chatbots help.",
  contact: "Contact page. Form, email, support, hours, reply time, quote.",
  services: "Services page. Chatbot dev, AI integration, website integration, pricing, start project.",
  blog: "Blog page. AI/chatbot articles, summaries, explanations.",
  general: "Business site. About, Contact, Services, Blog. Answer like site assistant."
};

export function getSectionContext(section?: SiteSection | string): string {
    if (!section) return sections.general;
    const key = section.toLowerCase() as SiteSection;
    return sections[key] ?? sections.general;
}

export const NON_AI_FALLBACK_MESSAGE =
    "Thanks for your message. I couldn't find an exact automated answer for that yet, but our team can help. You can also try asking a more specific question.";

export const AI_ERROR_FALLBACK_MESSAGE = "I apologize, but I'm having trouble processing your request right now. Please try again or contact our support team.";

/** Shown after a visitor uploads a file (no message text) while AI is enabled — no LLM reply. */
export const VISITOR_FILE_UPLOAD_ACK_MESSAGE =
    "Thanks for sharing the file. Our agent will review it shortly and get back to you.";
