import { useCallback } from 'react';
import {
  useAudioSession,
  MicPermissionState,
  AudioSessionState,
  RemoteParticipantStream,
  RemoteParticipantInfo,
} from '../context/AudioSessionContext';

export type {
  MicPermissionState,
  AudioSessionState,
  RemoteParticipantStream,
  RemoteParticipantInfo,
};

export interface UseRealtimeAudioOptions {
  roomCode: string;
}

/**
 * useRealtimeAudio
 *
 * Facade hook over the persistent AudioSessionContext.
 * Audio capture, Web Audio API processing, and UDP streaming survive
 * React route navigation because the session lifecycle is managed by AudioSessionProvider.
 * Unmounting the local Active Room component does NOT tear down the microphone
 * stream or close the UDP session.
 */
export function useRealtimeAudio({ roomCode }: UseRealtimeAudioOptions) {
  const session = useAudioSession();
  const isThisRoom = session.activeRoomCode === roomCode;

  const startAudio = useCallback(async () => {
    await session.startAudio(roomCode);
  }, [session, roomCode]);

  return {
    ...session,
    sessionState: isThisRoom ? session.sessionState : 'DISCONNECTED',
    framesSent: isThisRoom ? session.framesSent : 0,
    framesReceivedTotal: isThisRoom ? session.framesReceivedTotal : 0,
    remoteParticipants: isThisRoom ? session.remoteParticipants : [],
    startAudio,
  };
}
