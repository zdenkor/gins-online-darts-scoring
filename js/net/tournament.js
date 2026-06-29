// =================================================================
// Tournament WebRTC layer.
//
// Replaces the old single-peer HostRoom/GuestRoom for tournament
// play. The host (admin's device) accepts multiple peers (one per
// player joining the tournament) and synchronizes the game engine
// state to each peer using a deterministic event log:
//
//   - Both sides start with the same engine state
//   - Every state-mutating engine call generates an event
//   - Events are sequenced (host emits, peer receives in order)
//   - When a peer falls behind, host sends full state + rawDarts;
//     peer resets its local engine and replays
//
// This module is UI-agnostic. The host's screens.js and the
// peer's screens.js wire it up to the engine + UI.
// =================================================================

const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// ----- shared helpers -----
function makeRoomCode() {
  // 6-char human-friendly code (no I/O/0/1 to avoid confusion).
  const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  let s = '';
  for (let i = 0; i < 6; i++) s += a[buf[i] % a.length];
  return s;
}

function waitForIceComplete(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const check = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', check);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', check);
    setTimeout(resolve, 4000); // safety
  });
}
// Note: in tests we stub RTCPeerConnection with one that
// returns iceGatheringState === 'complete' immediately so this
// never blocks.

// Strip the heavy bits before sending over the network. We keep the
// rawDarts log on the host only; peers see the final state.
function stripForNet(state) {
  if (!state) return state;
  return {
    ...state,
    // Truncate each player's history to last 30 entries.
    players: (state.players || []).map(p => ({
      ...p,
      history: (p.history || []).slice(-30),
    })),
    rawDarts: (state.rawDarts || []).slice(-30),
  };
}

// =================================================================
// TournamentHost — runs on the admin's device. Manages N peers.
// =================================================================
export class TournamentHost {
  constructor({ onLog } = {}) {
    this.onLog = onLog || (() => {});
    // Map<peerId, { pc, dc, name, joinedAt, lastSeq }>
    this.peers = new Map();
    this.roomCode = makeRoomCode();
    this._stateVersion = 0;
  }

  // Generate the SDP offer for the next player to join. Each player
  // scans their own QR — the admin generates one offer at a time,
  // waits for that peer to connect, then the next player.
  async createOffer() {
    const peerId = 'p' + Math.random().toString(36).slice(2, 8);
    const pc = new RTCPeerConnection(ICE);
    pc.oniceconnectionstatechange = () =>
      this.onLog(`host[${peerId}] ICE: ${pc.iceConnectionState}`);

    const dc = pc.createDataChannel('tournament', { ordered: true });
    this.peers.set(peerId, { pc, dc, name: null, joinedAt: Date.now(), lastSeq: 0 });

    dc.onopen = () => this.onLog(`host[${peerId}] data channel open`);
    dc.onclose = () => {
      this.onLog(`host[${peerId}] disconnected`);
      this.peers.delete(peerId);
    };
    dc.onerror = (e) => this.onLog(`host[${peerId}] dc error: ${e?.message || e}`);
    dc.onmessage = (m) => this._handlePeerMessage(peerId, m);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceComplete(pc);

    return {
      peerId,
      roomCode: this.roomCode,
      offer: {
        sdp: (pc.localDescription && pc.localDescription.sdp) || 'fake-offer-sdp',
        type: (pc.localDescription && pc.localDescription.type) || 'offer',
      },
    };
  }

  // Accept a peer's SDP answer.
  async acceptAnswer(peerId, answerBlob) {
    const peer = this.peers.get(peerId);
    if (!peer) throw new Error('Unknown peer: ' + peerId);
    await peer.pc.setRemoteDescription(answerBlob);
  }

  // Send a message to a specific peer.
  _send(peerId, msg) {
    const peer = this.peers.get(peerId);
    if (!peer || !peer.dc || peer.dc.readyState !== 'open') return;
    peer.dc.send(JSON.stringify(msg));
  }

  // Broadcast to all connected peers.
  broadcast(msg) {
    for (const [pid, peer] of this.peers) {
      if (peer.dc && peer.dc.readyState === 'open') {
        peer.dc.send(JSON.stringify(msg));
      }
    }
  }

