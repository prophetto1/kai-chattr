import { useCallback, useEffect, useRef, useState } from 'react'

import { chattrApiUrl, getSessionToken } from '@/lib/chattr-api'

export type ChattrRoomMessage = {
  id?: number | string
  uid?: string
  sender: string
  text: string
  type?: string
  timestamp?: number
  time?: string
  channel?: string
  attachments?: unknown[]
  metadata?: Record<string, unknown>
}

type ChattrConnectionState = 'closed' | 'connecting' | 'open'

type SendChattrMessageInput = {
  text: string
  attachments?: unknown[]
}

type UseChattrRoomOptions = {
  channel?: string
}

const MAX_RENDERED_MESSAGES = 500

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function messageKey(message: ChattrRoomMessage) {
  if (message.uid) {
    return `uid:${message.uid}`
  }

  if (message.id !== undefined) {
    return `id:${message.id}`
  }

  return [
    message.channel ?? 'general',
    message.sender,
    message.timestamp ?? '',
    message.text,
  ].join(':')
}

function normalizeMessage(value: unknown): ChattrRoomMessage | null {
  if (!isObject(value)) {
    return null
  }

  const rawText = value.text
  const text = typeof rawText === 'string' ? rawText : ''

  if (!text.trim()) {
    return null
  }

  const rawSender = value.sender
  const sender = typeof rawSender === 'string' && rawSender.trim() ? rawSender : 'system'
  const rawChannel = value.channel
  const channel = typeof rawChannel === 'string' && rawChannel.trim() ? rawChannel : 'general'
  const rawAttachments = value.attachments

  return {
    attachments: Array.isArray(rawAttachments) ? rawAttachments : [],
    channel,
    id: typeof value.id === 'number' || typeof value.id === 'string' ? value.id : undefined,
    metadata: isObject(value.metadata) ? value.metadata : undefined,
    sender,
    text,
    time: typeof value.time === 'string' ? value.time : undefined,
    timestamp: typeof value.timestamp === 'number' ? value.timestamp : undefined,
    type: typeof value.type === 'string' ? value.type : undefined,
    uid: typeof value.uid === 'string' ? value.uid : undefined,
  }
}

function mergeMessages(
  currentMessages: ChattrRoomMessage[],
  incomingMessages: ChattrRoomMessage[]
) {
  const byKey = new Map<string, ChattrRoomMessage>()

  for (const message of currentMessages) {
    byKey.set(messageKey(message), message)
  }

  for (const message of incomingMessages) {
    byKey.set(messageKey(message), message)
  }

  return Array.from(byKey.values())
    .sort((a, b) => {
      const aTimestamp = a.timestamp ?? 0
      const bTimestamp = b.timestamp ?? 0

      if (aTimestamp !== bTimestamp) {
        return aTimestamp - bTimestamp
      }

      return String(a.id ?? '').localeCompare(String(b.id ?? ''))
    })
    .slice(-MAX_RENDERED_MESSAGES)
}

function websocketUrl(token: string) {
  const base = typeof window === 'undefined' ? 'http://127.0.0.1:8800' : window.location.origin
  const url = new URL(chattrApiUrl(`/ws?token=${encodeURIComponent(token)}`), base)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

export function useChattrRoom({ channel = 'general' }: UseChattrRoomOptions = {}) {
  const [connectionState, setConnectionState] = useState<ChattrConnectionState>('connecting')
  const [messages, setMessages] = useState<ChattrRoomMessage[]>([])
  const pendingMessagesRef = useRef<SendChattrMessageInput[]>([])
  const socketRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const token = getSessionToken()

    if (!token || typeof window === 'undefined') {
      setConnectionState('closed')
      return
    }

    let disposed = false
    const socket = new WebSocket(websocketUrl(token))
    socketRef.current = socket
    setConnectionState('connecting')

    const flushPendingMessages = () => {
      const pending = pendingMessagesRef.current.splice(0)
      for (const message of pending) {
        socket.send(JSON.stringify({
          attachments: message.attachments ?? [],
          channel,
          sender: 'user',
          text: message.text,
          type: 'message',
        }))
      }
    }

    socket.addEventListener('open', () => {
      if (disposed) {
        return
      }

      setConnectionState('open')
      flushPendingMessages()
    })

    socket.addEventListener('message', (event) => {
      if (disposed) {
        return
      }

      let payload: unknown
      try {
        payload = JSON.parse(event.data)
      } catch {
        return
      }

      if (!isObject(payload) || typeof payload.type !== 'string') {
        return
      }

      if (payload.type === 'history_batch' && Array.isArray(payload.messages)) {
        const incoming = payload.messages
          .map(normalizeMessage)
          .filter((message): message is ChattrRoomMessage => Boolean(message))
          .filter((message) => message.channel === channel)
        setMessages((current) => mergeMessages(current, incoming))
        return
      }

      if (payload.type === 'message') {
        const message = normalizeMessage(payload.data)
        if (message?.channel === channel) {
          setMessages((current) => mergeMessages(current, [message]))
        }
        return
      }

      if (payload.type === 'clear') {
        const clearChannel = typeof payload.channel === 'string' ? payload.channel : undefined
        if (!clearChannel || clearChannel === channel) {
          setMessages([])
        }
        return
      }

      if (payload.type === 'delete' && Array.isArray(payload.ids)) {
        const deletedIds = new Set(payload.ids.map(String))
        setMessages((current) =>
          current.filter((message) =>
            message.id === undefined ? true : !deletedIds.has(String(message.id))
          )
        )
      }
    })

    socket.addEventListener('close', () => {
      if (!disposed) {
        setConnectionState('closed')
      }
      if (socketRef.current === socket) {
        socketRef.current = null
      }
    })

    socket.addEventListener('error', () => {
      if (!disposed) {
        setConnectionState('closed')
      }
    })

    return () => {
      disposed = true
      if (socketRef.current === socket) {
        socketRef.current = null
      }
      socket.close()
    }
  }, [channel])

  const sendMessage = useCallback(
    ({ text, attachments = [] }: SendChattrMessageInput) => {
      const trimmedText = text.trim()

      if (!trimmedText && attachments.length === 0) {
        return false
      }

      const socket = socketRef.current
      const payload = {
        attachments,
        text: trimmedText,
      }

      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          ...payload,
          channel,
          sender: 'user',
          type: 'message',
        }))
        return true
      }

      if (socket?.readyState === WebSocket.CONNECTING) {
        pendingMessagesRef.current.push(payload)
        return true
      }

      return false
    },
    [channel]
  )

  return {
    connectionState,
    messages,
    sendMessage,
  }
}
