import { useState, useRef, useCallback, useEffect } from 'react'
import { createVoiceInputService, type VoiceInputService } from './voiceInput'
import type { UseVoiceTranscriptionOptions, UseVoiceTranscriptionReturn } from './types'

export function useVoiceTranscription(options: UseVoiceTranscriptionOptions = {}): UseVoiceTranscriptionReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [transcription, setTranscription] = useState('')
  const [interimTranscription, setInterimTranscription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [language, setLanguageState] = useState<string>(options.language || 'auto')
  
  const voiceServiceRef = useRef<VoiceInputService | null>(null)
  const animationFrameRef = useRef<number | undefined>(undefined)
  const isCancelledRef = useRef(false);
  const processedRef = useRef<string>('') // last text we already emitted to consumers (for delta mode)
  
  // NEW: Track full transcription history to reconstruct full text from segments
  const transcriptionHistoryRef = useRef<string>('')

  const startRecording = useCallback(async () => {
    try {
      setError(null)
      setPermissionDenied(false)
      setTranscription('')
      setInterimTranscription('')
      transcriptionHistoryRef.current = ''
      isCancelledRef.current = false;
      // Initialize baseline for delta mode from consumer if provided
      if (options.emitMode === 'delta' && options.getBaselineText) {
        const baseline = options.getBaselineText()?.trim()
        if (baseline) {
          processedRef.current = baseline
        }
      }

      // Clean up existing voice service if any
      if (voiceServiceRef.current) {
        try {
          await voiceServiceRef.current.stopRecording(true)
        } catch {
          // Ignore cleanup errors
        }
      }
      
      // Always create a fresh voice service to avoid text accumulation
      voiceServiceRef.current = createVoiceInputService(language)
      console.log('useVoiceTranscription: Created fresh voice service', voiceServiceRef.current.constructor.name, 'with language:', language, 'options.language:', options.language)

      await voiceServiceRef.current.startRecording((text: string, isFinal: boolean) => {
        if (isCancelledRef.current) return;
        
        // 'text' is now a SEGMENT (interim or final) from voiceInput
        
        // Reconstruct full text for backward compatibility and 'full' mode
        let currentFullText = transcriptionHistoryRef.current
        const separator = currentFullText.length > 0 && !currentFullText.endsWith(' ') && !text.startsWith(' ') ? ' ' : ''
        
        // The effective full text if we append the current segment
        const effectiveFullText = currentFullText + separator + text
        
        console.log('Transcription callback:', { segment: text, full: effectiveFullText, isFinal })

        const emitMode = options.emitMode ?? 'full'
        let textToEmit = effectiveFullText
        
        if (emitMode === 'segment') {
            textToEmit = separator + text // Pass the segment directly, prepending separator if needed for continuity
        }

        // Logic for delta mode (legacy support, but might be flaky with segments)
        // If emitMode is delta, we compare textToEmit (which is FULL TEXT) with processedRef (PREV FULL TEXT)
        const prev = processedRef.current
        const delta = emitMode === 'delta'
          ? (textToEmit.startsWith(prev) ? textToEmit.slice(prev.length) : textToEmit)
          : textToEmit
        
        if (isFinal) {
          console.log('Final transcription segment:', text)
          
          // Update history
          transcriptionHistoryRef.current += separator + text
          
          setTranscription(transcriptionHistoryRef.current)
          setInterimTranscription('')
          
          if (emitMode === 'segment') {
             options.onTranscriptionUpdate?.(textToEmit, true)
          } else if (delta) {
             options.onTranscriptionUpdate?.(delta, true)
          }
          
          // Update processedRef
          if (emitMode === 'delta') {
             processedRef.current = textToEmit
          } else if (emitMode === 'segment') {
             // For segment mode, we don't really track history in processedRef the same way
             processedRef.current = '' 
          } else {
             processedRef.current = textToEmit
          }
          
        } else {
          console.log('Interim transcription segment:', text)
          setInterimTranscription(text)
          
          if (emitMode === 'segment') {
             options.onTranscriptionUpdate?.(textToEmit, false)
          } else if (delta) {
             options.onTranscriptionUpdate?.(delta, false)
          }
          
          if (emitMode === 'delta') {
            processedRef.current = textToEmit
          }
        }
      })

      setIsRecording(true)
      console.log('useVoiceTranscription: setIsRecording(true) called')
      
      // Start visualization updates if callback provided
      if (options.onVisualizationUpdate) {
        const updateVisualization = () => {
          if (voiceServiceRef.current?.isRecording()) {
            const vizData = (voiceServiceRef.current as any).getAudioVisualizationData?.()
            if (vizData) {
              options.onVisualizationUpdate!(vizData.frequencies)
            }
            animationFrameRef.current = requestAnimationFrame(updateVisualization)
          }
        }
        updateVisualization()
      }
    } catch (error: any) {
      console.error('Failed to start recording:', error)
      if (error.name === 'NotAllowedError' || error.message.includes('microphone')) {
        setPermissionDenied(true)
        const errorMsg = 'Microphone permission denied'
        setError(errorMsg)
        options.onError?.(errorMsg)
      } else {
        const errorMsg = 'Failed to start recording'
        setError(errorMsg)
        options.onError?.(errorMsg)
      }
    }
  }, [language, transcription, options])

  const stopRecording = useCallback(async (cancelled: boolean = false) => {
    if (!voiceServiceRef.current || !isRecording) return
    isCancelledRef.current = cancelled;

    try {
      await voiceServiceRef.current.stopRecording(cancelled)
      setIsRecording(false)
      console.log('useVoiceTranscription: setIsRecording(false) called')
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = undefined
      }
      
      // Reset the service state for potential reuse
      if (voiceServiceRef.current?.reset) {
        voiceServiceRef.current.reset()
      }
    } catch (error) {
      console.error('Failed to stop recording:', error)
      const errorMsg = 'Failed to stop recording'
      setError(errorMsg)
      options.onError?.(errorMsg)
      
      // Reset service even on error
      if (voiceServiceRef.current?.reset) {
        voiceServiceRef.current.reset()
      }
    }
  }, [isRecording, options])

  const setLanguage = useCallback((newLanguage: string) => {
    setLanguageState(newLanguage);
  }, []);

  useEffect(() => {
    if (voiceServiceRef.current) {
      voiceServiceRef.current.setLanguage(language);
    }
  }, [language]);

  const getLanguage = useCallback(() => {
    return voiceServiceRef.current?.getLanguage() || language
  }, [language])

  // Cleanup effect
  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (voiceServiceRef.current) {
        try {
          voiceServiceRef.current.stopRecording(true)
        } catch {
          // Ignore cleanup errors
        }
        // Reset service state
        if (voiceServiceRef.current?.reset) {
          voiceServiceRef.current.reset()
        }
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  return {
    isRecording,
    transcription,
    interimTranscription,
    error,
    permissionDenied,
    startRecording,
    stopRecording,
    setLanguage,
    getLanguage,
    voiceServiceRef
  }
} 