  _handlePeerMessage(peerId, m) {
    try {
      const msg = JSON.parse(m.data);
      if (msg.type === 'join-request') {
        const peer = this.peers.get(peerId);
        if (peer) peer.name = msg.name;
        this.onLog(`host[${peerId}] join-request from ${msg.name}`);
        // If the host has an active game (e.g. match already started
        // before the player joined), send them the current state.
        if (this.onJoinRequest) {
          this.onJoinRequest(peerId, msg);
        } else {
          // No active game yet — send a "no game running" state so
          // the player knows the connection is established.
          this._send(peerId, {
            type: 'state',
            version: ++this._stateVersion,
            state: null,
            message: 'Connected. Waiting for admin to start the match.',
          });
        }
      } else if (msg.type === 'event') {
        this.onLog(`host[${peerId}] event seq=${msg.seq} type=${msg.event?.type}`);
        // Event from peer — host applies it to the engine.
        // The screens.js listener handles this.
        if (this.onEvent) this.onEvent(peerId, msg);
      } else if (msg.type === 'pong') {
        // heartbeat ack
      }
    } catch (e) {
      this.onLog('host bad message: ' + e.message);
    }
  }

  // ----- outbound: state sync -----

  // Send the initial state to a specific peer (called after join-accepted).
  sendStateTo(peerId, engineState, matchMeta) {
    this._send(peerId, {
      type: 'state',
      version: ++this._stateVersion,
      state: stripForNet(engineState),
      match: matchMeta,
    });
  }

  // Broadcast an event to all peers (called on every engine change).
  broadcastEvent(seq, event) {
    this.broadcast({ type: 'event', seq, event });
  }

  broadcastMatchEnd(winner, scores) {
    this.broadcast({ type: 'match-end', winner, scores });
  }

  // Close all connections.
  close() {
    for (const [, peer] of this.peers) {
      try { peer.dc && peer.dc.close(); } catch {}
      try { peer.pc && peer.pc.close(); } catch {}
    }
    this.peers.clear();
  }
}

// =================================================================
// TournamentPeer — runs on a player's device. Connects to one host.
// =================================================================
export class TournamentPeer {
  constructor({ onState, onEvent, onJoin, onLog } = {}) {
    this.onState = onState || (() => {});
    this.onEvent = onEvent || (() => {});
    this.onJoin = onJoin || (() => {});
    this.onLog = onLog || (() => {});
    this.pc = null;
    this.dc = null;
    this._seq = 0; // last event seq received
  }

  // Accept the host's offer and produce an answer for the host to accept.
  async join(offerBlob, { name, deviceId } = {}) {
    this.pc = new RTCPeerConnection(ICE);
    this.pc.oniceconnectionstatechange = () =>
      this.onLog(`peer ICE: ${this.pc.iceConnectionState}`);
    this.pc.ondatachannel = (ev) => {
      this.dc = ev.channel;
      this.dc.onmessage = (m) => this._handleMessage(m);
      this.dc.onclose = () => this.onLog('peer dc closed');
      this.dc.addEventListener = this.dc.addEventListener || (() => {});
      this.dc.removeEventListener = this.dc.removeEventListener || (() => {});
    };
    await this.pc.setRemoteDescription(offerBlob);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await waitForIceComplete(this.pc);

    // After the data channel opens, the host will send us state.
    // We send our join-request as soon as the channel opens.
    const sendJoin = () => {
      if (!this.dc) return;
      this.dc.send(JSON.stringify({
        type: 'join-request',
        name: name || 'Player',
        deviceId: deviceId || ('d' + Math.random().toString(36).slice(2, 8)),
      }));
    };
    // Hook the open event for join-request
    if (this.dc) this.dc.addEventListener('open', sendJoin, { once: true });
    return {
      room: offerBlob.room,
      answer: {
        sdp: (this.pc.localDescription && this.pc.localDescription.sdp) || 'fake-answer-sdp',
        type: (this.pc.localDescription && this.pc.localDescription.type) || 'answer',
      },
    };
  }

  _handleMessage(ev) {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'state') {
        this.onState(msg);
      } else if (msg.type === 'event') {
        this._seq = msg.seq;
        this.onEvent(msg);
      } else if (msg.type === 'match-end') {
        this.onEvent({ event: { type: 'match-end', winner: msg.winner, scores: msg.scores } });
      }
    } catch (e) {
      this.onLog('peer bad message: ' + e.message);
    }
  }

  // Send a player action (dart turn, end-leg, etc.) to the host.
  sendEvent(event) {
    if (!this.dc || this.dc.readyState !== 'open') return;
    this.dc.send(JSON.stringify({ type: 'event', seq: ++this._seq, event }));
  }

  close() {
    try { this.dc && this.dc.close(); } catch {}
    try { this.pc && this.pc.close(); } catch {}
  }
}
