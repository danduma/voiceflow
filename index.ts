// Main component
export { default as TextareaWithVoice } from './TextareaWithVoice'

// Hook
export { useVoiceTranscription } from './useVoiceTranscription'

// Voice services
export {
  createVoiceInputService,
  type VoiceInputService,
  type AudioVisualizationData
} from './voiceInput'

// Language constants and utilities
export {
  VOICE_LANGUAGES,
  getLanguageDisplay,
  getLanguageFlag
} from './voiceLanguages'

// Types
export type {
  TextareaWithVoiceProps,
  UseVoiceTranscriptionOptions,
  UseVoiceTranscriptionReturn,
  VoiceLanguage
} from './types'
