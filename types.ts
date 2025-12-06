import * as React from 'react'

// Re-export the VoiceInputService interface from the service
export interface VoiceInputService {
  startRecording(onTranscription: (text: string, isFinal: boolean) => void): Promise<void>
  stopRecording(cancelled?: boolean): Promise<string>
  isRecording(): boolean
  setLanguage(language: string | 'auto'): void
  getLanguage(): string | 'auto'
  reset?(): void
}

export interface AudioVisualizationData {
  volume: number
  frequencies: number[]
}

// Component props interfaces
export interface TextareaWithVoiceProps {
  // Core textarea props
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  disabled?: boolean

  // Voice functionality props
  voiceLanguage: string
  onVoiceLanguageChange: (language: string) => void

  // UI component props (injected for flexibility)
  Button: React.ComponentType<any>
  Textarea: React.ComponentType<any>
  MicIcon: React.ComponentType<any>

  // Styling props
  className?: string
  textareaClassName?: string
  buttonClassName?: string

  // Voice button positioning
  buttonPosition?: 'top-right' | 'bottom-right'

  // How transcriptions are applied to the value
  transcriptionMode?: 'replace' | 'append'
}

// Hook interfaces
export interface UseVoiceTranscriptionOptions {
  language?: string
  onTranscriptionUpdate?: (text: string, isFinal: boolean) => void
  onError?: (error: string) => void
  onVisualizationUpdate?: (levels: number[]) => void
  emitMode?: 'full' | 'delta'
  getBaselineText?: () => string
}

export interface UseVoiceTranscriptionReturn {
  isRecording: boolean
  transcription: string
  interimTranscription: string
  error: string | null
  permissionDenied: boolean
  startRecording: () => Promise<void>
  stopRecording: (cancelled?: boolean) => Promise<void>
  setLanguage: (language: string) => void
  getLanguage: () => string
  voiceServiceRef: React.RefObject<VoiceInputService | null>
}

// Voice language types
export interface VoiceLanguage {
  code: string
  name: string
  flag: string
}

