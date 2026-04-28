export interface User {
  uid: string;
  name: string;
  email: string;
  photoURL?: string;
  createdAt: Date;
}

export interface AdAccount {
  id: string;
  name: string;
  accountId: string;
  accessToken: string;
  status: "active" | "inactive";
  createdAt: Date;
}

export interface WhatsAppNumber {
  id: string;
  phoneNumber: string;
  displayName: string;
  wabaId: string;
  accessToken: string;
  status: "active" | "inactive";
  createdAt: Date;
}

export interface Contact {
  id: string;
  userId: string;
  name: string;
  phone: string;
  email?: string;
  tags: string[];
  addedAt: Date;
}

export interface Campaign {
  id: string;
  userId: string;
  type: "ads" | "whatsapp";
  name: string;
  status: "draft" | "queued" | "running" | "completed" | "failed";
  createdAt: Date;
  scheduledAt?: Date;
  completedAt?: Date;
  stats?: CampaignStats;
}

export interface CampaignStats {
  total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

export interface MessageLog {
  id: string;
  campaignId: string;
  contactPhone: string;
  contactName?: string;
  status: "queued" | "sent" | "delivered" | "read" | "failed";
  error?: string;
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
}
