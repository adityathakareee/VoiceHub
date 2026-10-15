import { envConfig } from '../config/env.config';

export interface RoomOwner {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  department?: string;
}

export interface RoomParticipant {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  joinedAt: string;
  isMuted?: boolean;
  isSpeaking?: boolean;
  online?: boolean;
}

export interface RoomData {
  id: string;
  roomCode: string;
  name: string;
  description?: string;
  owner: RoomOwner;
  status: 'ACTIVE' | 'CLOSED';
  maxParticipants: number;
  participantCount: number;
  participants?: RoomParticipant[];
  isOwner?: boolean;
  isJoined?: boolean;
  createdAt?: string;
  closedAt?: string;
}

export interface RoomApiResponse<T = any> {
  success: boolean;
  message?: string;
  alreadyJoined?: boolean;
  room?: T;
  rooms?: T;
  participantCount?: number;
  roomCode?: string;
}

const handleResponse = async <T>(response: Response): Promise<T> => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMsg = data?.message || `Request failed with status ${response.status}`;
    throw new Error(errorMsg);
  }
  return data as T;
};

export const roomApi = {
  createRoom: async (payload: {
    name: string;
    description?: string;
    maxParticipants?: number;
  }): Promise<RoomApiResponse<RoomData>> => {
    const res = await fetch(`${envConfig.apiBaseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    return handleResponse<RoomApiResponse<RoomData>>(res);
  },

  getMyRooms: async (): Promise<RoomApiResponse<RoomData[]>> => {
    const res = await fetch(`${envConfig.apiBaseUrl}/api/rooms/my`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
      cache: 'no-store',
    });
    return handleResponse<RoomApiResponse<RoomData[]>>(res);
  },

  getRoom: async (roomCode: string): Promise<RoomApiResponse<RoomData>> => {
    const res = await fetch(`${envConfig.apiBaseUrl}/api/rooms/${encodeURIComponent(roomCode.trim())}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
      cache: 'no-store',
    });
    return handleResponse<RoomApiResponse<RoomData>>(res);
  },

  joinRoom: async (roomCode: string): Promise<RoomApiResponse<RoomData>> => {
    const res = await fetch(`${envConfig.apiBaseUrl}/api/rooms/${encodeURIComponent(roomCode.trim())}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    return handleResponse<RoomApiResponse<RoomData>>(res);
  },

  leaveRoom: async (roomCode: string): Promise<RoomApiResponse> => {
    const res = await fetch(`${envConfig.apiBaseUrl}/api/rooms/${encodeURIComponent(roomCode.trim())}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    return handleResponse<RoomApiResponse>(res);
  },

  updateRoom: async (
    roomCode: string,
    payload: { name?: string; description?: string; maxParticipants?: number }
  ): Promise<RoomApiResponse<RoomData>> => {
    const res = await fetch(`${envConfig.apiBaseUrl}/api/rooms/${encodeURIComponent(roomCode.trim())}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    return handleResponse<RoomApiResponse<RoomData>>(res);
  },

  closeRoom: async (roomCode: string): Promise<RoomApiResponse<RoomData>> => {
    const res = await fetch(`${envConfig.apiBaseUrl}/api/rooms/${encodeURIComponent(roomCode.trim())}/close`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    return handleResponse<RoomApiResponse<RoomData>>(res);
  },

  getUdpToken: async (
    roomCode: string
  ): Promise<{ success: boolean; data?: { token: string; roomCode: string; expiresIn: string } }> => {
    const res = await fetch(`${envConfig.apiBaseUrl}/api/rooms/${encodeURIComponent(roomCode.trim())}/udp-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    return handleResponse<{ success: boolean; data?: { token: string; roomCode: string; expiresIn: string } }>(res);
  },

  getPresence: async (
    roomCode: string
  ): Promise<{ success: boolean; roomCode: string; connectedCount: number; presence: any[] }> => {
    const res = await fetch(`${envConfig.apiBaseUrl}/api/rooms/${encodeURIComponent(roomCode.trim())}/presence`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    return handleResponse<{ success: boolean; roomCode: string; connectedCount: number; presence: any[] }>(res);
  },

  setMuteState: async (
    roomCode: string,
    isMuted: boolean
  ): Promise<{ success: boolean; isMuted: boolean }> => {
    const res = await fetch(`${envConfig.apiBaseUrl}/api/rooms/${encodeURIComponent(roomCode.trim())}/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ isMuted }),
    });
    return handleResponse<{ success: boolean; isMuted: boolean }>(res);
  },
};
