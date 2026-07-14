// ForgePipeline AI - GoHighLevel (GHL) Integration
// Syncs leads, contacts, opportunities, and pipelines with GHL

import axios from 'axios';

const GHL_BASE_URL = 'https://services.leadconnectorhq.com';

export class GHLClient {
  private accessToken: string;
  private locationId: string;

  constructor(accessToken: string, locationId: string) {
    this.accessToken = accessToken;
    this.locationId = locationId;
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
      Version: '2021-07-28',
    };
  }

  // ─────────────────────────────────────────────
  // CONTACTS
  // ─────────────────────────────────────────────

  async createContact(data: {
    firstName?: string;
    lastName?: string;
    phone: string;
    email?: string;
    address1?: string;
    city?: string;
    state?: string;
    tags?: string[];
    customFields?: Array<{ id: string; value: string }>;
    source?: string;
  }) {
    const res = await axios.post(
      `${GHL_BASE_URL}/contacts/`,
      {
        ...data,
        locationId: this.locationId,
      },
      { headers: this.headers }
    );
    return res.data.contact;
  }

  async getContactByPhone(phone: string) {
    const res = await axios.get(
      `${GHL_BASE_URL}/contacts/search`,
      {
        params: { locationId: this.locationId, query: phone },
        headers: this.headers,
      }
    );
    return res.data.contacts?.[0] || null;
  }

  async updateContact(contactId: string, data: Partial<{
    firstName: string;
    lastName: string;
    email: string;
    tags: string[];
    customFields: Array<{ id: string; value: string }>;
  }>) {
    const res = await axios.put(
      `${GHL_BASE_URL}/contacts/${contactId}`,
      data,
      { headers: this.headers }
    );
    return res.data.contact;
  }

  async addTagToContact(contactId: string, tags: string[]) {
    await axios.post(
      `${GHL_BASE_URL}/contacts/${contactId}/tags`,
      { tags },
      { headers: this.headers }
    );
  }

  // ─────────────────────────────────────────────
  // OPPORTUNITIES (Pipeline deals)
  // ─────────────────────────────────────────────

  async createOpportunity(data: {
    name: string;
    contactId: string;
    pipelineId: string;
    stageId: string;
    monetaryValue?: number;
    assignedTo?: string;
    status?: 'open' | 'won' | 'lost' | 'abandoned';
  }) {
    const res = await axios.post(
      `${GHL_BASE_URL}/opportunities/`,
      {
        ...data,
        locationId: this.locationId,
      },
      { headers: this.headers }
    );
    return res.data.opportunity;
  }

  async updateOpportunityStage(opportunityId: string, stageId: string, status?: string) {
    await axios.put(
      `${GHL_BASE_URL}/opportunities/${opportunityId}`,
      { stageId, status },
      { headers: this.headers }
    );
  }

  // ─────────────────────────────────────────────
  // CONVERSATIONS / MESSAGES
  // ─────────────────────────────────────────────

  async sendSMS(contactId: string, message: string) {
    const res = await axios.post(
      `${GHL_BASE_URL}/conversations/messages`,
      {
        type: 'SMS',
        contactId,
        message,
        locationId: this.locationId,
      },
      { headers: this.headers }
    );
    return res.data;
  }

  async addNote(contactId: string, body: string) {
    const res = await axios.post(
      `${GHL_BASE_URL}/contacts/${contactId}/notes`,
      { body, userId: 'system' },
      { headers: this.headers }
    );
    return res.data;
  }

  // ─────────────────────────────────────────────
  // PIPELINES
  // ─────────────────────────────────────────────

  async getPipelines() {
    const res = await axios.get(
      `${GHL_BASE_URL}/opportunities/pipelines`,
      {
        params: { locationId: this.locationId },
        headers: this.headers,
      }
    );
    return res.data.pipelines || [];
  }

  // ─────────────────────────────────────────────
  // CALENDARS / BOOKINGS
  // ─────────────────────────────────────────────

  async getCalendars() {
    const res = await axios.get(
      `${GHL_BASE_URL}/calendars/`,
      {
        params: { locationId: this.locationId },
        headers: this.headers,
      }
    );
    return res.data.calendars || [];
  }
}

// Factory: get GHL client for an organization
export function getGHLClient(accessToken: string, locationId: string) {
  return new GHLClient(accessToken, locationId);
}
