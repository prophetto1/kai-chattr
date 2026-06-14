import { chattrJson } from '@/lib/chattr-api'

export type JobCreateInput = {
  anchor_msg_id?: number
  assignee?: string
  body?: string
  channel?: string
  created_by?: string
  title: string
  type?: string
}

export type JobCreateResult = {
  id: number
  title: string
}

export function createJob(input: JobCreateInput) {
  return chattrJson<JobCreateResult>('/api/jobs', {
    body: JSON.stringify({
      body: input.body ?? '',
      channel: input.channel ?? 'general',
      created_by: input.created_by ?? 'user',
      title: input.title,
      type: input.type ?? 'job',
      ...(input.anchor_msg_id === undefined ? {} : { anchor_msg_id: input.anchor_msg_id }),
      ...(input.assignee === undefined ? {} : { assignee: input.assignee }),
    }),
    method: 'POST',
  })
}

export function demoteJobProposal(messageId: number | string) {
  return chattrJson(`/api/messages/${encodeURIComponent(String(messageId))}/demote`, {
    method: 'POST',
  })
}
