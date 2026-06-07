type WebSocketMessage = Record<string, unknown>
type WebSocketMessageHandler = (data: WebSocketMessage) => void
type QueuedWebSocketMessage = {
  type: string
  data: Record<string, unknown>
}

export class WebSocketClient {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private reconnectDelay = 750
  private maxReconnectDelay = 8000
  private shouldReconnect = true
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private meetingId: string
  private userId: string
  private messageHandlers: Map<string, WebSocketMessageHandler> = new Map()
  private connectionStateHandler: ((connected: boolean) => void) | null = null
  private pendingMessages: QueuedWebSocketMessage[] = []
  private maxPendingMessages = 40
  private coalescedMessageTypes = new Set(['canvas_sync', 'meeting_goal_sync', 'meeting_timer_sync', 'mic_calibration'])
  private volatileMessageTypes = new Set(['canvas_node_preview', 'canvas_edit_presence'])

  constructor(meetingId: string, userId: string) {
    this.meetingId = meetingId
    this.userId = userId
  }

  private emitConnectionState(connected: boolean) {
    this.connectionStateHandler?.(connected)
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    const wsUrl = process.env.NEXT_PUBLIC_GATEWAY_WS_URL || 'ws://localhost:8001/gateway/ws'
    const url = `${wsUrl}/${this.meetingId}?user_id=${this.userId}`

    console.log('🔌 Connecting to WebSocket:', url)
    this.shouldReconnect = true

    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      console.log('✅ WebSocket connected')
      this.reconnectAttempts = 0
      this.emitConnectionState(true)
      this.flushPendingMessages()
    }

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WebSocketMessage
        const messageType = typeof message.type === 'string' ? message.type : ''
        if (
          messageType !== 'stt_debug' &&
          messageType !== 'audio_selection' &&
          messageType !== 'transcript' &&
          messageType !== 'transcript_created' &&
          messageType !== 'transcript_refined' &&
          messageType !== 'transcript_persistence_updated' &&
          messageType !== 'stt_summary_updated' &&
          messageType !== 'canvas_node_preview'
        ) {
          console.log('📨 WebSocket message:', message)
        }
        if (messageType && this.messageHandlers.has(messageType)) {
          const handler = this.messageHandlers.get(messageType)
          if (handler) handler(message)
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error)
      }
    }

    this.ws.onerror = (error) => {
      if (!this.shouldReconnect) {
        return
      }
      console.error('❌ WebSocket error:', error)
    }

    this.ws.onclose = (event) => {
      console.log('🔌 WebSocket disconnected', {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      })
      this.ws = null
      this.emitConnectionState(false)
      if (this.shouldReconnect) {
        this.attemptReconnect()
      }
    }
  }

  private attemptReconnect() {
    if (!this.shouldReconnect) {
      return
    }

    if (this.reconnectTimer) {
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(this.reconnectDelay * 2 ** (this.reconnectAttempts - 1), this.maxReconnectDelay)
    console.log(`🔄 Reconnecting in ${Math.round(delay / 1000)}s... (attempt ${this.reconnectAttempts})`)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.shouldReconnect) {
        this.connect()
      }
    }, delay)
  }

  on(eventType: string, handler: WebSocketMessageHandler) {
    this.messageHandlers.set(eventType, handler)
  }

  onConnectionStateChange(handler: (connected: boolean) => void) {
    this.connectionStateHandler = handler
  }

  private buildMessage(type: string, data: Record<string, unknown>) {
    return {
      type,
      meeting_id: this.meetingId,
      user_id: this.userId,
      ...data
    }
  }

  private isVolatileMessage(type: string, data: Record<string, unknown>) {
    if (this.volatileMessageTypes.has(type)) {
      return true
    }

    const workspace = data.workspace
    return (
      type === 'canvas_sync' &&
      typeof workspace === 'object' &&
      workspace !== null &&
      'sync_scope' in workspace &&
      (workspace as { sync_scope?: unknown }).sync_scope === 'node_positions'
    )
  }

  private queueMessage(type: string, data: Record<string, unknown>) {
    if (!this.shouldReconnect) {
      return
    }

    if (this.isVolatileMessage(type, data)) {
      return
    }

    if (this.coalescedMessageTypes.has(type)) {
      this.pendingMessages = this.pendingMessages.filter((message) => message.type !== type)
    }

    this.pendingMessages.push({ type, data })
    if (this.pendingMessages.length > this.maxPendingMessages) {
      this.pendingMessages = this.pendingMessages.slice(-this.maxPendingMessages)
    }
  }

  private flushPendingMessages() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.pendingMessages.length === 0) {
      return
    }

    const messages = this.pendingMessages
    this.pendingMessages = []
    messages.forEach(({ type, data }) => {
      this.ws?.send(JSON.stringify(this.buildMessage(type, data)))
    })
  }

  sendAudioChunk(
    audioBlob: Blob,
    speaker: string,
    audioMeta?: {
      startedAt: string
      endedAt: string
      durationMs: number
      rms: number
      peak: number
      speechRatio: number
      zeroCrossingRate: number
      noiseFloor: number
      sourceSampleRate?: number
      sampleRate?: number
      chunkIndex?: number
      mimeType?: string
      originalStartedAt?: string
      originalEndedAt?: string
      originalDurationMs?: number
      removedSilenceMs?: number
      combinedChunkCount?: number
      trimmedFromSilence?: boolean
    },
    meetingContext?: {
      meetingGoal?: string
      meetingGoalContext?: string
    },
    canvasContext?: {
      stage?: string
      targetId?: string
      selectedNodeId?: string
    },
  ) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('⚠️ WebSocket not connected, cannot send audio')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const base64Audio = (reader.result as string).split(',')[1]
      const cleanMeetingGoal = meetingContext?.meetingGoal?.trim() || ''
      const cleanMeetingGoalContext = meetingContext?.meetingGoalContext?.trim() || ''
      
      const message: Record<string, unknown> = {
        type: 'audio_chunk',
        meeting_id: this.meetingId,
        user_id: this.userId,
        speaker,
        audio_data: base64Audio,
        audio_mime: audioBlob.type || audioMeta?.mimeType || 'audio/wav',
        audio_filename: audioBlob.type === 'audio/wav' || audioMeta?.mimeType === 'audio/wav' ? 'chunk.wav' : 'chunk.webm',
        canvas_stage: canvasContext?.stage || 'ideation',
        canvas_target_id: canvasContext?.targetId || '',
        canvas_selected_node_id: canvasContext?.selectedNodeId || '',
        timestamp: new Date().toISOString(),
        audio_meta: audioMeta
          ? {
              ...audioMeta,
              started_at: audioMeta.startedAt,
              ended_at: audioMeta.endedAt,
              duration_ms: audioMeta.durationMs,
              speech_ratio: audioMeta.speechRatio,
              zero_crossing_rate: audioMeta.zeroCrossingRate,
              noise_floor: audioMeta.noiseFloor,
              source_sample_rate: audioMeta.sourceSampleRate,
              sample_rate: audioMeta.sampleRate,
              chunk_index: audioMeta.chunkIndex,
              mime_type: audioMeta.mimeType,
              original_started_at: audioMeta.originalStartedAt,
              original_ended_at: audioMeta.originalEndedAt,
              original_duration_ms: audioMeta.originalDurationMs,
              removed_silence_ms: audioMeta.removedSilenceMs,
              combined_chunk_count: audioMeta.combinedChunkCount,
              trimmed_from_silence: audioMeta.trimmedFromSilence,
            }
          : undefined
      }
      if (cleanMeetingGoal) {
        message.meeting_goal = cleanMeetingGoal
      }
      if (cleanMeetingGoalContext) {
        message.meeting_goal_context = cleanMeetingGoalContext
      }

      this.ws?.send(JSON.stringify(message))
    }
    reader.onerror = () => {
      console.error('❌ Failed to read audio chunk for WebSocket send', reader.error)
    }
    reader.readAsDataURL(audioBlob)
  }

  sendMessage(type: string, data: Record<string, unknown>) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (!this.isVolatileMessage(type, data)) {
        console.warn('⚠️ WebSocket not connected, cannot send message')
      }
      this.queueMessage(type, data)
      return
    }

    this.ws.send(JSON.stringify(this.buildMessage(type, data)))
  }

  disconnect() {
    this.shouldReconnect = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.pendingMessages = []
    this.emitConnectionState(false)
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }
}
