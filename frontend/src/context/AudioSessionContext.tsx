import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { audioBridgeClient, NetworkMetrics, AdaptiveState } from '../services/audioBridgeClient';
import { roomPresenceClient } from '../services/roomPresenceClient';
import { roomApi } from '../services/room';
import { useAuth } from './AuthContext';
import {
  float32ToPcm16,
  pcm16ToFloat32,
  pcm16ToBase64,
  base64ToPcm16,
  getSamplesForDuration,
} from '../utils/audioPcm';

export type MicPermissionState = 'prompt' | 'granted' | 'denied' | 'unsupported';
export type AudioSessionState =
  | 'DISCONNECTED'
  | 'CONNECTING_BRIDGE'
  | 'OBTAINING_TOKEN'
  | 'REGISTERING_UDP'
  | 'CONNECTED'
  | 'ERROR';

export interface RemoteParticipantStream {
  sessionId: string;
  clientId: string;
  gainNode: GainNode;
  lastSequence: number;
  lastSeen: number;
  nextPlayTime: number;
  framesReceived: number;
}

export interface RemoteParticipantInfo {
  sessionId: string;
  clientId: string;
  lastSeen: number;
  framesReceived: number;
  isSpeaking: boolean;
}

export interface AudioSessionContextValue {
  activeRoomCode: string | null;
  sessionState: AudioSessionState;
  micPermission: MicPermissionState;
  isMuted: boolean;
  errorMessage: string | null;
  framesSent: number;
  framesReceivedTotal: number;
  remoteParticipants: RemoteParticipantInfo[];
  networkMetrics: NetworkMetrics | null;
  adaptiveState: AdaptiveState | null;
  isAudioConnected: boolean;
  startAudio: (roomCode: string) => Promise<void>;
  stopAudio: () => void;
  toggleMute: () => void;
  setTransmissionMode: (mode: 'AUTO' | 'MANUAL', profile?: string) => void;
}

const AudioSessionContext = createContext<AudioSessionContextValue | undefined>(undefined);

