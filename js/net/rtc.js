// =================================================================
// Serverless WebRTC room. The HOST creates a peer connection and
// generates an offer; the offer + room id are encoded into a QR
// code. The GUEST scans the QR and returns an answer via a second
// QR (or copy/paste). Once the data channel opens, game state is
// synced over a single reliable ordered channel. No backend needed.
// =================================================================

const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export class HostRoom {
  constructor({ onState, onPeerJoin, onPeerLeave, onLog }) {
    this.role = 'host';
    this.onState = onState || (() => {});
    this.onPeerJoin = onPeerJoin || (() => {});
    this.onPeerLeave = onPeerLeave || (() => {});
    this.onLog = onLog || (() => {});
    this.pc = null;
    this.dc = null;
    this.roomId = makeRoomId();
    this._stateVersion = 0;
  }

  async create() {
    this.pc = new RTCPeerConnection(ICE);
    this.pc.oniceconnectionstatechange = () => this.onLog('host ICE: ' + this.pc.iceConnectionState);

    this.dc = this.pc.createDataChannel('game', { ordered: true });
    this._wireDC(this.dc);

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await waitForIceComplete(this.pc);

    const offerBlob = {
      sdp: this.pc.localDescription.sdp,
      type: this.pc.localDescription.type,
      room: this.roomId,
    };
    return { roomId: this.roomId, offer: offerBlob };
  }

  async acceptAnswer(answerBlob) {
    if (!this.pc) throw new Error('No active peer connection');
    await this.pc.setRemoteDescription(answerBlob);
  }

  _wireDC(dc) {
    dc.onopen = () => { this.onLog('data channel open'); this.onPeerJoin(); this._sendHello(); };
    dc.onclose = () => { this.onLog('data channel closed'); this.onPeerLeave(); };
    dc.onerror = (e) => this.onLog('dc error: ' + (e?.message || e));
  }

  _sendHello() {
    if (!this.dc || this.dc.readyState !== 'open') return;
    this.dc.send(JSON.stringify({ type: 'hello', from: 'host', version: this._stateVersion }));
  }

  sendState(state) {
    if (!this.dc || this.dc.readyState !== 'open') return;
    this._stateVersion += 1;
    this.dc.send(JSON.stringify({
      type: 'state',
      version: this._stateVersion,
      state: stripRawForNet(state),
    }));
  }
}

export class GuestRoom {
  constructor({ onState, onLog }) {
    this.role = 'guest';
    this.onState = onState || (() => {});
    this.onLog = onLog || (() => {});
    this.pc = null;
    this.dc = null;
  }

  async join(offerBlob) {
    this.pc = new RTCPeerConnection(ICE);
    this.pc.oniceconnectionstatechange = () => this.onLog('guest ICE: ' + this.pc.iceConnectionState);
    this.pc.ondatachannel = (ev) => {
      this.dc = ev.channel;
      this.dc.onmessage = (m) => this._handleMessage(m);
      this.dc.onclose = () => this.onLog('dc closed');
    };
    await this.pc.setRemoteDescription(offerBlob);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await waitForIceComplete(this.pc);

    return {
      room: offerBlob.room,
      answer: {
        sdp: this.pc.localDescription.sdp,
        type: this.pc.localDescription.type,
      },
    };
  }

  _handleMessage(ev) {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'state') this.onState(msg.state);
      else if (msg.type === 'hello') this.onLog('hello from host');
    } catch (e) {
      this.onLog('bad message: ' + e.message);
    }
  }

  close() { try { this.pc && this.pc.close(); } catch {} }
}

/* ----- helpers ----- */
function makeRoomId() {
  const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const buf = new Uint8Array(5);
  crypto.getRandomValues(buf);
  let s = '';
  for (let i = 0; i < 5; i++) s += a[buf[i] % a.length];
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
    setTimeout(resolve, 4000); // safety timeout
  });
}

// Trim network payload — raw dart history is huge. Keep last 30 per player.
function stripRawForNet(state) {
  if (!state || !state.players) return state;
  const copy = { ...state };
  copy.players = state.players.map(p => {
    const hist = (p.history || []).slice(-30);
    return { ...p, history: hist };
  });
  if (copy.rawDarts) copy.rawDarts = copy.rawDarts.slice(-30);
  return copy;
}
