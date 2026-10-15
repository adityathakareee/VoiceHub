import { Router } from 'express';
import { RoomController } from '../controllers/room.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// Protect all room endpoints with Phase 1 requireAuth middleware
router.use(requireAuth);

router.post('/', RoomController.createRoom);
router.get('/my', RoomController.getMyRooms);
router.get('/:roomCode', RoomController.getRoom);
router.get('/:roomCode/presence', RoomController.getRoomPresence);
router.get('/:roomCode/metrics', RoomController.getRoomMetrics);
router.get('/:roomCode/adaptive-state', RoomController.getRoomAdaptiveState);
router.post('/:roomCode/adaptive-config', RoomController.updateRoomAdaptiveConfig);
router.post('/:roomCode/state', RoomController.updateParticipantState);
router.patch('/:roomCode', RoomController.updateRoom);
router.patch('/:roomCode/close', RoomController.closeRoom);
router.post('/:roomCode/join', RoomController.joinRoom);
router.post('/:roomCode/leave', RoomController.leaveRoom);
router.post('/:roomCode/udp-token', RoomController.getUdpToken);

export default router;
