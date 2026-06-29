// Integration test for the tournament WebRTC layer.
// We can't actually establish a real WebRTC connection in Node
// (no RTCPeerConnection global), so we test the message-routing
// logic by stubbing out the RTCPeerConnection. The actual wire
// protocol is exercised by Playwright in the live browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TournamentHost, TournamentPeer } from '../js/net/tournament.js';

// ----- stubs -----
class FakeDataChannel {
  constructor() {
    this.readyState = 'open';
    this.sent = [];
    this.onmessage = null;
    this._listeners = { open: [] };
  }
  send(data) { this.sent.push(data); }
  close() { this.readyState = 'closed'; }
  addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); }
  removeEventListener() {}
  _fire(type, ev) { for (const fn of this._listeners[type] || []) fn(ev); }
}

class FakePeerConnection {
  constructor() {
    this._iceGatheringState = 'complete';
    this.dc = null;
    this.ondatachannel = null;
  }
  get iceGatheringState() { return this._iceGatheringState; }
  createDataChannel() {
    this.dc = new FakeDataChannel();
    return this.dc;
  }
  createOffer() { return Promise.resolve({ sdp: 'fake-offer', type: 'offer' }); }
  createAnswer() { return Promise.resolve({ sdp: 'fake-answer', type: 'answer' }); }
  setLocalDescription() { return Promise.resolve(); }
  setRemoteDescription() { return Promise.resolve(); }
  close() {}
  addEventListener() {}
  removeEventListener() {}
}

// Patch in our fake once on module load. The browser's real
// RTCPeerConnection is never set in Node.
if (!globalThis.RTCPeerConnection) globalThis.RTCPeerConnection = FakePeerConnection;

// Helper: pair a host peer with a tournament peer, returning the
// channels for inspection. Wires a bidirectional relay so messages
// from either side reach the other.
function pair(host, peer) {
  const hostDc = [...host.peers.values()].slice(-1)[0].dc;
  // Synthesize the ondatachannel event so the peer has a reference.
  peer.pc.ondatachannel({ channel: hostDc });
  // host → peer: replace hostDc.send
  const origHostSend = hostDc.send.bind(hostDc);
  hostDc.send = (data) => { origHostSend(data); peer._handleMessage({ data }); };
  // peer → host: replace peer.dc.send
  const origPeerSend = peer.dc.send.bind(peer.dc);
  peer.dc.send = (data) => { origPeerSend(data); host._handlePeerMessage([...host.peers.keys()].slice(-1)[0], { data }); };
  return hostDc;
}

// ----- tests -----

test('TournamentHost generates a 6-character room code', () => {
  const h = new TournamentHost();
  assert.equal(h.roomCode.length, 6);
  assert.match(h.roomCode, /^[A-HJ-NP-Z2-9]+$/);
});

test('host can send state to a connected peer', async () => {
  const h = new TournamentHost();
  const p = new TournamentPeer();
  const offerPromise = h.createOffer();
  const offerBlob = { sdp: 'fake', type: 'offer', room: h.roomCode };
  const answer = await p.join(offerBlob, { name: 'Alice' });
  const { peerId } = await offerPromise;
  // Manually trigger the "answer accepted" step.
  await h.acceptAnswer(peerId, answer.answer);
  const hostDc = pair(h, p);
  // Now host sends state.
  const received = [];
  p.onState = (msg) => received.push(msg);
  h.sendStateTo(peerId, { type: '01', players: [] }, { id: 1 });
  assert.equal(received.length, 1);
  assert.equal(received[0].type, 'state');
  assert.equal(received[0].match.id, 1);
});

test('peer sendEvent is routed to host onEvent', async () => {
  const h = new TournamentHost();
  const p = new TournamentPeer();
  const hostEvents = [];
  h.onEvent = (peerId, msg) => hostEvents.push({ peerId, msg });
  const offerPromise = h.createOffer();
  const offerBlob = { sdp: 'fake', type: 'offer', room: h.roomCode };
  const answer = await p.join(offerBlob, { name: 'Bob' });
  const { peerId } = await offerPromise;
  await h.acceptAnswer(peerId, answer.answer);
  const hostDc = pair(h, p);
  // Peer sends a turn event.
  p.sendEvent({ type: 'turn', total: 60, darts: 3 });
  assert.equal(hostEvents.length, 1);
  assert.equal(hostEvents[0].msg.event.total, 60);
  assert.equal(hostEvents[0].peerId, peerId);
});

test('host broadcast reaches all peers', async () => {
  const h = new TournamentHost();
  const pairs = [];
  for (let i = 0; i < 2; i++) {
    const p = new TournamentPeer();
    const offerPromise = h.createOffer();
    const offerBlob = { sdp: 'fake', type: 'offer', room: h.roomCode };
    const answer = await p.join(offerBlob, { name: `P${i}` });
    const { peerId } = await offerPromise;
    await h.acceptAnswer(peerId, answer.answer);
    const received = [];
    p.onEvent = (msg) => received.push(msg);
    pair(h, p);
    pairs.push({ p, peerId, received });
  }
  h.broadcastEvent(1, { type: 'turn', total: 100 });
  assert.equal(pairs[0].received.length, 1);
  assert.equal(pairs[1].received.length, 1);
  assert.equal(pairs[0].received[0].seq, 1);
  assert.equal(pairs[1].received[0].seq, 1);
});