export const AudioSessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  const [activeRoomCode, setActiveRoomCode] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<AudioSessionState>('DISCONNECTED');
  const [micPermission, setMicPermission] = useState<MicPermissionState>('prompt');
  const [isMuted, setIsMuted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [framesSent, setFramesSent] = useState(0);
  const [framesReceivedTotal, setFramesReceivedTotal] = useState(0);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipantInfo[]>([]);
  const [networkMetrics, setNetworkMetrics] = useState<NetworkMetrics | null>(null);
  const [adaptiveState, setAdaptiveState] = useState<AdaptiveState | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);
  const sequenceRef = useRef(0);
  const isMutedRef = useRef(isMuted);
  const activeRoomCodeRef = useRef<string | null>(null);

  // Phase 8 Adaptive Audio Framing & Playout Sizing refs
  const currentFrameDurationMsRef = useRef<number>(20);
  const currentSamplesPerFrameRef = useRef<number>(320);
  const targetPlayoutDelayRef = useRef<number>(35);

  // Map of per-sender remote audio stream nodes
  const remoteStreamsRef = useRef<Map<string, RemoteParticipantStream>>(new Map());
  // Buffer chunking for local capture output
  const outputBufferRef = useRef<number[]>([]);

  // Sync mute state with bridge and presence
  useEffect(() => {
    isMutedRef.current = isMuted;
    audioBridgeClient.setMute(isMuted);
    roomPresenceClient.setMute(isMuted);
  }, [isMuted]);

  // Adjust Master Gain for headroom based on active remote participant count
  const updateMasterGain = useCallback(() => {
    if (!masterGainRef.current) return;
    const activeCount = remoteStreamsRef.current.size;
    const targetGain = activeCount > 0 ? 1 / Math.sqrt(Math.max(1, activeCount)) : 1.0;
    masterGainRef.current.gain.setTargetAtTime(targetGain, audioCtxRef.current?.currentTime || 0, 0.05);
  }, []);

  // Update remote participant info state for UI
  const syncRemoteParticipantsState = useCallback(() => {
    const now = Date.now();
    const list: RemoteParticipantInfo[] = [];

    remoteStreamsRef.current.forEach((stream) => {
      list.push({
        sessionId: stream.sessionId,
        clientId: stream.clientId,
        lastSeen: stream.lastSeen,
        framesReceived: stream.framesReceived,
        isSpeaking: now - stream.lastSeen < 600,
      });
    });

    setRemoteParticipants(list);
  }, []);

  // Audio Playback Handler for per-sender inbound PCM frames (Multi-User Mixing)
  const playPcmFrame = useCallback(
    (pcmBase64: string, senderSessionId: string, senderClientId: string, sequence: number) => {
      try {
        if (!pcmBase64 || typeof pcmBase64 !== 'string') return;
        if (senderSessionId === audioBridgeClient.sessionId) return; // avoid self echo

        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
          audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
            sampleRate: 16000,
          });
        }

        const audioCtx = audioCtxRef.current;
        if (audioCtx.state === 'suspended') {
          audioCtx.resume();
        }

        // Setup Master Gain if not present
        if (!masterGainRef.current) {
          masterGainRef.current = audioCtx.createGain();
          masterGainRef.current.connect(audioCtx.destination);
        }

        // Get or Create Remote Participant Stream Node Graph
        let stream = remoteStreamsRef.current.get(senderSessionId);
        if (!stream) {
          const participantGain = audioCtx.createGain();
          participantGain.connect(masterGainRef.current);

          stream = {
            sessionId: senderSessionId,
            clientId: senderClientId || `client_${senderSessionId.slice(-6)}`,
            gainNode: participantGain,
            lastSequence: 0,
            lastSeen: Date.now(),
            nextPlayTime: audioCtx.currentTime,
            framesReceived: 0,
          };
          remoteStreamsRef.current.set(senderSessionId, stream);
          updateMasterGain();
        }

        // Check Sequence Number to filter duplicate / out-of-order frames
        if (sequence <= stream.lastSequence && stream.lastSequence > 0) {
          return;
        }
        stream.lastSequence = sequence;
        stream.lastSeen = Date.now();
        stream.framesReceived += 1;

        // Decode PCM Frame
        const pcm16 = base64ToPcm16(pcmBase64);
        const float32 = pcm16ToFloat32(pcm16);

        const buffer = audioCtx.createBuffer(1, float32.length, 16000);
        buffer.getChannelData(0).set(float32);

        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(stream.gainNode);

        const currentTime = audioCtx.currentTime;
        const targetDelaySec = Math.min(
          0.2,
          Math.max(0.02, (targetPlayoutDelayRef.current || 35) / 1000)
        );
        if (
          stream.nextPlayTime < currentTime ||
          stream.nextPlayTime > currentTime + targetDelaySec + 0.1
        ) {
          stream.nextPlayTime = currentTime + targetDelaySec;
        }

        source.start(stream.nextPlayTime);
        stream.nextPlayTime += buffer.duration;

        setFramesReceivedTotal((prev) => prev + 1);
        syncRemoteParticipantsState();
      } catch (err) {
        console.error('[AudioSession] Error playing PCM frame:', err);
      }
    },
    [updateMasterGain, syncRemoteParticipantsState]
  );

  // Periodic Cleanup Timer for stale remote audio streams (>3s inactivity)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      let changed = false;

      remoteStreamsRef.current.forEach((stream, sessionId) => {
        if (now - stream.lastSeen > 3000) {
          try {
            stream.gainNode.disconnect();
          } catch (_e) {}
          remoteStreamsRef.current.delete(sessionId);
          changed = true;
        }
      });

      if (changed) {
        updateMasterGain();
        syncRemoteParticipantsState();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [updateMasterGain, syncRemoteParticipantsState]);

  // Bridge Message listener
  useEffect(() => {
    const handleBridgeMessage = (msg: any) => {
      if (msg.type === 'SESSION_STATUS') {
        if (msg.status === 'REGISTERED') {
          setSessionState('CONNECTED');
          setErrorMessage(null);
        } else if (msg.status === 'ERROR') {
          setSessionState('ERROR');
          setErrorMessage(msg.error || 'UDP session registration failed');
        } else if (msg.status === 'CLOSED') {
          setSessionState('DISCONNECTED');
          setActiveRoomCode(null);
          activeRoomCodeRef.current = null;
        }
      } else if (msg.type === 'AUDIO_FRAME' && msg.pcm) {
        playPcmFrame(msg.pcm, msg.senderSessionId, msg.senderClientId, msg.sequence || 0);
      } else if (msg.type === 'NETWORK_METRICS' && msg.metrics) {
        setNetworkMetrics(msg.metrics);
      } else if (msg.type === 'ADAPTIVE_STATE_UPDATE' && msg.adaptiveState) {
        setAdaptiveState(msg.adaptiveState);
        const dur = msg.adaptiveState.frameIntervalMs || 20;
        currentFrameDurationMsRef.current = dur;
        currentSamplesPerFrameRef.current = getSamplesForDuration(dur);
        if (typeof msg.adaptiveState.targetPlayoutDelayMs === 'number') {
          targetPlayoutDelayRef.current = msg.adaptiveState.targetPlayoutDelayMs;
        }
      }
    };

    audioBridgeClient.addMessageListener(handleBridgeMessage);
    return () => {
      audioBridgeClient.removeMessageListener(handleBridgeMessage);
    };
  }, [playPcmFrame]);

  // Stop Audio Session & Cleanup
  const stopAudio = useCallback(() => {
    if (scriptNodeRef.current) {
      try {
        scriptNodeRef.current.disconnect();
      } catch (_e) {}
      scriptNodeRef.current = null;
    }

    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      } catch (_e) {}
      mediaStreamRef.current = null;
    }

    // Cleanup all remote participant audio nodes
    remoteStreamsRef.current.forEach((stream) => {
      try {
        stream.gainNode.disconnect();
      } catch (_e) {}
    });
    remoteStreamsRef.current.clear();

    if (masterGainRef.current) {
      try {
        masterGainRef.current.disconnect();
      } catch (_e) {}
      masterGainRef.current = null;
    }

    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      try {
        audioCtxRef.current.close();
      } catch (_e) {}
      audioCtxRef.current = null;
    }

    try {
      audioBridgeClient.stopSession();
    } catch (_e) {}

    try {
      roomPresenceClient.setSpeaking(false);
    } catch (_e) {}

    activeRoomCodeRef.current = null;
    setActiveRoomCode(null);
    setSessionState('DISCONNECTED');
    setFramesSent(0);
    setFramesReceivedTotal(0);
    setRemoteParticipants([]);
    setNetworkMetrics(null);
    setAdaptiveState(null);
    outputBufferRef.current = [];
    sequenceRef.current = 0;
  }, []);

  // Start Audio Session for a specific room
  const startAudio = useCallback(
    async (roomCode: string) => {
      // 0. If already connected to this room, do not recreate stream
      if (
        activeRoomCodeRef.current === roomCode &&
        (sessionState === 'CONNECTED' ||
          sessionState === 'CONNECTING_BRIDGE' ||
          sessionState === 'REGISTERING_UDP')
      ) {
        return;
      }

      // If connected to a different room, clean it up first
      if (activeRoomCodeRef.current && activeRoomCodeRef.current !== roomCode) {
        stopAudio();
      }

      try {
        setErrorMessage(null);
        setActiveRoomCode(roomCode);
        activeRoomCodeRef.current = roomCode;
        setSessionState('OBTAINING_TOKEN');

        // 1. Check microphone support
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setMicPermission('unsupported');
          throw new Error('Microphone access is not supported by your browser.');
        }

        // 2. Fetch UDP Token from backend API
        const tokenRes = await roomApi.getUdpToken(roomCode);
        if (!tokenRes.data?.token) {
          throw new Error('Failed to obtain UDP token from backend.');
        }
        const token = tokenRes.data.token;

        // 3. Connect to Local Companion Bridge
        setSessionState('CONNECTING_BRIDGE');
        await audioBridgeClient.connect();

        // 4. Register session on UDP server
        setSessionState('REGISTERING_UDP');
        audioBridgeClient.startSession(token, roomCode);

        // 5. Request Mic Access
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        setMicPermission('granted');
        mediaStreamRef.current = stream;

        // Handle external mic revoking
        stream.getTracks().forEach((track) => {
          track.onended = () => {
            stopAudio();
          };
        });

        // 6. Setup AudioContext & Processor
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
          audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
            sampleRate: 16000,
          });
        }
        const audioCtx = audioCtxRef.current;
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }

        if (!masterGainRef.current) {
          masterGainRef.current = audioCtx.createGain();
          masterGainRef.current.connect(audioCtx.destination);
        }

        const source = audioCtx.createMediaStreamSource(stream);
        const scriptNode = audioCtx.createScriptProcessor(1024, 1, 1);
        scriptNodeRef.current = scriptNode;

        scriptNode.onaudioprocess = (e) => {
          if (isMutedRef.current) return;

          const inputData = e.inputBuffer.getChannelData(0);
          for (let i = 0; i < inputData.length; i++) {
            outputBufferRef.current.push(inputData[i]);
          }

          const targetSamples = currentSamplesPerFrameRef.current || 320;
          while (outputBufferRef.current.length >= targetSamples) {
            const frameChunk = outputBufferRef.current.splice(0, targetSamples);
            const float32Chunk = new Float32Array(frameChunk);

            // Phase 6 Voice Activity Detection (RMS amplitude threshold)
            let sumSquares = 0;
            for (let s = 0; s < float32Chunk.length; s++) {
              sumSquares += float32Chunk[s] * float32Chunk[s];
            }
            const rms = Math.sqrt(sumSquares / float32Chunk.length);
            const isSpeakingNow = rms > 0.015;
            roomPresenceClient.setSpeaking(isSpeakingNow);

            const pcm16 = float32ToPcm16(float32Chunk);
            const base64Pcm = pcm16ToBase64(pcm16);

            sequenceRef.current += 1;
            audioBridgeClient.sendAudioFrame(
              base64Pcm,
              sequenceRef.current,
              currentFrameDurationMsRef.current
            );
            setFramesSent((prev) => prev + 1);
          }
        };

        source.connect(scriptNode);
        scriptNode.connect(audioCtx.destination);
      } catch (err: any) {
        console.error('[AudioSession] Error starting audio:', err);
        const msg = err instanceof Error ? err.message : 'Audio initialization error';
        setSessionState('ERROR');
        setErrorMessage(msg);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setMicPermission('denied');
        }
        stopAudio();
      }
    },
    [sessionState, stopAudio]
  );

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const setTransmissionMode = useCallback((mode: 'AUTO' | 'MANUAL', profile?: string) => {
    audioBridgeClient.setTransmissionMode(mode, profile);
    if (profile) {
      const durMap: Record<string, number> = {
        ULTRA: 15,
        HIGH: 20,
        STANDARD: 20,
        CONSTRAINED: 25,
        CRITICAL: 40,
      };
      if (durMap[profile]) {
        currentFrameDurationMsRef.current = durMap[profile];
        currentSamplesPerFrameRef.current = getSamplesForDuration(durMap[profile]);
      }
    }
  }, []);

  // Cleanup when user logs out
  useEffect(() => {
    if (!user && activeRoomCodeRef.current) {
      stopAudio();
    }
  }, [user, stopAudio]);

  // Cleanup on window/tab close
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (activeRoomCodeRef.current) {
        stopAudio();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [stopAudio]);

  const value: AudioSessionContextValue = {
    activeRoomCode,
    sessionState,
    micPermission,
    isMuted,
    errorMessage,
    framesSent,
    framesReceivedTotal,
    remoteParticipants,
    networkMetrics,
    adaptiveState,
    isAudioConnected: sessionState === 'CONNECTED',
    startAudio,
    stopAudio,
    toggleMute,
    setTransmissionMode,
  };

  return <AudioSessionContext.Provider value={value}>{children}</AudioSessionContext.Provider>;
};

export const useAudioSession = (): AudioSessionContextValue => {
  const context = useContext(AudioSessionContext);
  if (!context) {
    throw new Error('useAudioSession must be used within an AudioSessionProvider');
  }
  return context;
};

