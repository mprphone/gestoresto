import { apiGet, apiPost } from './apiClient';

export interface EmailMessage {
  id: string;
  recipient: string;
  subject: string;
  status: 'PENDENTE' | 'ENVIADO' | 'FALHOU' | 'SIMULADO';
  related_entity_table?: string;
  related_entity_id?: string;
  provider_message_id?: string;
  error_message?: string;
  sent_at?: string;
  created_at: string;
}

export async function listEmailMessages(): Promise<EmailMessage[]> {
  const result = await apiGet<{ data: EmailMessage[] }>('/api/emails');
  return result.data;
}

export async function sendEmail(input: {
  recipient: string;
  subject: string;
  body: string;
  relatedEntityTable?: string;
  relatedEntityId?: string;
}): Promise<EmailMessage> {
  return apiPost<EmailMessage>('/api/emails/send', input);
}
