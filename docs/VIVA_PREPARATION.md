# CSE VOICE HUB — COMPREHENSIVE VIVA & TECHNICAL INTERVIEW GUIDE

This document provides clear, technically precise, and defensible answers to 29 core engineering and theoretical questions commonly asked during academic defense, viva voce, and technical evaluations.

---

### 1. Why UDP instead of TCP for real-time audio?
TCP guarantees reliability via acknowledgments and automatic retransmissions (ARQ). When a packet is lost, TCP halts delivery of subsequent packets until the missing packet is retransmitted (Head-of-Line Blocking). In conversational voice, a delayed audio frame ($> 150-200\text{ ms}$) is completely useless to the listener. UDP provides connectionless, unacknowledged transport with zero retransmission delay, allowing late or lost frames to be dropped or reconstructed without stalling the media stream.

### 2. Why not use standard WebRTC for this project?
WebRTC is an enterprise-grade standard, but its internal media pipeline—including SRTP encryption, ICE/STUN/TURN NAT traversal, DTLS handshakes, and proprietary Google Congestion Control (GCC)—is deeply abstracted inside the browser C++ engine. The purpose of this project was to construct, inspect, instrument, and evaluate a custom transport-layer adaptive UDP engine from first principles, including custom AIMD rate pacing, RFC 3550 jitter calculation, dynamic packetization, and companded application-level FEC.

### 3. Why is a Companion Bridge necessary?
Standard web browsers do not expose raw UDP socket APIs to client-side JavaScript for security reasons (preventing browser-based UDP amplification attacks). To bridge the browser's Web Audio API with native OS UDP sockets, the Companion Bridge runs as a local lightweight process on port 5002. It accepts PCM audio over local WebSockets and transmits UDP datagrams across the network using Node.js `node:dgram`.

### 4. What is the Control Plane?
The Control Plane handles reliable, transactional signaling and state persistence:
- User authentication and role enforcement (JWT in HttpOnly cookies).
- Conference room creation, joining, leaving, and metadata management (MongoDB/Mongoose).
- Real-time presence, mute status, and speaking indicators (WebSockets over `/ws/control`).
- Cryptographic minting of short-lived UDP session tokens.

### 5. What is the Data Plane?
The Data Plane handles high-throughput, low-latency media and telemetry transport:
- UDP datagram parsing and MTU validation ($\le 1200\text{ bytes}$).
- In-memory session registry with IP/port endpoint binding.
- Room-isolated packet routing and sender non-echo filtering.
- Dynamic rate control signaling and RFC 2198-inspired FEC recovery.

### 6. What is the complete audio signal path?
Microphone $\to$ Web Audio API (`AudioContext` 16 kHz Mono Float32) $\to$ Signed 16-bit Linear PCM (PCM16) $\to$ Companion Bridge $\to$ Dynamic Framing & Companding $\to$ UDP Datagram (`127.0.0.1:5001`) $\to$ Media Router $\to$ Peer Companion Bridge $\to$ Loss Detection & FEC Reconstruction $\to$ Browser Playout Buffer $\to$ Multi-Stream Gain Graph ($1/\sqrt{N}$) $\to$ Speakers.

### 7. How is packet loss detected and measured?
The receiver tracks sequence numbers ($S$) on incoming DATA packets. If packet $S_k$ arrives after $S_i$ where $S_k > S_i + 1$, the difference represents dropped packets. Rolling packet loss is computed as:
$$\text{Loss Rate} = \frac{\text{Packets Lost}}{\text{Packets Received} + \text{Packets Lost}} \times 100\%$$

### 8. How is inter-arrival jitter calculated?
Jitter is calculated using the first-order recursive estimator defined in **RFC 3550 (Section 6.4.1)**:
For consecutive packets $i$ and $j$ with send timestamps $S$ and arrival timestamps $R$:
$$D(i, j) = (R_j - R_i) - (S_j - S_i)$$
$$J_i = J_{i-1} + \frac{|D(i, j)| - J_{i-1}}{16}$$
This exponential smoothing filter weights recent transit delay variations while filtering transient noise.

### 9. How is Round-Trip Time (RTT) measured?
The client periodically transmits a lightweight `PING` packet containing high-resolution timestamp $T_1$. The server immediately echoes a `PONG` packet with the same sequence number. Upon receipt at $T_2$, the client computes $\text{RTT} = T_2 - T_1$.

### 10. What is AIMD?
**Additive Increase / Multiplicative Decrease** is a feedback-driven congestion control strategy. When network conditions are pristine, transmission rates increase linearly (additive steps) to probe for available bandwidth. When congestion, packet loss, or delay spikes are detected, transmission rates decrease aggressively by a multiplicative factor to rapidly drain network buffers and relieve congestion.

### 11. How does the rate adaptation algorithm work?
Every 1000 ms, the `AdaptiveRateController` ingests RTT, jitter, packet loss %, and quality state. It executes deterministic transition rules:
- Pristine conditions $\implies$ Additive Increase through profile tiers.
- Moderate degradation $\implies$ Throttles to `CONSTRAINED` (32 kbps).
- Severe degradation $\implies$ Multiplicatively drops to `CRITICAL` (16 kbps).

### 12. What triggers the `CONSTRAINED` profile?
Moderate congestion: Packet loss $> 3.0\%$ OR RTT $> 150\text{ ms}$ OR Jitter $> 30\text{ ms}$ OR Quality Rating = `FAIR`.

