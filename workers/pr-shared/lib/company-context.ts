import type { Company } from "./types.js";

export interface CompanyPRContext {
  name: string;
  fullName: string;
  description: string;
  ceo: string;
  corey_role: string;
  key_products: string[];
  boilerplate: string;
  beats: string[];
  competitors: string[];
}

const COMPANY_CONTEXTS: Record<Company, CompanyPRContext> = {
  {company-1}: {
    name: "{Company-1}",
    fullName: "{Company-1} / Voyage SMS",
    description: "AI-powered SMS cart recovery and marketing platform for e-commerce brands",
    ceo: "{Your Name}",
    corey_role: "CEO & Founder",
    key_products: ["{Company-1} (SMS cart recovery)", "Voyage SMS (full-stack SMS marketing)", "{Product}.AI (unified AI platform)"],
    boilerplate: "{Company-1} is the leading SMS-powered cart recovery platform, helping over 2,000 e-commerce brands recover abandoned carts through real human conversations. Founded by {Your Name}, the company combines AI technology with human touch to deliver industry-leading recovery rates.",
    beats: ["e-commerce", "SaaS", "SMS marketing", "AI", "retail tech"],
    competitors: ["Attentive", "Postscript", "Recart", "Klaviyo SMS"],
  },
  {company-2}: {
    name: "{Company-2}",
    fullName: "{Company-2} AI",
    description: "Enterprise AI infrastructure for regulated industries",
    ceo: "N/A",
    corey_role: "Chief Design Officer",
    key_products: ["Abbi Assist", "{Company-2} OS", "{Company-2} Studio", "{Company-2} Platform"],
    boilerplate: "{Company-2} provides enterprise-grade AI infrastructure purpose-built for regulated industries including banking, insurance, and healthcare. With SOC 2 Type II and ISO 27001 compliance, {Company-2} enables financial institutions to deploy AI safely and at scale.",
    beats: ["enterprise AI", "fintech", "regtech", "banking technology", "AI safety"],
    competitors: ["Palantir", "C3.ai", "DataRobot", "Scale AI"],
  },
  {company-3}: {
    name: "{Company-3}",
    fullName: "{Company-3} AI",
    description: "Executive intelligence OS — AI-powered meeting intelligence and productivity",
    ceo: "{Your Name}",
    corey_role: "CEO",
    key_products: ["{Company-3} Desktop App", "AI Meeting Intelligence", "Research Agent"],
    boilerplate: "{Company-3} AI is the executive intelligence operating system that transforms how leaders work. With real-time meeting transcription, AI-powered decision detection, and a model-agnostic research agent, {Company-3} helps executives focus on what matters most.",
    beats: ["enterprise software", "AI assistants", "productivity", "meeting intelligence", "executive tools"],
    competitors: ["Otter.ai", "Fireflies.ai", "Read.ai", "Fathom"],
  },
  personal: {
    name: "{Your Name}",
    fullName: "{Your Name}",
    description: "Entrepreneur, designer, and AI thought leader",
    ceo: "N/A",
    corey_role: "Founder & CEO (multiple companies)",
    key_products: [],
    boilerplate: "{Your Name} is a serial entrepreneur and designer based in Boulder, CO. As CEO of {Company-1} and {Company-3} AI, and Chief Design Officer at {Company-2}, he builds at the intersection of AI, design, and business. An MBA from UCLA Anderson and former Deloitte consultant, {your-name} writes about building with AI, founder life, and finding better ways to work.",
    beats: ["AI", "entrepreneurship", "design", "startups", "founder stories"],
    competitors: [],
  },
};

export function getCompanyPRContext(company: Company): CompanyPRContext {
  return COMPANY_CONTEXTS[company];
}

export function getAllCompanyContexts(): Record<Company, CompanyPRContext> {
  return COMPANY_CONTEXTS;
}
