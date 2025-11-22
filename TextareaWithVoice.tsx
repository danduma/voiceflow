import { useState, useRef, useCallback } from 'react'
import { useVoiceTranscription } from './useVoiceTranscription'
import type { TextareaWithVoiceProps } from './types'

export default function TextareaWithVoice({
  value,
  onChange,
  placeholder = "Describe what you want to write about...",
  rows,
  disabled = false,
  voiceLanguage,
  onVoiceLanguageChange,
  Button,
  Textarea,
  MicIcon,
  className = "",
  textareaClassName = "",
  buttonClassName = "",
  buttonPosition = 'top-right'
}: TextareaWithVoiceProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isFocused, setIsFocused] = useState(false)
  const [showVoiceControl, setShowVoiceControl] = useState(false)

  // Voice transcription hook
  const {
    isRecording: isVoiceTranscribing,
    startRecording: startVoiceRecording,
    stopRecording: stopVoiceRecording,
    voiceServiceRef
  } = useVoiceTranscription({
    language: voiceLanguage,
    onTranscriptionUpdate: (text: string, isFinal: boolean) => {
      if (isFinal && text.trim()) {
        // Append transcribed text to current value
        const newValue = value ? `${value} ${text.trim()}` : text.trim()
        onChange(newValue)
      }
    },
    onError: (error) => {
      console.error('Voice transcription error:', error)
      setShowVoiceControl(false)
    }
  })

  // Handle focus events
  const handleFocus = () => {
    setIsFocused(true)
    setShowVoiceControl(true)
  }

  const handleBlur = (e: React.FocusEvent) => {
    setIsFocused(false)
    // Don't hide voice control immediately if transcribing
    if (!isVoiceTranscribing) {
      setTimeout(() => {
        // Only hide if still not transcribing and textarea doesn't have focus
        if (!isVoiceTranscribing && document.activeElement !== textareaRef.current) {
          setShowVoiceControl(false)
        }
      }, 300) // Delay to allow for clicking voice control
    }
  }

  // Handle voice control actions
  const handleStartTranscription = useCallback(() => {
    startVoiceRecording()
  }, [startVoiceRecording])

  const handleStopTranscription = useCallback(() => {
    stopVoiceRecording()
    // Keep voice control visible after stopping transcription
    // It will be hidden when textarea loses focus
  }, [stopVoiceRecording])

  const handleVoiceLanguageChange = useCallback((language: string) => {
    onVoiceLanguageChange(language)
  }, [onVoiceLanguageChange])

  // Calculate positioning classes based on buttonPosition
  const getPositionClasses = () => {
    switch (buttonPosition) {
      case 'bottom-right':
        return 'bottom-2 right-2'
      case 'top-right':
      default:
        return 'top-3 right-3'
    }
  }

  return (
    <div className={`relative w-full ${className}`}>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`${placeholder}${isFocused || showVoiceControl ? ' (Voice input available when focused)' : ''}`}
        {...(rows && { rows })}
        disabled={disabled}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={`resize pr-16 h-[300px] w-full min-w-0 md:min-w-[400px] ${textareaClassName}`}
      />

      {/* Voice Input Indicator - show when not focused */}
      {!showVoiceControl && (
        <div className={`absolute ${getPositionClasses()} text-muted-foreground pointer-events-none`}>
          <MicIcon className="h-4 w-4 opacity-40" />
        </div>
      )}

      {/* Inline Voice Control */}
      {showVoiceControl && (
        <div className={`absolute ${getPositionClasses()} z-10`}>
          <Button
            type="button"
            variant={isVoiceTranscribing ? "default" : "ghost"}
            size="sm"
            onClick={isVoiceTranscribing ? handleStopTranscription : handleStartTranscription}
            className={`h-8 w-8 rounded-full p-0 hover:bg-blue-50 hover:text-blue-600 transition-colors ${buttonClassName}`}
            title={isVoiceTranscribing ? "Stop voice input" : "Start voice input"}
          >
            <MicIcon className={`h-4 w-4 ${isVoiceTranscribing ? 'text-red-500' : ''}`} />
          </Button>
        </div>
      )}
    </div>
  )
}