### 13. What triggers the `CRITICAL` profile?
Severe congestion: Packet loss $> 8.0\%$ OR RTT $> 300\text{ ms}$ OR Jitter $> 60\text{ ms}$ OR Quality Rating = `POOR`.

### 14. How does the application-level FEC work?
Inspired by **RFC 2198**, each audio packet carrying frame $N$ also includes a compressed copy of frame $N-1$. If frame $N-1$ was lost in transit, the receiver extracts the redundant payload from packet $N$, decodes the compressed samples, and seamlessly fills the gap before playout.

### 15. Why is the wire MTU clamped at 1200 bytes?
Standard Ethernet Maximum Transmission Unit (MTU) is 1500 bytes. When traversing VPNs, mobile networks, or PPPoE tunnels, path MTU often drops to 1400–1492 bytes. Clamping all application-layer UDP datagrams to **1200 bytes** guarantees that packets will never be fragmented at the IP layer, avoiding the severe packet-loss multiplier effect of IP fragmentation.

### 16. How is MTU safety maintained when FEC is active?
A 20 ms frame of raw PCM16 is 640 bytes; attaching a second 640-byte copy would yield 1280 bytes of audio alone, exceeding the 1200-byte limit. To prevent this, the system compands 16-bit samples to 8-bit non-linear representations and decimates redundant audio by factors of 4 to 8, bringing total serialized packet wire size down to 780–986 bytes.

### 17. How is dynamic playout buffering calculated?
The receiver buffer delay dynamically expands and contracts to cushion jitter without introducing excessive conversational delay:
$$\text{targetPlayoutDelayMs} = \text{clamp}\Big(20\text{ ms},\; 200\text{ ms},\; \text{round}(2.5 \times \text{jitter} + 0.1 \times \text{RTT} + 15\text{ ms})\Big)$$

### 18. Why is hysteresis necessary in rate adaptation?
Without hysteresis, fluctuating telemetry right on a decision boundary (e.g., oscillating between 1.9% and 2.1% loss) would cause the controller to rapidly flap between profiles and repeatedly toggle FEC. Hysteresis ensures:
- FEC activates at $\ge 2.0\%$ loss, but deactivates only when loss falls below $1.0\%$.
- Upgrading to `ULTRA` requires sustained excellence across 3+ consecutive intervals.

### 19. How does multi-user routing work on the server?
The UDP server acts as an in-memory packet router. When a DATA packet arrives from session $S_i$ in room $R_k$, the `RoomRouter` queries its session table for all active endpoints registered to $R_k$ and dispatches UDP unicast datagrams to all peers except $S_i$.

### 20. How is room isolation strictly enforced?
The `RoomRouter` indexes sessions by `roomCode`. Outgoing packet multicasting iterates strictly over the set of sockets matching the sender's room. Packets cannot traverse to other rooms.

### 21. How are UDP sessions authenticated?
Clients cannot simply send UDP packets to the server. They must first acquire an HMAC-SHA256 signed session token from the authenticated Control Plane REST API. The UDP server verifies the token signature against `UDP_SESSION_SECRET` during the `REGISTER` handshake before admitting the session.

### 22. What prevents IP/Port spoofing or session hijacking?
Once registered, the session ID is pinned to the client's remote IP address and UDP port. If a packet arrives with a valid session ID but a mismatched source address or port, the server immediately drops the packet and logs an `INVALID_ENDPOINT` security violation.

### 23. What happens if a client disconnects unexpectedly?
The `HeartbeatManager` runs every 5000 ms. If no packets or heartbeats are received from a session for $> 15,000\text{ ms}$, the session is purged from memory, free sockets are closed, and room routing stops forwarding audio to that endpoint.

### 24. How does reconnection work?
When a disconnected user rejoins, the Control Plane issues a fresh UDP session token. The UDP server invalidates the prior stale session and registers a new session ID, preventing sequence collision or state corruption.

### 25. How was the entire system tested?
Through 12 automated test suites comprising **270 total automated checks** across 10 phases, covering unit logic, cryptographic security, multi-client concurrency, audio framing, network metrics, adaptive state transitions, and load scaling.

### 26. What does "270 / 270 PASS" signify?
It confirms that every single automated assertion from Phase 1 through Phase 10 executed and passed with zero failures, verified by independent acceptance audits.

### 27. What are the known limitations of the project?
- Physical acoustic microphones and speakers were not tested in the automated CI pipeline.
- WAN impairments were simulated at the telemetry and packet layer rather than using hardware network emulators.
- The project is a single-server prototype; horizontal scaling across multiple media servers would require an inter-server routing mesh.
- Non-linear 8-bit companding introduces slight high-frequency loss during severe FEC decimation compared to Opus.

### 28. What is the primary research contribution?
The verifiable, end-to-end engineering integration of eight real-time networking concepts (RFC 3550 telemetry, AIMD rate control, dynamic framing, MTU-safe RFC 2198 redundancy, adaptive playout scheduling, room-isolated UDP routing, HMAC session security, and multi-stream Web Audio mixing) into a transparent, reproducible research platform.

### 29. What would be implemented next in a production deployment?
1. Replace PCM companding with the IETF Opus codec (RFC 6716).
2. Integrate WebTransport / WebCodecs browser APIs to eliminate the localhost Companion Bridge process.
3. Deploy an inter-server Selective Forwarding Unit (SFU) mesh for multi-region scalability.
