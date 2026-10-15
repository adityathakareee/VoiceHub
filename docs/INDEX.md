# CSE VOICE HUB — DOCUMENTATION INDEX

Welcome to the definitive documentation index for the **CSE Voice Hub** project.

---

## 1. System Architecture & Protocols
- [Final System Architecture](file:///c:/Users/thaka/OneDrive/Desktop/VIT/SEM5/CNT/CourseProject/docs/FINAL_ARCHITECTURE.md): Complete high-level architecture, Control Plane vs. Data Plane separation, audio signal path, and isolation boundaries.
- [Definitive UDP Protocol Specification](file:///c:/Users/thaka/OneDrive/Desktop/VIT/SEM5/CNT/CourseProject/docs/UDP_PROTOCOL.md): Wire format, schema, packet types, authentication handshake, and 1200-byte MTU enforcement.
- [UDP Architecture Reference](file:///c:/Users/thaka/OneDrive/Desktop/VIT/SEM5/CNT/CourseProject/docs/UDP_ARCHITECTURE.md): In-memory session registry, router multicast design, and heartbeat manager.

---

## 2. Adaptive Media Engine & Telemetry
- [Adaptive UDP Rate Control Specification](file:///c:/Users/thaka/OneDrive/Desktop/VIT/SEM5/CNT/CourseProject/docs/ADAPTIVE_UDP.md): AIMD algorithm, 5 transmission profiles, RFC 3550 playout buffer formula, and companded FEC redundancy.
- [Network Monitoring & Metrics Specification](file:///c:/Users/thaka/OneDrive/Desktop/VIT/SEM5/CNT/CourseProject/docs/PHASE7_NETWORK_METRICS.md): RFC 3550 jitter estimator, sequence gap loss measurement, rolling bitrate accounting, and quality classification.
- [Adaptive UDP Phase 8 Deep-Dive](file:///c:/Users/thaka/OneDrive/Desktop/VIT/SEM5/CNT/CourseProject/docs/PHASE8_ADAPTIVE_UDP.md): Comprehensive review of real-time packetization and rate adaptation.

---

## 3. Audio Transport & Multi-User Mixing
- [Real-Time Audio Transport Specification](file:///c:/Users/thaka/OneDrive/Desktop/VIT/SEM5/CNT/CourseProject/docs/PHASE4_AUDIO_ARCHITECTURE.md): Web Audio API pipeline, 16 kHz Mono PCM16 representation, Companion Bridge WebSocket adapter, and playout scheduling.
- [Multi-User Audio Conferencing & Mixing](file:///c:/Users/thaka/OneDrive/Desktop/VIT/SEM5/CNT/CourseProject/docs/PHASE5_MULTIUSER_AUDIO.md): Client-side multi-stream mixing, per-sender audio nodes, and master gain headroom scaling ($1/\sqrt{N}$).
- [Real-Time State Synchronization](file:///c:/Users/thaka/OneDrive/Desktop/VIT/SEM5/CNT/CourseProject/docs/PHASE6_PARTICIPANT_STATE_SYNC.md): WebSocket presence synchronization, live mute status, speaking indicators, and REST fallback.

---

## 4. Security & Reliability
- [Security & Reliability Architecture](file:///c:/Users/thaka/OneDrive/Desktop/VIT/SEM5/CNT/CourseProject/docs/PHASE9_SECURITY_RELIABILITY.md): JWT HttpOnly cookies, HMAC UDP tokens, IP/port pinning, malformed datagram barriers, and graceful reconnection.

---

## 5. Performance & Empirical Evaluation
- [Phase 10 Testing & Performance Report](file:///c:/Users/thaka/OneDrive/Desktop/VIT/SEM5/CNT/CourseProject/docs/PHASE10_TESTING_PERFORMANCE.md): Comprehensive evaluation report covering all 12 empirical experiments, data tables, and technical limitations.
- [Phase 10 Benchmark Results (JSON)](file:///c:/Users/thaka/OneDrive/Desktop/VIT/SEM5/CNT/CourseProject/docs/performance/phase10_benchmark_results.json): Machine-readable execution dataset containing raw measurements.

---

## 6. Academic Research & Presentation
- [Research Positioning, Literature & Prior-Art Review](file:///c:/Users/thaka/OneDrive/Desktop/VIT/SEM5/CNT/CourseProject/docs/RESEARCH_AND_LITERATURE.md): Research problem statement, research gap, RFC literature citations, comparison matrix, and engineering contributions.
- [Master Technical Project Summary](file:///c:/Users/thaka/OneDrive/Desktop/VIT/SEM5/CNT/CourseProject/docs/PROJECT_SUMMARY.md): Master technical summary from problem statement to limitations.
- [Viva & Technical Interview Preparation Guide](file:///c:/Users/thaka/OneDrive/Desktop/VIT/SEM5/CNT/CourseProject/docs/VIVA_PREPARATION.md): 29 concise technical Q&As for academic defense and evaluation.
- [Final Demonstration Walkthrough](file:///c:/Users/thaka/OneDrive/Desktop/VIT/SEM5/CNT/CourseProject/docs/FINAL_DEMO_FLOW.md): Step-by-step presentation script distinguishing live operations from simulated degradation.
- [Reproducibility & Verification Manual](file:///c:/Users/thaka/OneDrive/Desktop/VIT/SEM5/CNT/CourseProject/docs/REPRODUCIBILITY.md): Complete setup guide, service startup commands, and all 10 automated test suites.
