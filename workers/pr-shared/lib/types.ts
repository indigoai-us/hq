// PR Domain Types

export interface Journalist {
  name: string;
  outlet: string;
  beat: string;
  email: string;
  x_handle: string;
  linkedin: string;
  tier: 1 | 2 | 3;
  last_contact: string | null;
  notes: string;
  segments: string[];
  status: "active" | "moved" | "inactive";
  company_tags: string[];
}

export interface Outlet {
  name: string;
  type: "publication" | "blog" | "podcast" | "newsletter";
  url: string;
  tier: 1 | 2 | 3;
  beats: string[];
  audience: string;
  pitch_guidelines: string;
  contacts: string[];
}

export interface Pitch {
  id: string;
  company: Company;
  type: PitchType;
  subject: string;
  journalist: string;
  outlet: string;
  status: PitchStatus;
  sent_date: string | null;
  follow_up_dates: string[];
  response: string | null;
  placement_url: string | null;
  notes: string;
}

export interface CoverageEntry {
  id: string;
  company: Company;
  outlet: string;
  outlet_tier: 1 | 2 | 3;
  title: string;
  url: string;
  date: string;
  type: CoverageType;
  sentiment: Sentiment;
  reach_estimate: number;
  pitch_id: string | null;
  notes: string;
}

export interface PRCampaign {
  name: string;
  company: Company;
  status: "planning" | "active" | "completed";
  launch_date: string;
  press_release_path: string | null;
  media_list_count: number;
  pitches_sent: number;
  placements: number;
  created_at: string;
}

export interface PRMetrics {
  period: string;
  placements_total: number;
  placements_by_tier: Record<number, number>;
  pitches_sent: number;
  response_rate: number;
  placement_rate: number;
  sentiment: Record<Sentiment, number>;
  companies_active: number;
  media_contacts: number;
}

export type Company = "{company-1}" | "{company-2}" | "{company-3}" | "personal";
export type PitchType = "launch" | "funding" | "thought-leadership" | "trend" | "event";
export type PitchStatus = "draft" | "sent" | "followed_up" | "responded" | "placed" | "declined" | "no_response";
export type CoverageType = "article" | "mention" | "interview" | "podcast" | "op-ed" | "social";
export type Sentiment = "positive" | "neutral" | "negative";
