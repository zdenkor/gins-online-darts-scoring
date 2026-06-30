// =================================================================
// New screens: login, competitions list, tournament bracket, league,
// admin panel, settings.
// =================================================================

import { el, toast, showModal, buttonRow, capButtonRow, toggleRow, x01GameOptionsControls } from '../util/helpers.js';
import * as auth from '../auth/auth.js';
import * as googleAuth from '../auth/google.js';
import * as driveSync from '../auth/sync.js';
import { put, getAll, get, del } from '../db/index.js';
import {
  savePlayer, searchPlayers, findByRegNumber, matchLine, parseLine,
  formatPlayerName, listClubs, filterByClub,
  nextRegNumberForClub, shorthandForClubName,
} from '../db/players.js';
import * as comp from '../competition/engine.js';
import { submitTurnTotal01, submitTurnTotalShanghai, submitTurnCricketMarks, X01_IN_OPTIONS, X01_OUT_OPTIONS } from '../game/engine.js';
import { TournamentHost, TournamentPeer } from '../net/tournament.js';
import { handleGoogleSignIn } from './screens.js';
import { lookupPlayerOnSVK, manualSearchUrl, SVK_PORTAL_BASE, searchSVKCache } from '../auth/svk.js';
import { helpIcon, isHelpEnabled, applyHelpIconsVisibility, saveUiHelpSettings, pushUiHelpSettingsToDrive, labelWithHelp } from './help.js';

// QR rendering uses the QRious global loaded from lib/qrious.min.js
// (vendored in index.html). The function returns a <canvas>.
function renderQRCode(value, size = 220) {
  const canvas = document.createElement('canvas');
  // eslint-disable-next-line no-undef
  new QRious({ element: canvas, value, size, background: '#fff', foreground: '#0b0f17' });
  return canvas;
}

const { isSignedIn, signIn, currentUser } = googleAuth;

/* ---------- Login ---------- */
export function renderLogin(router) {
  const screen = el('section', { class: 'screen active' });
  const wrap = el('div', { class: 'login-wrap' });
  wrap.appendChild(el('h2', {}, "Gin's Dart's"));
  wrap.appendChild(el('p', {}, 'Sign in or create an account to track your stats, join competitions, and play online.'));

  const tabs = el('div', { class: 'login-tabs' });
  const tabLogin = el('button', { class: 'active' }, 'Sign in');
  const tabRegister = el('button', {}, 'Register');
  tabs.appendChild(tabLogin); tabs.appendChild(tabRegister);

  const formHost = el('div');
  wrap.appendChild(tabs);
  wrap.appendChild(formHost);

  function showLogin() {
    tabLogin.classList.add('active'); tabRegister.classList.remove('active');
    formHost.innerHTML = '';
    const u = field('Username', 'text'); const p = field('Password', 'password');
    const btn = el('button', { class: 'btn primary big block' }, 'Sign in');
    btn.addEventListener('click', async () => {
      try {
        const user = await auth.login({ username: u.input.value, password: p.input.value });
        toast(`Welcome, ${user.displayName}`);
        router.user = user;
        router.go('menu');
      } catch (e) { toast(e.message); }
    });
    formHost.appendChild(u.wrap); formHost.appendChild(p.wrap);
    formHost.appendChild(btn);
    formHost.appendChild(el('div', { class: 'login-foot' },
      'First time? ', el('a', { href: '#', onclick: e => { e.preventDefault(); showRegister(); } }, 'Create an account'),
      ' · Default admin: ', el('strong', {}, 'admin / admin')));
  }
  function showRegister() {
    tabRegister.classList.add('active'); tabLogin.classList.remove('active');
    formHost.innerHTML = '';
    const u = field('Username', 'text'); const dn = field('Display name', 'text');
    const p = field('Password', 'password');
    const btn = el('button', { class: 'btn primary big block' }, 'Create account');
    btn.addEventListener('click', async () => {
      try {
        const user = await auth.register({ username: u.input.value, displayName: dn.input.value, password: p.input.value, role: 'user' });
        toast('Account created — you are now signed in');
        router.user = user;
        router.go('menu');
      } catch (e) { toast(e.message); }
    });
    formHost.appendChild(u.wrap); formHost.appendChild(dn.wrap); formHost.appendChild(p.wrap);
    formHost.appendChild(btn);
  }
  tabLogin.addEventListener('click', showLogin);
  tabRegister.addEventListener('click', showRegister);
  showLogin();

  screen.appendChild(wrap);
  return screen;
}

/* ---------- Competitions list ---------- */
export async function renderCompetitions(router) {
  const screen = el('section', { class: 'screen active' });
  screen.appendChild(el('h2', {}, 'Competitions'));
  screen.appendChild(el('p', { class: 'muted' }, 'Tournaments, leagues, and quick single matches.'));

  // Header row: signed-in user info, or sign-in hint.
    const authRow = el('div', { class: 'comp-auth-row' });
    const signedIn = await isSignedIn();
    if (signedIn) {
      const u = currentUser();
      authRow.appendChild(el('div', { class: 'comp-user-badge' },
        u.picture ? el('img', { src: u.picture, alt: '', class: 'comp-user-avatar' }) : null,
        // Show email so the user can verify which account they're using.
        el('span', {}, u.email),
      ));
      // Sign out lives in the header (top-right). Don't duplicate it here.
    } else {
      authRow.appendChild(el('div', { class: 'muted small' },
        'Competitions sync to Google Drive. Sign in to create or sync competitions.'
      ));
    }
    screen.appendChild(authRow);

  const newBtn = el('div', { class: 'btn-row three' },
      el('button', { class: 'btn primary', onclick: async (ev) => {
        // Gate: must be signed in with Google to create a competition.
        if (!(await isSignedIn())) {
          showModal({
            title: 'Sign in with Google',
            body: 'Competitions sync to Google Drive so you can play across devices. Sign in to continue.',
            actions: [
              { label: 'Sign in', primary: true, onclick: async () => {
                  const btn = ev.target;
                  const orig = btn.textContent;
                  btn.disabled = true;
                  btn.textContent = 'Opening Google…';
                  const ok = await handleGoogleSignIn(router, 'comp-new');
                  if (!ok) {
                    btn.disabled = false;
                    btn.textContent = orig;
                  }
                  // On success, handleGoogleSignIn navigates away.
              } },
              { label: 'Cancel' },
            ],
          });
          return;
        }
        router.go('comp-new', { kind: 'any' });
      } }, '+ New competition'),
    );
    screen.appendChild(newBtn);

  const list = el('div', { id: 'comp-list' });
  screen.appendChild(el('div', { style: 'height:14px' }));
  screen.appendChild(list);

  const back = el('button', { class: 'btn ghost', onclick: () => router.go('menu') }, '← Back');
  screen.appendChild(el('div', { style: 'height:10px' }));
  screen.appendChild(back);

  (async () => {
    const all = await getAll('competitions');
    list.innerHTML = '';
    if (all.length === 0) {
      list.appendChild(el('div', { class: 'empty-state' }, 'No competitions yet. Create one above.'));
      return;
    }
    all.sort((a, b) => b.createdAt - a.createdAt);
    for (const c of all) {
      const matches = (await getAll('matches')).filter(m => m.competitionId === c.id);
      const total = matches.length;
      const done = matches.filter(m => m.status === 'complete').length;
      const winnerName = c.winner ? await userName(c.winner) : null;

      const card = el('div', { class: 'card', style: 'cursor:pointer' });
      card.appendChild(el('h3', {}, c.name || '(untitled)'));
      const meta = el('div', { class: 'small muted' });
      const submeta = [];
      if (c.type) submeta.push(cap(c.type));
      if (c.participantFormat) submeta.push(cap(c.participantFormat));
      if (c.season != null && c.season !== '') submeta.push(String(c.season));
      if (c.round) submeta.push(`Round ${c.round}`);
      submeta.push(`${c.playerCount} players`);
      submeta.push(`${done}/${total} matches`);
      if (c.eliminationFormat || c.format) submeta.push(c.eliminationFormat || c.format);
      meta.append(submeta.join(' · '));
            meta.append(' · ');
            meta.appendChild(el('span', { class: 'status-pill ' + (c.status === 'complete' ? 'online' : 'connecting') },
              el('span', { class: 'dot' }), c.status));
            if (winnerName) meta.append(` · 🏆 ${winnerName}`);
            if (c.notes) {
              const noteEl = el('div', { class: 'small', style: 'margin-top:4px' });
              noteEl.textContent = c.notes;
              card.appendChild(noteEl);
            }
      card.appendChild(meta);
      const actions = el('div', { class: 'btn-row three', style: 'margin-top:8px' });
      actions.appendChild(el('button', { class: 'btn', onclick: (e) => { e.stopPropagation(); router.go(c.type === 'league' ? 'league-view' : 'bracket-view', { id: c.id }); } }, 'Open'));
      // Google-signed-in users get full management: Edit, Copy, Delete.
      // Legacy username/password admins only get Delete. Anonymous
      // users get no management actions.
      const signedIn = await isSignedIn();
      const canManage = signedIn || auth.isAdmin(router.user);
      if (canManage) {
        actions.appendChild(el('button', { class: 'btn', onclick: (e) => {
          e.stopPropagation();
          // Pre-fill the new-competition form with this competition's
          // values. Edit only changes the metadata (name, format,
          // game opts). Players and bracket stay as-is.
          router.go('comp-new', { kind: 'any', edit: { id: c.id } });
        } }, 'Edit'));
        actions.appendChild(el('button', { class: 'btn', onclick: async (e) => {
          e.stopPropagation();
          await copyCompetition(c, router);
        } }, 'Copy'));
        actions.appendChild(el('button', { class: 'btn danger', onclick: async (e) => {
          e.stopPropagation();
          if (!confirm(`Delete "${c.name}" and all its matches?`)) return;
          for (const m of matches) await del('matches', m.id);
          await del('competitions', c.id);
          // Best-effort Drive delete. If push fails, we still deleted
          // locally — the next sign-in pull will re-sync from Drive,
          // so the user will see the deleted comp "come back" until
          // they manually clear their local cache. Acceptable for now.
          if (await isSignedIn()) {
            try {
              await driveSync.deleteCompetition(c.id);
              driveSync.clearDirty(`comp:${c.id}`);
              toast('Deleted locally + Drive');
            } catch (err) {
              driveSync.markDirty(`comp:${c.id}`);
              toast('Deleted locally; Drive sync queued');
            }
          } else {
            toast('Deleted');
          }
          renderCompetitions(router); // re-render
        } }, 'Delete'));
      }
      card.appendChild(actions);
      card.addEventListener('click', () => router.go(c.type === 'league' ? 'league-view' : 'bracket-view', { id: c.id }));
      list.appendChild(card);
    }
  })();

  return screen;
}

/* ---------- Player-join modal (host side) ----------
 * Generates an SDP offer for the next peer to join, encodes it as
 * a QR + base64 code, and shows it. When the player returns the
 * SDP answer, the host accepts it and the peer becomes connected.
 * The TournamentHost lives on a module-level singleton so the
 * admin's device can keep accepting new players across screen
 * navigations.
 * ----------------------------------------------- */
let _activeHost = null;       // current TournamentHost (singleton)
let _activeHostCompId = null; // competition the host is for
// Per-peer name → match they're assigned to. Set when the host
// receives their join-request and assigns them to a match.
let _activeHostPeers = new Map(); // peerId -> { name, matchId }

// Helper exposed to the game screen: attach a running game state
// to the active host so events from peers can be replayed.
export function attachGameToTournamentHost(game, peerAssignments) {
  if (!_activeHost) return;
  game._tournamentHost = _activeHost;
  game._tournamentEventSeq = 0;
  // When a peer joins, send them the current game state.
  _activeHost.onJoinRequest = (peerId, msg) => {
    _activeHostPeers.set(peerId, { name: msg.name, matchId: null });
    _activeHost.sendStateTo(peerId, game, { id: game.matchId, competitionId: game.competitionId });
  };
  // When a peer sends an event, apply it to the local engine.
  _activeHost.onEvent = (peerId, msg) => {
    const ev = msg.event;
    if (!ev) return;
    if (ev.type === 'turn' && game.winner == null && game.type === 'x01') {
      const result = submitTurnTotal01(game, ev.total);
      const meta = {
        darts: result.darts,
        isLegWin: !!result.isLegWin,
        isCheckout: !!result.isCheckout,
        bust: !!result.bust,
      };
      if (!game.rawDarts.some(r => r.total === ev.total && r.by === ev.by)) {
        game.rawDarts.push({ total: ev.total, ...meta, by: ev.by });
      }
      afterThrowGame(game, _activeHost);
      // If the engine just set a winner, broadcast match-end.
      if (game.winner != null) {
        _activeHost.broadcastEvent(
          (game._tournamentEventSeq = (game._tournamentEventSeq || 0) + 1),
          { type: 'match-end', winner: game.winner, by: game.players[game.winner]?.name }
        );
      }
    } else if (ev.type === 'cricket-turn' && game.winner == null && game.type === 'cricket') {
      const result = submitTurnCricketMarks(game, ev.segments);
      if (!game.rawDarts.some(r => Array.isArray(r.segments) && JSON.stringify(r.segments) === JSON.stringify(ev.segments) && r.by === ev.by)) {
        game.rawDarts.push({ segments: ev.segments, darts: result.darts, isLegWin: !!result.isLegWin, by: ev.by });
      }
      afterThrowGame(game, _activeHost);
      if (game.winner != null) {
        _activeHost.broadcastEvent(
          (game._tournamentEventSeq = (game._tournamentEventSeq || 0) + 1),
          { type: 'match-end', winner: game.winner, by: game.players[game.winner]?.name }
        );
      }
    }
  };
}

// Internal: re-render the game (find the game screen in DOM and
// re-render it). This is the only way to make the engine state
// visible after a peer-driven mutation.
function afterThrowGame(game, host) {
  // Re-render the active game screen by triggering the router to
  // reload. Find the game screen and force a re-render via a
  // custom event. For v0.0.0.9 we just dispatch a global event
  // that the renderGame function listens for.
  window.dispatchEvent(new CustomEvent('gindarts:game-state-changed', { detail: { game } }));
  // Also broadcast the new full state to all peers, so the
  // player-side game view re-renders too.
  host.broadcast({
    type: 'state',
    version: ++host._stateVersion,
    state: game,
  });
}

async function openTournamentJoinModal(c, router) {
  // Reuse the existing host if it's for the same competition.
  if (!_activeHost || _activeHostCompId !== c.id) {
    if (_activeHost) _activeHost.close();
    _activeHost = new TournamentHost({
      onLog: (m) => console.log('[tournament-host]', m),
    });
    _activeHostCompId = c.id;
    // Wire the host's onEvent to push events into the engine.
    // For v0.0.0.8 the engine wiring is deferred — the host just
    // tracks who is connected. The actual match state will sync
    // when the player joins a match.
  }

  const offer = await _activeHost.createOffer();
  const offerStr = JSON.stringify(offer.offer);
  const offerCode = btoa(unescape(encodeURIComponent(offerStr)));

  const body = el('div', { class: 'join-modal' });
  body.appendChild(el('p', { class: 'muted' },
    'Players on their phones: open "Join tournament" on the menu, then scan this code or paste it.'));
  const codeBox = el('div', { class: 'copy', style: 'font-size: 24px; letter-spacing: 4px; font-family: ui-monospace, monospace; text-align: center; padding: 12px; background: var(--bg-2); border-radius: 8px; margin: 8px 0;' },
    _activeHost.roomCode);
  body.appendChild(codeBox);
  body.appendChild(el('p', { class: 'small muted', style: 'text-align:center;' }, 'Room code — for those who can\'t scan.'));
  const qrContainer = el('div', { style: 'text-align: center; margin: 12px 0;' });
  qrContainer.appendChild(renderQRCode(offerCode, 220));
  body.appendChild(qrContainer);
  body.appendChild(el('p', { class: 'small muted' }, 'When the player returns their code, paste it below:'));
  const ansTa = el('textarea', { placeholder: 'Paste answer code from player here', style: 'width:100%; height:100px; background:var(--bg-2); border:1px solid var(--line); border-radius:8px; padding:8px; color:var(--text); font-family:ui-monospace,monospace;' });
  body.appendChild(ansTa);
  const acceptBtn = el('button', { class: 'btn primary block', style: 'margin-top:8px;',
    onclick: async () => {
      try {
        const answerStr = decodeURIComponent(escape(atob(ansTa.value.trim())));
        const answer = JSON.parse(answerStr);
        await _activeHost.acceptAnswer(offer.peerId, answer);
        toast('Player connected');
        // Update modal to show success.
        body.innerHTML = '';
        body.appendChild(el('p', { class: 'muted' },
          'Player connected. Open another "Player join" to let the next person in.'));
        // Re-render the bracket/league view so the new peer shows.
        if (router) router.refresh?.();
      } catch (e) {
        toast('Bad answer: ' + e.message);
      }
    }}, 'Accept answer');
  body.appendChild(acceptBtn);
  body.appendChild(el('p', { class: 'small muted', style: 'margin-top:12px;' },
    'Tip: only one player can join at a time. After they connect, click "Player join" again for the next one.'));

  showModal({
    title: `📱 Player join — ${c.name}`,
    body,
    actions: [
      { label: 'Close', class: 'btn ghost', onclick: () => {} },
    ],
  });
}

/* ---------- New / Edit competition form ---------- */
export async function renderCompNew(router, { kind, edit }) {
  const screen = el('section', { class: 'screen active' });
  const isEdit = !!edit;
  screen.appendChild(el('h2', {}, isEdit ? 'Edit competition' : 'New competition'));
  screen.appendChild(el('p', { class: 'muted' },
    isEdit ? 'Update name, format, and game options. Players and bracket stay the same.'
           : 'Choose a format, pick players, and create.'));

  // Player pool — all registered users (admin only can choose; regular user gets self + admin can add)
  (async () => {
    const helpVisible = await isHelpEnabled();
    const users = await auth.listUsers();

    // If editing, load the existing competition to pre-fill state.
    let editing = null;
    if (isEdit) {
      editing = await get('competitions', Number(edit.id));
      if (!editing) {
        screen.appendChild(el('p', { class: 'muted' }, 'Competition not found.'));
        screen.appendChild(el('button', { class: 'btn ghost', onclick: () => router.go('competitions') }, '← Back'));
        return;
      }
    }

    const state = editing ? {
          // Pre-fill from existing competition. Three orthogonal
          // dimensions:
          //   type              — Tournament | League
          //   participantFormat — Singles | Doubles | Teams
          //   eliminationFormat — bracket structure
          name: editing.name || 'My competition',
          type: editing.type === 'league' ? 'league' : 'tournament',
          participantFormat: editing.participantFormat
            || (editing.kind === 'team' ? 'teams'
              : editing.type === 'doubles' ? 'doubles' : 'singles'),
          eliminationFormat: editing.eliminationFormat
            || editing.format
            || (editing.kind === 'league' ? 'round robin' : 'single elimination'),
          season: editing.season || editing.year || new Date().getFullYear(),
          round: editing.round || 1,
          notes: editing.notes || '',
          selected: (editing.playerIds || editing.players || []).slice(),
          gameMode: editing.gameMode || 'x01',
          start: editing.gameOpts?.start || 501,
          in: editing.gameOpts?.in || null,
          out: editing.gameOpts?.out || null,
          cutThroat: editing.gameOpts?.cutThroat ?? false,
          shanghaiN: editing.gameOpts?.shanghaiN || 7,
          legsToWin: editing.legsToWin || 1,
                    setsToWin: editing.setsToWin || 1,
                    maxDartsPerLeg: editing.gameOpts?.maxDartsPerLeg || 0,
          seeding: editing.seeding || 'ordered',
          groups: editing.groups || 1,
          advancePerGroup: editing.advancePerGroup || 2,
          numberOfTeams: editing.numberOfTeams || 2,
        } : {
          name: 'My competition',
          type: 'tournament',
          participantFormat: 'singles',
          eliminationFormat: 'single elimination',
          season: new Date().getFullYear(),
          round: 1,
          notes: '',
          selected: [],
          gameMode: 'x01',
          start: 501,
          in: null,
          out: null,
          cutThroat: false,
          shanghaiN: 7,
          legsToWin: 1,
                    setsToWin: 1,
                    maxDartsPerLeg: 0,
          seeding: 'ordered',
          groups: 1,
          advancePerGroup: 2,
          doubleRoundRobin: false,
          knockoutAfter: true,
          numberOfTeams: 2,
        };

    const form = el('div', { class: 'card' });

        // --- Name first ---
        const nameField = field('Competition name', 'text');
        nameField.input.value = state.name;
        nameField.input.addEventListener('input', e => state.name = e.target.value);
        form.appendChild(el('h3', {}, 'Name'));
        form.appendChild(nameField.wrap);


        // --- Metadata (season, round, notes) — same for all types ---
        const metaWrap = el('div', { style: 'margin-top:12px' });
        metaWrap.appendChild(el('p', { class: 'small muted' },
          'Identify this competition in your history — season, round, notes.'));
        const seasonField = field('Season (e.g. 2026 or "Winter 2026")', 'text');
        seasonField.input.value = state.season;
        seasonField.input.addEventListener('input', e => {
          const v = e.target.value;
          state.season = v ? (parseInt(v, 10) || v) : state.season;
        });
        const roundField = field('Round (e.g. 1, 2, 3…)', 'number');
        roundField.input.value = state.round;
        roundField.input.addEventListener('input', e => state.round = parseInt(e.target.value, 10) || state.round);
        const notesField = field('Notes', 'text');
        notesField.input.value = state.notes;
        notesField.input.addEventListener('input', e => state.notes = e.target.value);
        metaWrap.appendChild(seasonField.wrap);
        metaWrap.appendChild(roundField.wrap);
        metaWrap.appendChild(notesField.wrap);
        form.appendChild(metaWrap);


        // --- Type + Participant Format (moved below notes) ---
        // --- Dimension 1: Type (Tournament | League) ---
        form.appendChild(el('h3', { style: 'margin-top:16px' }, 'Type'));
        const typeWrap = el('div', { class: 'btn-row two', style: 'flex-wrap:wrap' });
            const typeRadios = {};
            ['tournament', 'league'].forEach(k => {
              const lbl = el('label', { class: 'btn ghost kind-option', style: 'flex:1; text-align:center; cursor:pointer; padding:10px' });
              const input = el('input', { type: 'radio', name: 'type', value: k });
              input.checked = state.type === k ? '' : null;
              lbl.appendChild(input);
              lbl.appendChild(document.createTextNode(' ' + ({
                tournament: '🥇 Tournament', league: '🏆 League',
              })[k]));
              lbl.addEventListener('click', () => {
                state.type = k;
                Object.values(typeRadios).forEach(r => r.classList.remove('kind-selected'));
                typeRadios[k].classList.add('kind-selected');
              });
              typeRadios[k] = lbl;
              if (state.type === k) lbl.classList.add('kind-selected');
              typeWrap.appendChild(lbl);
            });
            form.appendChild(typeWrap);

            // --- Dimension 2: Participant Format (Singles | Doubles | Teams) ---
            form.appendChild(el('h3', { style: 'margin-top:16px' }, 'Participant Format'));
            const pfWrap = el('div', { class: 'btn-row three', style: 'flex-wrap:wrap' });
            const pfRadios = {};
            ['singles', 'doubles', 'teams'].forEach(k => {
              const lbl = el('label', { class: 'btn ghost kind-option', style: 'flex:1; text-align:center; cursor:pointer; padding:10px' });
              const input = el('input', { type: 'radio', name: 'participantFormat', value: k });
              input.checked = state.participantFormat === k ? '' : null;
              lbl.appendChild(input);
              lbl.appendChild(document.createTextNode(' ' + ({
                singles: '🎯 Singles', doubles: '👯 Doubles', teams: '👥 Teams',
              })[k]));
              lbl.addEventListener('click', () => {
                state.participantFormat = k;
                Object.values(pfRadios).forEach(r => r.classList.remove('kind-selected'));
                pfRadios[k].classList.add('kind-selected');
              });
              pfRadios[k] = lbl;
              if (state.participantFormat === k) lbl.classList.add('kind-selected');
              pfWrap.appendChild(lbl);
            });
            form.appendChild(pfWrap);

        // --- Name field (already added at top) ---

    // --- Format selector (already added above; OLD selector removed) ---
    // Explanations shown when a format is picked. Each entry has a short
    // description, a player-count note, and a winner-determination rule.
    const FORMAT_INFO = {
      'single elimination': {
        desc: 'Players are seeded into a bracket. Each match eliminates the loser; the winner advances. The last player standing wins the competition.',
        players: 'Any number from 2 up. Non-power-of-2 counts are handled with byes (top seeds skip round 1).',
        winner: 'The player who wins the final match.',
      },
      'double elimination': {
        desc: 'Like single elimination, but every player gets a second chance. A player is eliminated only after losing two matches — once in the winners bracket, once in the losers bracket.',
        players: 'Best with 4 or more players. Byes handled the same way as single elimination.',
        winner: 'The winner of the Grand Final between the winners-bracket champion and the losers-bracket champion.',
      },
      'round robin': {
        desc: 'Every player plays every other player exactly once. The player with the most wins (or best point tiebreaker) wins the competition.',
        players: 'Best with 4 to 8 players. Larger groups can be split into multiple sub-groups (round-robin groups).',
        winner: 'Most match wins; ties broken by leg differential, then points scored.',
      },
      'round robin knockout': {
        desc: 'A round-robin group stage determines who advances, then the top finishers play a single-elimination knockout bracket to decide the winner.',
        players: '4 to 16 players. Each group needs at least 3 players for the round robin to mean anything.',
        winner: 'The player who wins the knockout bracket final.',
      },
      'double round robin': {
        desc: 'A round robin played twice. Each pair of players meets once on each "side" (home and away). Used in longer leagues to reduce the impact of any single unlucky match.',
        players: '4 to 8 players works best; each extra player doubles the total matches.',
        winner: 'Most wins across all double round-robin matches; same tiebreakers as round robin.',
      },
      'single game': {
        desc: 'A single match between the players you pick. If you pick 3 or more players, it automatically becomes a mini round-robin (everyone plays everyone once) so no one sits out.',
        players: '2 players = one match. 3+ players = round-robin (every player plays every other player once).',
        winner: 'The player with the most match wins; if 2 players, whoever wins the one match.',
      },
      'team game': {
        desc: 'Players are auto-balanced into the chosen number of teams. Each pair of teams plays a round-robin of single matches. Team score = sum of legs won by its members.',
        players: 'Needs at least 2 teams and at least 2 players per team. 4 players in 2 teams is the simplest setup.',
        winner: 'The team whose members win the most matches overall across all cross-team pairings.',
      },
    };
    // --- Dimension 3: Elimination Format (touch-button row) ---
    const ELIM_FORMATS = [
      { value: 'single elimination',   label: 'Single elim' },
      { value: 'double elimination',   label: 'Double elim' },
      { value: 'round robin',          label: 'Round robin' },
      { value: 'double round robin',   label: 'Double RR' },
      { value: 'round robin knockout', label: 'RR → KO' },
    ];
    const elimRow = buttonRow('Format', ELIM_FORMATS,
      v => {
        state.eliminationFormat = v;
        formatOpts.innerHTML = '';
        updateFormatHelp();
        buildFormatOpts();
      },
      state.eliminationFormat);

    // Format info display (uses existing FORMAT_INFO from above)
    const formatOpts = el('div');

    function buildFormatOpts() {
      formatOpts.innerHTML = '';
      if (state.eliminationFormat === 'single elimination' || state.eliminationFormat === 'double elimination') {
              const seed = buttonRow('Seeding',
                [{ value: 'ordered', label: 'Ordered' }, { value: 'random', label: 'Random' }],
                v => state.seeding = v, state.seeding);
              formatOpts.appendChild(seed.wrap);
            } else if (state.eliminationFormat === 'round robin' || state.eliminationFormat === 'double round robin') {
              const grp = buttonRow('Number of groups', ['1', '2', '4'],
                v => state.groups = +v, String(state.groups || 1));
              const adv = buttonRow('Players advancing per group', ['1', '2', '3', '4'],
                v => state.advancePerGroup = +v, String(state.advancePerGroup || 2));
              formatOpts.append(grp.wrap, adv.wrap);
              if (state.eliminationFormat === 'double round robin') {
                const note = el('p', { class: 'muted', style: 'font-size:12px;margin:0 0 6px' }, 'Each player plays every other player twice (home and away).');
                formatOpts.appendChild(note);
              }
            } else if (state.eliminationFormat === 'round robin knockout') {
              const grp = buttonRow('Number of groups (round robin)', ['1', '2', '4'],
                v => state.groups = +v, String(state.groups || 1));
              const adv = buttonRow('Players advancing per group', ['1', '2', '3', '4'],
                v => state.advancePerGroup = +v, String(state.advancePerGroup || 2));
              formatOpts.append(grp.wrap, adv.wrap);
              const note = el('p', { class: 'muted', style: 'font-size:12px;margin:6px 0 0' }, 'Top finishers per group advance to a single-elimination knockout bracket.');
              formatOpts.appendChild(note);
            } else if (state.eliminationFormat === 'team game') {
              const tm = buttonRow('Number of teams', ['2', '3', '4'],
                v => state.numberOfTeams = +v, String(state.numberOfTeams || 2));
        const note = el('p', { class: 'muted', style: 'font-size:12px;margin:6px 0 0' }, 'Players are auto-balanced into the selected number of teams; each pair of teams plays a round-robin of single matches.');
        formatOpts.append(tm.wrap, note);
      } else if (state.eliminationFormat === 'single game') {
        const note = el('p', { class: 'muted', style: 'font-size:12px;margin:6px 0 0' }, 'Just one match between the picked players (round-robin if 3+ are picked).');
        formatOpts.appendChild(note);
      }
    }
    buildFormatOpts();

    const GAME_INFO = {
      'x01': {
        desc: 'Players start at the chosen score (commonly 501) and try to reach exactly zero. The entered total for each turn is subtracted from the player\'s score.',
        rules: 'Double-out means the final dart must be a double to win; otherwise the player busts on that turn and the score stays the same. Players throw in the order they were entered in setup.',
      },
      'cricket': {
        desc: 'Players take turns throwing at numbers 15 through 20 and the bull. Three marks of any ring close a target; extra marks on a closed target score points (25 for bull) until opponents close it too.',
        rules: 'First player to close all seven targets and lead (or tie with all-closed opponents) wins. Cut-throat reverses the scoring — points go to opponents instead of the thrower.',
      },
      'shanghai': {
        desc: 'Each round targets one number, in order (1, 2, 3, ...). Hit the current number with any single, double, or triple to score that many points; misses score 0.',
        rules: 'Game ends after the configured number of rounds. Highest total score wins. Doubles and triples on the current target count as 2× and 3× the value.',
      },
    };

    form.appendChild(el('h3', { style: 'margin-top:8px; display:flex; align-items:center; gap:8px;' },
      'Game settings',
      helpIcon('About this game', (() => {
        const info = GAME_INFO[state.gameMode];
        if (!info) return '';
        const wrap = el('div');
        wrap.appendChild(el('p', { style: 'margin-top:0' }, info.desc));
        wrap.appendChild(el('p', {}, info.rules));
        return wrap;
      })(), helpVisible)));

    const gameSel = buttonRow('Game mode', [
          { value: 'x01', label: 'x01 (301/501/701...)' },
          { value: 'cricket', label: 'Cricket' },
          { value: 'shanghai', label: 'Shanghai' },
        ], v => {
          state.gameMode = v; gameOpts.innerHTML = ''; buildGameOpts();
        }, state.gameMode);
    form.appendChild(gameSel.wrap);

    const gameOpts = el('div'); form.appendChild(gameOpts);
    function buildGameOpts() {
      gameOpts.innerHTML = '';
      if (state.gameMode === 'x01') {
        // Competition allows a wider set of starting scores
        // (includes 121 and 170 for speed variants); the rest of
        // the x01 controls are shared with the single-game
        // setup screen so the two forms stay in sync.
        const startRow = buttonRow(
          labelWithHelp('Starting score', 'Starting score',
            'The score each player begins with. 121 and 170 are speed-darts variants; 501 is the classic start.',
            helpVisible),
          [
            { value: '121', label: '121' },
            { value: '170', label: '170' },
            { value: '301', label: '301' },
            { value: '501', label: '501' },
            { value: '701', label: '701' },
            { value: '901', label: '901' },
          ], v => { state.start = +v; }, String(state.start));
        const x01Rows = x01GameOptionsControls({
          state, helpVisible, X01_IN_OPTIONS, X01_OUT_OPTIONS, labelWithHelp,
        });
        gameOpts.append(
                  startRow.wrap,
                  x01Rows.inRow.wrap, x01Rows.outRow.wrap,
                  x01Rows.sets.wrap,
                  x01Rows.legs.wrap,
                  x01Rows.capRow.wrap,
        );
      } else if (state.gameMode === 'cricket') {
        const cb = checkbox('Cut-throat', state.cutThroat, v => state.cutThroat = v);
        cb.wrap.appendChild(helpIcon('Cut-throat Cricket', 'In cut-throat mode, points you score on a closed number are given to opponents who have not closed it yet. Last player with the lowest score wins.', helpVisible));
        const legs = buttonRow(
          labelWithHelp('Legs to win', 'Legs to win',
            'How many legs a player must win to take the set. Set this to 1 for a single-leg game.',
            helpVisible),
          ['1', '2', '3', '5', '7'], v => state.legsToWin = +v, String(state.legsToWin));
        const cap = capButtonRow({
          label: labelWithHelp('Max darts per leg', 'Max darts per leg',
            'Limit how many darts each player may throw in one leg. 0 means no limit. Useful for speed variants.',
            helpVisible),
          presets: [
                  { value: 20, label: '20' },
                  { value: 30, label: '30' },
                  { value: 45, label: '45' },
                  { value: 50, label: '50' },
                  { value: 100, label: '100' },
                  { value: 'custom', label: 'Custom…' },
                ],
                value: state.maxDartsPerLeg,
                onChange: v => { state.maxDartsPerLeg = v; },
              });
              gameOpts.append(cb.wrap, legs.wrap, cap.wrap);
            } else {
              const f1 = buttonRow(
                labelWithHelp('Rounds', 'Shanghai rounds',
                  'How many numbers are played in order (1, 2, 3…). A "Shanghai" is hitting single, double and triple of the same number in one turn.',
                  helpVisible),
                ['0', '5', '7', '9', '12', '20'], v => state.shanghaiN = +v, String(state.shanghaiN));
              const legs = buttonRow(
                labelWithHelp('Legs to win', 'Legs to win',
                  'How many legs a player must win to take the set. Set this to 1 for a single-leg game.',
                  helpVisible),
                ['1', '2', '3'], v => state.legsToWin = +v, String(state.legsToWin));
              gameOpts.append(f1.wrap, legs.wrap);
            }
    }
    buildGameOpts();

    // --- Elimination Format (shown just before player selection) ---
    const formatHelpBody = el('div');
    function updateFormatHelp() {
      formatHelpBody.innerHTML = '';
      const info = FORMAT_INFO[state.eliminationFormat];
      if (!info) return;
      formatHelpBody.appendChild(el('p', { style: 'margin-top:0' }, info.desc));
      formatHelpBody.appendChild(el('p', { class: 'small muted', style: 'margin:0 0 4px' }, el('strong', {}, 'Players: '), info.players));
      formatHelpBody.appendChild(el('p', { class: 'small muted', style: 'margin:0' }, el('strong', {}, 'How the winner is decided: '), info.winner));
    }
    updateFormatHelp();

    form.appendChild(el('h3', { style: 'margin-top:16px; display:flex; align-items:center; gap:8px;' },
      'Elimination Format',
      helpIcon('About this format', formatHelpBody, helpVisible)));
    form.appendChild(elimRow.wrap);
    form.appendChild(formatOpts);

    // Player picker — searches the dedicated `players` store (NOT
        // admin `users`). Admin is not auto-included as a player.
        form.appendChild(el('h3', { style: 'margin-top:8px; display:flex; align-items:center; gap:8px;' },
          'Players',
          helpIcon('Players', 'Pick at least 2. Search by Surname (Slovak convention) or paste a CSV/text list.', helpVisible)));

        const playerList = el('div', { id: 'pick-players' });

        // Selected players summary.
                const selectedSummary = el('div', { class: 'small muted', style: 'margin: 8px 0' });
                function refreshSelectedSummary() {
                  const n = state.selected.length;
                  selectedSummary.textContent = n === 0
                    ? 'No players picked yet.'
                    : n === 1
                      ? '1 player picked — need at least 2.'
                      : `${n} players picked.`;
                }
                refreshSelectedSummary();
                form.appendChild(selectedSummary);

                // Picked participants grid (with red ✕ delete buttons).
                const participantsList = el('div', {
                  id: 'picked-participants',
                  class: 'participants-grid',
                });
                form.appendChild(participantsList);

                async function refreshParticipantsList() {
                  participantsList.innerHTML = '';
                  if (state.selected.length === 0) {
                    participantsList.appendChild(el('p', { class: 'small muted', style: 'margin: 8px 0' },
                      'No participants yet — pick from the search results below, or paste a list.'));
                    return;
                  }
                  const all = await getAll('players');
                  const byId = new Map(all.map(p => [p.id, p]));
                  // Render in selection order so the admin sees their list as
                  // they built it.
                  state.selected.forEach(id => {
                    const p = byId.get(id);
                    if (!p) return;
                    const card = el('div', { class: 'participant-card' });
                    const nameLine = el('div', { class: 'name' }, formatPlayerName(p));
                    const metaLine = el('div', { class: 'small muted' });
                    const parts3 = [];
                    if (p.regNumber) parts3.push(p.regNumber);
                    if (p.club) parts3.push(p.club);
                    if (p.town) parts3.push(p.town);
                    metaLine.textContent = parts3.join(' · ');
                    card.appendChild(nameLine);
                    card.appendChild(metaLine);
                    const x = el('button', {
                      class: 'participant-delete',
                      title: 'Remove from participants',
                      'aria-label': 'Remove participant',
                    }, '✕');
                    x.addEventListener('click', () => {
                      state.selected = state.selected.filter(x => x !== id);
                      refreshSelectedSummary();
                      refreshParticipantsList();
                      // Also un-check the picker row (if visible).
                      rerenderList();
                    });
                    card.appendChild(x);
                    participantsList.appendChild(card);
                  });
                }

        // Search input + results list.
                const searchInput = el('input', {
                  type: 'search', class: 'input', placeholder: 'Surname (then first name...)',
                  'aria-label': 'Search players by surname',
                });
                form.appendChild(searchInput);

                // Home Club filter — list derived from existing players.
                // Default option "All clubs" returns everyone.
                const clubFilterWrap = el('div', { style: 'margin: 6px 0' });
                const clubFilterLabel = el('label', { class: 'small muted', style: 'display:block; margin-bottom:2px' }, 'Filter by home club');
                const clubFilter = el('select', { class: 'input', 'aria-label': 'Filter by home club' });
                clubFilter.appendChild(el('option', { value: '' }, 'All clubs'));
                clubFilterWrap.append(clubFilterLabel, clubFilter);
                form.appendChild(clubFilterWrap);

                async function refreshClubOptions() {
                  const clubs = await listClubs();
                  // Preserve current selection if the club still exists.
                  const prev = clubFilter.value;
                  // Remove all options except the first ("All clubs").
                  while (clubFilter.children.length > 1) clubFilter.removeChild(clubFilter.lastChild);
                  for (const c of clubs) {
                    const label = c.shorthand
                      ? `${c.name} (${c.shorthand}) — ${c.count}`
                      : `${c.name} — ${c.count}`;
                    clubFilter.appendChild(el('option', { value: c.name }, label));
                  }
                  if (prev && clubs.some(c => c.name === prev)) clubFilter.value = prev;
                }
                clubFilter.addEventListener('change', () => rerenderList());
                await refreshClubOptions();

        // "+ Add new" button — opens a modal to create one new player.
        const addNewBtn = el('button', {
          class: 'btn ghost small block', style: 'margin: 6px 0',
        }, '+ Add new player');
        addNewBtn.addEventListener('click', () => openNewPlayerModal({
          initialSurname: searchInput.value,
          onCreated: async (newId) => {
            state.selected.push(newId);
            await rerenderList();
            refreshSelectedSummary();
          },
        }));
        form.appendChild(addNewBtn);

        // "Paste list" button — bulk import from text/CSV.
        const pasteBtn = el('button', {
          class: 'btn ghost small block', style: 'margin: 0 0 10px',
        }, '📋 Paste list of players');
        pasteBtn.addEventListener('click', () => openBulkImportModal({
          onImported: async (newIds) => {
            for (const id of newIds) if (!state.selected.includes(id)) state.selected.push(id);
            await rerenderList();
            refreshSelectedSummary();
          },
        }));
        form.appendChild(pasteBtn);

        async function rerenderList() {
                  playerList.innerHTML = '';
                  const q = searchInput.value.trim().toLowerCase();
                  const selectedClub = clubFilter.value || '';
                  const all = await getAll('players');
                  let matches;
                  if (q) {
                    // Substring filter on surname + firstName + middle + suffix
                    // (case-insensitive). User typing "eme" should match all
                    // surnames containing "eme" — simple and fast.
                    matches = all.filter(p => {
                      const hay = `${p.surname || ''} ${p.firstName || ''} ${p.middleName || ''} ${p.nameSuffixes || ''}`.toLowerCase();
                      return hay.includes(q);
                    });
                  } else {
                    // No search: show recently added.
                    matches = all.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 25);
                  }
                  // Apply club filter after the substring filter.
                  matches = await filterByClub(matches, selectedClub);
                  if (matches.length === 0) {
                    playerList.appendChild(el('p', { class: 'small muted', style: 'margin:8px 0' },
                      q ? `No players match "${q}". Use "+ Add new player" to create one.`
                         : 'No players in the database yet. Use "+ Add new player" to add one.'));
                    return;
                  }
                  matches.forEach(p => {
                    const isPicked = state.selected.includes(p.id);
                    const row = el('label', { class: 'user-row picker-row', style: 'cursor:pointer' });
                    const cb = el('input', { type: 'checkbox', checked: isPicked ? '' : null });
                    cb.addEventListener('change', () => {
                      if (cb.checked) {
                        if (!state.selected.includes(p.id)) state.selected.push(p.id);
                      } else {
                        state.selected = state.selected.filter(x => x !== p.id);
                      }
                      refreshSelectedSummary();
                      refreshParticipantsList();
                    });
                    row.appendChild(cb);
                    const meta = el('div', { class: 'small muted' });
                    const parts2 = [];
                    if (p.regNumber) parts2.push(p.regNumber);
                    if (p.club) parts2.push(p.club);
                    if (p.town) parts2.push(p.town);
                    meta.textContent = parts2.join(' · ');
                    const nameRow = el('div', {},
                      el('div', { class: 'name' }, formatPlayerName(p)),
                      meta,
                    );
                    row.appendChild(nameRow);
                    playerList.appendChild(row);
                  });
                }
        searchInput.addEventListener('input', () => rerenderList());

                await rerenderList();
                await refreshParticipantsList();
                form.appendChild(playerList);

        // ---- Modal: create a single new player ----
        function openNewPlayerModal({ initialSurname = '', onCreated }) {
          const body = el('div', { class: 'form-grid' });
          const fields = {};
          function add(label, key, placeholder = '') {
            const wrap = el('label', { class: 'field' });
            wrap.appendChild(el('span', { class: 'lbl' }, label));
            const input = el('input', { type: 'text', class: 'input', placeholder });
            wrap.appendChild(input);
            fields[key] = input;
            body.appendChild(wrap);
            return input;
          }
          add('Surname *', 'surname', 'Slovák').value = initialSurname;
          add('First name', 'firstName', 'Ján');
          add('Middle (St./Sr./Jr.)', 'middleName', 'ml.');
          add('Name suffixes (Jr./Sr./III)', 'nameSuffixes', 'Jr.');
          add('Town', 'town', 'Bratislava');
          add('Home club', 'club', 'DC Bratislava');
          add('Registration number', 'regNumber', 'NR#100298');
          add('Issuing authority', 'regAuthority', 'SVK');
          const note = el('p', { class: 'small muted', style: 'margin:6px 0 0' },
            'Registration format: CLUBCODE#NNNNNN (e.g. NR#100298). Used as the unique player ID. ');
          const portal = el('a', {
            href: 'https://portal.slovaksteeldarts.sk/licencie',
            target: '_blank', rel: 'noopener',
            style: 'color: var(--accent)',
          }, 'Look up SVK licenses →');
          note.appendChild(portal);
          body.appendChild(note);

          showModal({
            title: 'New player',
            body,
            actions: [
              { label: 'Create', primary: true, onclick: async () => {
                  try {
                    const id = await savePlayer({
                      surname: fields.surname.value,
                      firstName: fields.firstName.value,
                      middleName: fields.middleName.value,
                      nameSuffixes: fields.nameSuffixes.value,
                      town: fields.town.value,
                      club: fields.club.value,
                      regNumber: fields.regNumber.value || null,
                      regAuthority: fields.regAuthority.value,
                    });
                    toast('Player added');
                    onCreated && onCreated(id);
                  } catch (e) {
                    toast(e.message || 'Failed to save player', { kind: 'error' });
                    throw e; // prevent modal close so user can fix
                  }
              } },
              { label: 'Cancel' },
            ],
            keepOpen: true,
          });
        }

        // ---- Modal: bulk import from pasted text/CSV ----
        function openBulkImportModal({ onImported }) {
                  // Helper: search the SVK portal for the unmatched line's
                  // surname + firstName. If results come back, show them in
                  // a chooser modal. If CORS blocks the fetch, show the
                  // manual-search URL and let the admin open the portal.
                  async function searchSVKFor(u, svkBtn, createBtn, importedIds, summary) {
                              const fullName = `${u.parsed.surname || ''} ${u.parsed.firstName || ''}`.trim();
                              if (!fullName) {
                                toast('Need a name to search SVK.', { kind: 'warn' });
                                return;
                              }
                              svkBtn.disabled = true;
                              const origLabel = svkBtn.textContent;
                              svkBtn.textContent = '⏳ Searching…';
                              try {
                                // Try online first via CORS proxy chain. If that
                                // works, we get fresh data. Otherwise fall back to
                                // the local cache (no CORS, instant).
                                const online = await lookupPlayerOnSVK(fullName);
                                let rows = [];
                                if (online.ok) {
                                  rows = online.rows;
                                  toast(`Found ${rows.length} from SVK portal`, { kind: 'success' });
                                } else {
                                  // Fall back to local cache
                                  const [surname, ...rest] = fullName.split(/\s+/);
                                  const firstName = rest.join(' ');
                                  rows = await searchSVKCache({ surname, firstName });
                                  if (rows.length === 0) {
                                    toast('SVK portal unreachable and no local cache matches.', { kind: 'warn' });
                                  }
                                }
                                await showSVKPicker(u, rows, createBtn, importedIds, summary);
                                svkBtn.textContent = origLabel;
                                svkBtn.disabled = false;
                              } catch (e) {
                                svkBtn.textContent = origLabel;
                                svkBtn.disabled = false;
                                toast('SVK search failed: ' + (e.message || String(e)), { kind: 'error' });
                              }
                            }

                  // Show a chooser modal with the SVK search results.
                  async function showSVKPicker(u, rows, createBtn, importedIds, summary) {
                    const body = el('div');
                    if (!rows.length) {
                                          body.appendChild(el('p', { class: 'small muted' },
                                            `No SVK cache matches for "${u.parsed.surname} ${u.parsed.firstName}".`));
                                          body.appendChild(el('p', { class: 'small' },
                                            'Tap "No match — create new" below to add the player without an SVK ID, ' +
                                            'or import the SVK list (Settings → Import SVK license list) to populate the cache.'));
                    } else {
                      body.appendChild(el('p', { class: 'small muted' },
                        `Found ${rows.length} SVK match${rows.length === 1 ? '' : 'es'}. Pick one:`));
                      rows.forEach(row => {
                        const btn = el('button', {
                          class: 'btn ghost small block', style: 'margin:4px 0; text-align:left',
                          onclick: async () => {
                            try {
                              const id = await savePlayer({
                                surname: u.parsed.surname || row.name.split(' ').slice(-1)[0] || '',
                                firstName: u.parsed.firstName || row.name.split(' ').slice(0, -1).join(' ') || '',
                                middleName: u.parsed.middleName,
                                town: u.parsed.town || row.town,
                                club: u.parsed.club || row.club,
                                regNumber: row.svkId,
                                regAuthority: 'SVK',
                              });
                              importedIds.add(id);
                              createBtn.disabled = true;
                              createBtn.textContent = `✓ created (${row.svkId})`;
                              summary.textContent = `${summary.textContent} (+1 created as ${row.svkId})`;
                              await refreshClubOptions();
                              // Close the picker modal.
                              document.querySelector('.modal-backdrop')?.remove();
                            } catch (e) {
                              toast(e.message, { kind: 'error' });
                            }
                          },
                        }, `${row.svkId} — ${row.name} (${row.club}, ${row.town})`);
                        body.appendChild(btn);
                      });
                    }
                    showModal({
                      title: 'SVK matches',
                      body,
                      actions: [
                        {
                          label: 'No match — create new',
                          onclick: () => {
                            document.querySelector('.modal-backdrop')?.remove();
                            createBtn.click();
                          },
                        },
                        {
                          label: 'Cancel',
                          onclick: () => document.querySelector('.modal-backdrop')?.remove(),
                        },
                      ],
                    });
                  }

                  // CORS / parse failure: show manual-search link.
                  function showManualSVKSearch(u, url) {
                    const body = el('div');
                    body.appendChild(el('p', { class: 'small' },
                      `Direct SVK lookup was blocked (CORS). Open the portal in a new tab to find "${u.parsed.surname} ${u.parsed.firstName}", then come back and paste the SVK ID into the new-player modal.`));
                    const a = el('a', {
                      href: url, target: '_blank', rel: 'noopener noreferrer',
                      class: 'btn primary small block',
                      style: 'margin:8px 0; text-align:center',
                    }, '🔗 Open SVK portal');
                    body.appendChild(a);
                    body.appendChild(el('p', { class: 'small muted', style: 'margin-top:8px' },
                      `Or use the "+ Add new player" button and paste the SVK ID (format: SVK######) into the registration number field.`));
                    showModal({
                      title: 'SVK lookup unavailable',
                      body,
                      actions: [{ label: 'OK', onclick: () => document.querySelector('.modal-backdrop')?.remove() }],
                    });
                  }

                  const body = el('div');
                  const ta = el('textarea', {
            class: 'input',
            rows: 12,
            placeholder: 'One player per line. Examples:\n'
              + 'Slovák, Ján, ml., Bratislava, DC Bratislava, NR#100298\n'
              + 'Novák Ján NR#100299\n'
              + 'Mrkvičková Jana BA#200145',
            style: 'width:100%; font-family: ui-monospace, monospace; font-size: 14px;',
          });
          body.appendChild(ta);
          const summary = el('div', { class: 'small muted', style: 'margin-top:8px' });
          body.appendChild(summary);
          const resultsDiv = el('div', { style: 'margin-top:8px' });
          body.appendChild(resultsDiv);

          const importedIds = new Set();

          async function reparse() {
            resultsDiv.innerHTML = '';
            summary.textContent = '';
            importedIds.clear();
            const lines = ta.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
            if (!lines.length) {
              summary.textContent = 'Paste some lines above.';
              return;
            }
            const matched = [];
            const unmatched = [];
            const ambiguous = [];
            for (const line of lines) {
              const m = await matchLine(line);
              const item = { line, ...m };
              if (m.exactReg) {
                matched.push({ ...item, kind: 'exact', player: m.exactReg });
                importedIds.add(m.exactReg.id);
              } else if (m.byName.length === 1) {
                matched.push({ ...item, kind: 'name', player: m.byName[0] });
                importedIds.add(m.byName[0].id);
              } else if (m.byName.length > 1) {
                ambiguous.push(item);
              } else {
                unmatched.push(item);
              }
            }
            summary.textContent =
              `${lines.length} line(s) — ${matched.length} matched, `
              + `${ambiguous.length} ambiguous, ${unmatched.length} need new player.`;

            function row(text, kind, item) {
              const r = el('div', { class: 'card', style: 'padding:8px; margin:6px 0' });
              r.appendChild(el('div', { class: 'small', style: 'font-family:ui-monospace,monospace' }, text));
              const status = el('div', { class: 'small muted' });
              if (kind === 'exact') status.textContent = `✓ matched by reg: ${formatPlayerName(item.player)} (${item.player.regNumber})`;
              else if (kind === 'name') status.textContent = `✓ matched by name: ${formatPlayerName(item.player)}`;
              else if (kind === 'ambiguous') status.textContent = `? ambiguous: ${item.byName.length} players match — pick one`;
              else status.textContent = `+ new player needed`;
              r.appendChild(status);
              return r;
            }
            matched.forEach(m => resultsDiv.appendChild(row(m.line, m.kind, m)));
            ambiguous.forEach(a => {
              const r = row(a.line, 'ambiguous', a);
              a.byName.forEach(p => {
                const btn = el('button', {
                  class: 'btn ghost small',
                  style: 'margin: 2px 4px 0 0',
                  onclick: () => {
                    importedIds.add(p.id);
                    btn.disabled = true;
                    btn.textContent = '✓ ' + formatPlayerName(p);
                    summary.textContent = `${summary.textContent} (+1 picked)`;
                  },
                }, formatPlayerName(p) + (p.regNumber ? ' (' + p.regNumber + ')' : ''));
                r.appendChild(btn);
              });
              resultsDiv.appendChild(r);
            });
unmatched.forEach(u => {
              const r = row(u.line, 'new', u);
              // Search SVK online button — fetches the portal's
              // /licencie page with the player's surname+firstName.
              // CORS will likely block this; on failure we show a
              // link so the admin can open the portal manually.
              const svkBtn = el('button', {
                class: 'btn ghost small', style: 'margin-top:4px; margin-right:6px',
                onclick: async () => {
                  await searchSVKFor(u, svkBtn, btn, importedIds, summary);
                },
              }, '🔍 Search SVK');
              const btn = el('button', {
                class: 'btn primary small', style: 'margin-top:4px',
                onclick: async () => {
                  try {
                    // Decide on a registration number for the new
                    // player. Three cases:
                    //   1. Line had a reg# already → use it.
                    //   2. Line had a club name with a known
                    //      shorthand → auto-allocate the next serial.
                    //   3. Neither → ask the user for a shorthand
                    //      before creating.
                    let regNumber = u.parsed.regNumber || '';
                    let regAuthority = u.parsed.regNumber ? 'SVK' : '';
                    if (!regNumber && u.parsed.club) {
                      const sh = await shorthandForClubName(u.parsed.club);
                      if (sh) {
                        regNumber = await nextRegNumberForClub(sh);
                        regAuthority = 'SVK';
                      }
                    }
                    if (!regNumber) {
                      // Prompt for a new home-club shorthand.
                      const shorthand = window.prompt(
                        `No registration number found for "${formatPlayerName({ surname: u.parsed.surname, firstName: u.parsed.firstName })}".

` +
                        `Enter home-club shorthand (e.g. NR, BA, TT):`,
                        u.parsed.club ? u.parsed.club.slice(0, 3).toUpperCase() : ''
                      );
                      if (!shorthand) return; // user cancelled
                      regNumber = await nextRegNumberForClub(shorthand);
                      if (!regNumber) return;
                      regAuthority = 'SVK';
                    }
                    const id = await savePlayer({
                      surname: u.parsed.surname,
                      firstName: u.parsed.firstName,
                      middleName: u.parsed.middleName,
                      town: u.parsed.town,
                      club: u.parsed.club,
                      regNumber,
                      regAuthority,
                    });
                    importedIds.add(id);
                    btn.disabled = true;
                    btn.textContent = `✓ created (${regNumber})`;
                    summary.textContent = `${summary.textContent} (+1 created as ${regNumber})`;
                    // Refresh club options so newly added club shows up.
                    await refreshClubOptions();
                  } catch (e) {
                    toast(e.message, { kind: 'error' });
                  }
                },
              }, `Create ${formatPlayerName({ surname: u.parsed.surname, firstName: u.parsed.firstName })}`);
                            r.appendChild(svkBtn);
                            r.appendChild(btn);
                            resultsDiv.appendChild(r);
                          });
          }
          ta.addEventListener('input', reparse);

          showModal({
            title: 'Paste list of players',
            body,
            actions: [
              { label: `Import ${importedIds.size} player(s)`, primary: true, onclick: () => {
                  onImported && onImported([...importedIds]);
                  toast(`Imported ${importedIds.size} player(s)`);
              } },
              { label: 'Cancel' },
            ],
            keepOpen: true,
          });
          // Initial parse if there's content.
          if (ta.value) reparse();
        }

    const create = el('button', { class: 'btn primary big block', onclick: async () => {
      try {
        if (state.selected.length < 2) throw new Error('Pick at least 2 players');
        const baseGameOpts = state.gameMode === 'x01' ? { start: state.start, in: state.in, out: state.out, maxDarts: state.maxDartsPerLeg, legsToWin: state.legsToWin, setsToWin: state.setsToWin }
          : state.gameMode === 'cricket' ? { cutThroat: state.cutThroat, maxDartsPerLeg: state.maxDartsPerLeg }
          : { n: state.shanghaiN };
          const meta = { name: state.name, type: state.type,
                          season: state.season, round: state.round,
                          notes: state.notes,
                          ownerId: me.id, players: state.selected,
                          gameMode: state.gameMode, gameOpts: baseGameOpts, legsToWin: state.legsToWin, setsToWin: state.setsToWin };

                let competition, matches;
                // Engine dispatch: type picks the family, format picks the
                // bracket structure. For Singles we use buildSingleMatch (no
                // bracket). For Doubles (2v2) we use buildSingleMatch too, but
                // the engine treats selected players as paired (1 vs 2, 3 vs 4,
                // ...). For Team we use buildTeamGame (round-robin between teams).
                switch (state.type) {
                  case 'singles':
                    ({ competition, matches } = buildSinglesCompetition(meta, state));
                    break;
                  case 'doubles':
                    ({ competition, matches } = buildDoublesCompetition(meta, state));
                    break;
                  case 'team':
                    ({ competition, matches } = comp.buildTeamGame({
                      ...meta, numberOfTeams: state.numberOfTeams,
                    }));
                    break;
                }
        const cid = isEdit ? editing.id : competition.id;
        if (isEdit) {
          // Edit only updates metadata on the existing competition.
          // Bracket + matches are untouched. If the user changes the
          // format or game opts, those will be reflected on subsequent
          // matches but won't retroactively change played ones.
          editing.name = state.name;
                    editing.type = state.type;
                    editing.format = state.eliminationFormat;
                    editing.season = state.season;
                    editing.round = state.round;
                    editing.notes = state.notes;
                    editing.gameMode = state.gameMode;
          editing.gameOpts = {
            start: state.start,
            in: state.in,
            out: state.out,
            cutThroat: state.cutThroat,
            shanghaiN: state.shanghaiN,
            maxDartsPerLeg: state.maxDartsPerLeg,
            legsToWin: state.legsToWin,
            setsToWin: state.setsToWin,
          };
          editing.legsToWin = state.legsToWin;
                    editing.setsToWin = state.setsToWin;
                    await put('competitions', editing);
          if (await isSignedIn()) {
            try {
              const allMatches = (await getAll('matches')).filter(m => m.competitionId === editing.id);
              await driveSync.pushCompetition(editing, allMatches, []);
              driveSync.clearDirty(`comp:${editing.id}`);
              toast('Updated + synced to Drive');
            } catch (e) {
              driveSync.markDirty(`comp:${editing.id}`);
              toast('Updated locally; Drive sync queued');
            }
          } else {
            toast('Updated');
          }
          router.go(editing.type === 'league' ? 'league-view' : 'bracket-view', { id: editing.id });
          return;
        }
        await put('competitions', competition);
        await Promise.all(matches.map(m => put('matches', m)));
        // Push to Drive if signed in. Best-effort: if push fails (offline,
        // token expired), the local IndexedDB copy is still authoritative
        // and we mark a dirty key for retry on next sign-in.
        if (await isSignedIn()) {
          try {
            await driveSync.pushCompetition(competition, matches, []);
            driveSync.clearDirty(`comp:${cid}`);
          } catch (e) {
            driveSync.markDirty(`comp:${cid}`);
            toast('Saved locally; Drive sync queued');
          }
        }
        // Navigate based on the format.
        if (state.eliminationFormat === 'round robin' || state.eliminationFormat === 'round robin knockout' || state.eliminationFormat === 'double round robin') {
          router.go('league-view', { id: cid });
        } else if (state.eliminationFormat === 'single game') {
          router.go('single-view', { id: cid });
        } else if (state.eliminationFormat === 'team game') {
          router.go('team-view', { id: cid });
        } else {
          router.go('bracket-view', { id: cid });
        }
      } catch (e) { toast(e.message || String(e)); }
    } }, isEdit ? 'Save changes' : 'Create competition');

    const back = el('button', { class: 'btn ghost', onclick: () => router.go('competitions') }, '← Back');

    screen.appendChild(form);
    screen.appendChild(el('div', { style: 'height:10px' }));
    screen.appendChild(create);
    screen.appendChild(el('div', { style: 'height:10px' }));
    screen.appendChild(back);
  })();

  return screen;
}

/* ---------- Bracket view ---------- */
export async function renderBracket(router, { id }) {
  const screen = el('section', { class: 'screen active' });
  const c = await get('competitions', Number(id));
  if (!c) { screen.appendChild(el('div', { class: 'empty-state' }, 'Competition not found')); return screen; }
  let matches = (await getAll('matches')).filter(m => m.competitionId === c.id);

  screen.appendChild(el('h2', {}, c.name));
  const sub = el('div', { class: 'muted small' });
  sub.append(`${cap(c.type)} · ${c.format || ''} · ${c.playerCount} players · ${c.gameMode}${c.gameOpts?.start ? ' ' + c.gameOpts.start : ''}${(c.gameOpts?.in && c.gameOpts.in !== 'single') || (c.gameOpts?.out && c.gameOpts.out !== 'single') ? ' · ' + [(X01_IN_OPTIONS[c.gameOpts.in]?.label || ''), (X01_OUT_OPTIONS[c.gameOpts.out]?.label || '')].filter(Boolean).join('') : ''}${(c.setsToWin || c.gameOpts?.setsToWin || 1) > 1 ? ' · ' + (c.legsToWin || c.gameOpts?.legsToWin || 1) + ' legs / ' + (c.setsToWin || c.gameOpts?.setsToWin || 1) + ' sets' : ''}`);
  screen.appendChild(sub);

  // Player-join button: opens a modal with QR + 6-char code.
  // Each player scans one at a time. We keep the host alive on a
  // global so the admin's device can keep accepting new players
  // across screen navigations.
  const joinBtn = el('button', { class: 'btn primary', style: 'margin: 12px 0;',
    onclick: async () => { await openTournamentJoinModal(c, router); } },
    '📱 Player join (show code to players)');
  screen.appendChild(joinBtn);

  const userMap = await userMapOf(matches.flatMap(m => [m.p1, m.p2]).filter(Boolean));

    // Finish / Edit result handler. Both flows open the same
    // modal — the only difference is whether the match was already
    // complete (Edit) or in-progress (Finish).
    async function openMatchResultDialog(m, isEdit) {
      const players = await userMapOf([m.p1, m.p2].filter(Boolean));
      const p1Name = m.p1 ? players.get(m.p1)?.displayName || '?' : 'TBD';
      const p2Name = m.p2 ? players.get(m.p2)?.displayName || '?' : 'TBD';
      const dialog = el('div', {});
      dialog.appendChild(el('p', { class: 'muted' }, isEdit ? 'Edit the result of this match.' : 'Mark this match complete with the chosen winner.'));
      const choice = el('div', { class: 'picker', style: 'display: flex; gap: 8px; flex-direction: column; margin: 12px 0;' });
      let selected = m.winner || (m.score?.p1 > m.score?.p2 ? 'p1' : m.score?.p2 > m.score?.p1 ? 'p2' : null);
      const radio1 = el('label', { style: 'padding: 12px; border-radius: 10px; background: var(--bg-2); cursor: pointer; display: flex; align-items: center; gap: 8px;' });
      radio1.appendChild(el('input', { type: 'radio', name: 'winner', value: 'p1', checked: selected === 'p1' }));
      radio1.appendChild(document.createTextNode(` ${p1Name} wins`));
      const radio2 = el('label', { style: 'padding: 12px; border-radius: 10px; background: var(--bg-2); cursor: pointer; display: flex; align-items: center; gap: 8px;' });
      radio2.appendChild(el('input', { type: 'radio', name: 'winner', value: 'p2', checked: selected === 'p2' }));
      radio2.appendChild(document.createTextNode(` ${p2Name} wins`));
      choice.appendChild(radio1); choice.appendChild(radio2);
      dialog.appendChild(choice);
      dialog.appendChild(el('p', { class: 'small muted' }, 'Score and dart counts will be updated to reflect the winner.'));

      showModal({
        title: isEdit ? 'Edit match result' : 'Finish match',
        content: dialog,
        actions: [
          { label: 'Cancel', kind: 'ghost', close: true },
          {
            label: isEdit ? 'Save' : 'Finish',
            kind: 'primary',
            run: async ({ close }) => {
              const winnerRadio = dialog.querySelector('input[name="winner"]:checked');
              if (!winnerRadio) { toast('Pick a winner'); return; }
              const winner = winnerRadio.value;
              const updated = {
                ...m,
                status: 'complete',
                winner,
                score: {
                  p1: winner === 'p1' ? Math.max((m.score?.p1 || 0), (m.score?.p2 || 0) + 1) : 0,
                  p2: winner === 'p2' ? Math.max((m.score?.p2 || 0), (m.score?.p1 || 0) + 1) : 0,
                },
                finishedAt: Date.now(),
                finishedByAdmin: true,
                history: m.history || [],
              };
              await put('matches', updated);
              toast(isEdit ? 'Result updated' : 'Match finished');
              close();
              // Re-render the bracket.
              renderBracketMatches();
              await comp.advanceBracket(c, updated);
              if (googleAuth.isSignedIn()) driveSync.pushMatch(c, updated).catch(e => console.warn('[drive] pushMatch failed:', e));
            },
          },
        ],
      });
    }

    const renderBracketMatches = () => {
      const bracket = screen.querySelector('.bracket');
      bracket.innerHTML = '';
      const maxRound = Math.max(...matches.filter(m => !m.bracket).map(m => m.round));
      const grid = el('div', { class: 'bracket-grid' });
      for (let r = 1; r <= maxRound; r++) {
        const round = el('div', { class: 'bracket-round' });
        round.appendChild(el('h4', {}, r === maxRound ? 'Final' : r === maxRound - 1 ? 'Semifinals' : r === maxRound - 2 ? 'Quarterfinals' : `Round ${r}`));
        const ms = matches.filter(m => m.round === r && !m.bracket).sort((a, b) => a.slot - b.slot);
        for (const m of ms) {
                round.appendChild(renderMatchCard(m, userMap,
                  (match) => openMatchResultDialog(match, false),
                  (match) => openMatchResultDialog(match, true)));
              }
              grid.appendChild(round);
            }
            // Losers bracket (double-elim)
            if (c.format === 'double-elim') {
              const lMs = matches.filter(m => m.bracket === 'L');
              if (lMs.length) {
                const maxL = Math.max(...lMs.map(m => m.round));
                for (let r = 1; r <= maxL; r++) {
                  const round = el('div', { class: 'bracket-round' });
                  round.appendChild(el('h4', {}, `Losers R${r}`));
                  const ms = lMs.filter(m => m.round === r).sort((a, b) => a.slot - b.slot);
                  for (const m of ms) round.appendChild(renderMatchCard(m, userMap,
                    (match) => openMatchResultDialog(match, false),
                    (match) => openMatchResultDialog(match, true)));
                  grid.appendChild(round);
                }
              }
              const gf = matches.find(m => m.bracket === 'GF');
              if (gf) {
                const round = el('div', { class: 'bracket-round' });
                round.appendChild(el('h4', {}, 'Grand Final'));
                round.appendChild(renderMatchCard(gf, userMap,
                  (match) => openMatchResultDialog(match, false),
                  (match) => openMatchResultDialog(match, true)));
                grid.appendChild(round);
              }
            }
      bracket.appendChild(grid);
    };

  const bracketHost = el('div', { class: 'bracket' });
  screen.appendChild(bracketHost);
  renderBracketMatches();

  const back = el('button', { class: 'btn ghost', onclick: () => router.go('competitions') }, '← Back');
  screen.appendChild(el('div', { style: 'height:10px' }));
  screen.appendChild(back);

  return screen;
}

function renderMatchCard(m, userMap, onFinishMatch, onEditResult) {
  const card = el('div', { class: 'bracket-match ' + m.status });
  const nm1 = el('div', { class: 'nm' }, m.p1 ? (userMap.get(m.p1)?.displayName || '?') : 'TBD');
  const nm2 = el('div', { class: 'nm' }, m.p2 ? (userMap.get(m.p2)?.displayName || '?') : 'TBD');
  const sc1 = el('div', { class: 'sc' }, String(m.score?.p1 || 0));
  const sc2 = el('div', { class: 'sc' }, String(m.score?.p2 || 0));
  const s1 = el('div', { class: 'slot' }, nm1, sc1);
  const s2 = el('div', { class: 'slot' }, nm2, sc2);
  if (m.winner === 'p1') { s1.classList.add('winner'); s2.classList.add('loser'); }
  else if (m.winner === 'p2') { s2.classList.add('winner'); s1.classList.add('loser'); }
  card.appendChild(s1); card.appendChild(s2);
  card.appendChild(el('div', { class: 'meta' }, m.status === 'complete' ? 'Final' : m.status === 'bye' ? 'Bye' : m.status === 'ready' ? 'Ready' : m.status === 'in-progress' ? 'In progress' : 'Pending'));

  // Action row: Finish / Edit. Available for matches that are in
  // progress or complete (not pending/bye/TBD). Bypasses the engine
  // so the admin can override a wrong result.
  if (m.status === 'in-progress' || m.status === 'complete') {
    const actions = el('div', { class: 'match-actions', style: 'display: flex; gap: 6px; margin-top: 6px;' });
    if (m.status === 'in-progress') {
      actions.appendChild(el('button', { class: 'btn small', onclick: (e) => { e.stopPropagation(); onFinishMatch(m); } }, 'Finish'));
    }
    if (m.status === 'complete') {
      actions.appendChild(el('button', { class: 'btn small ghost', onclick: (e) => { e.stopPropagation(); onEditResult(m); } }, 'Edit result'));
    }
    card.appendChild(actions);
  }

  if (m.status === 'ready') {
    card.addEventListener('click', () => { window.dispatchEvent(new CustomEvent('gindarts:open-match', { detail: m.id })); });
    card.style.cursor = 'pointer';
  }
  return card;
}

/* ---------- League view ---------- */
export async function renderLeague(router, { id }) {
  const screen = el('section', { class: 'screen active' });
  const c = await get('competitions', Number(id));
  if (!c) { screen.appendChild(el('div', { class: 'empty-state' }, 'Competition not found')); return screen; }
  const matches = (await getAll('matches')).filter(m => m.competitionId === c.id);

  screen.appendChild(el('h2', {}, c.name));
  const sub = el('div', { class: 'muted small' });
  sub.append(`${cap(c.type)} · ${c.groups} group${c.groups > 1 ? 's' : ''} · ${c.advancePerGroup} advance · ${c.doubleRoundRobin ? 'double' : 'single'} round-robin`);
  screen.appendChild(sub);

  // Player-join button.
  const joinBtn = el('button', { class: 'btn primary', style: 'margin: 12px 0;',
    onclick: async () => { await openTournamentJoinModal(c, router); } },
    '📱 Player join (show code to players)');
  screen.appendChild(joinBtn);

  const standings = comp.leagueStandings(c, matches);
  const userMap = await userMapOf(standings.map(s => s.id));

  const tableCard = el('div', { class: 'card' });
  tableCard.appendChild(el('h3', {}, 'Standings'));
  const tbl = el('table', { class: 'league-table' });
  tbl.innerHTML = `<thead><tr><th>#</th><th>Player</th><th class="num">P</th><th class="num">W</th><th class="num">L</th><th class="num">PF</th><th class="num">PA</th><th class="num">Pts</th></tr></thead>`;
  const tbody = el('tbody');
  standings.forEach((s, i) => {
    const tr = el('tr', router.user && s.id === router.user.id ? { class: 'you' } : {});
    tr.innerHTML = `<td>${i + 1}</td><td>${escapeHtml(userMap.get(s.id)?.displayName || '?')}</td>
      <td class="num">${s.played}</td><td class="num">${s.wins}</td><td class="num">${s.losses}</td>
      <td class="num">${s.pointsFor}</td><td class="num">${s.pointsAgainst}</td><td class="num">${s.score}</td>`;
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
  tableCard.appendChild(tbl);
  screen.appendChild(tableCard);

  // Group matches list
  // Group-stage matches: render each as a row with the same
    // Finish / Edit affordances as the bracket view.
    async function openMatchResultDialog(m, isEdit) {
      const players = await userMapOf([m.p1, m.p2].filter(Boolean));
      const p1Name = m.p1 ? players.get(m.p1)?.displayName || '?' : 'TBD';
      const p2Name = m.p2 ? players.get(m.p2)?.displayName || '?' : 'TBD';
      const dialog = el('div', {});
      dialog.appendChild(el('p', { class: 'muted' }, isEdit ? 'Edit the result of this match.' : 'Mark this match complete with the chosen winner.'));
      const choice = el('div', { class: 'picker', style: 'display: flex; gap: 8px; flex-direction: column; margin: 12px 0;' });
      let selected = m.winner || (m.score?.p1 > m.score?.p2 ? 'p1' : m.score?.p2 > m.score?.p1 ? 'p2' : null);
      const radio1 = el('label', { style: 'padding: 12px; border-radius: 10px; background: var(--bg-2); cursor: pointer; display: flex; align-items: center; gap: 8px;' });
      radio1.appendChild(el('input', { type: 'radio', name: 'winner', value: 'p1', checked: selected === 'p1' }));
      radio1.appendChild(document.createTextNode(` ${p1Name} wins`));
      const radio2 = el('label', { style: 'padding: 12px; border-radius: 10px; background: var(--bg-2); cursor: pointer; display: flex; align-items: center; gap: 8px;' });
      radio2.appendChild(el('input', { type: 'radio', name: 'winner', value: 'p2', checked: selected === 'p2' }));
      radio2.appendChild(document.createTextNode(` ${p2Name} wins`));
      choice.appendChild(radio1); choice.appendChild(radio2);
      dialog.appendChild(choice);
      dialog.appendChild(el('p', { class: 'small muted' }, 'Score and dart counts will be updated to reflect the winner.'));

      showModal({
        title: isEdit ? 'Edit match result' : 'Finish match',
        content: dialog,
        actions: [
          { label: 'Cancel', kind: 'ghost', close: true },
          {
            label: isEdit ? 'Save' : 'Finish',
            kind: 'primary',
            run: async ({ close }) => {
              const winnerRadio = dialog.querySelector('input[name="winner"]:checked');
              if (!winnerRadio) { toast('Pick a winner'); return; }
              const winner = winnerRadio.value;
              const updated = {
                ...m,
                status: 'complete',
                winner,
                score: {
                  p1: winner === 'p1' ? Math.max((m.score?.p1 || 0), (m.score?.p2 || 0) + 1) : 0,
                  p2: winner === 'p2' ? Math.max((m.score?.p2 || 0), (m.score?.p1 || 0) + 1) : 0,
                },
                finishedAt: Date.now(),
                finishedByAdmin: true,
                history: m.history || [],
              };
              await put('matches', updated);
              toast(isEdit ? 'Result updated' : 'Match finished');
              close();
              await comp.advanceBracket(c, updated);
              if (googleAuth.isSignedIn()) driveSync.pushMatch(c, updated).catch(e => console.warn('[drive] pushMatch failed:', e));
              // Re-render the league view.
              router.go('league', { id: c.id });
            },
          },
        ],
      });
    }

    for (let gi = 1; gi <= c.groups; gi++) {
        const card = el('div', { class: 'card' });
        card.appendChild(el('h3', {}, `Group ${gi} matches`));
        const groupMatches = matches.filter(m => m.bracket === 'group' && m.group === gi);
      if (groupMatches.length === 0) { card.appendChild(el('div', { class: 'muted' }, 'No matches.')); }
      for (const m of groupMatches) {
        const row = el('div', { class: 'user-row', style: m.status === 'ready' ? 'cursor:pointer; border-color: var(--accent)' : '' });
        const a = userMap.get(m.p1)?.displayName || '?';
        const b = userMap.get(m.p2)?.displayName || '?';
        row.innerHTML = `<div><div class="name">${escapeHtml(a)} vs ${escapeHtml(b)}</div><div class="small muted">${m.status}</div></div>
          <div></div>
          <div style="font-weight:700">${m.score?.p1 || 0}–${m.score?.p2 || 0}</div>`;
        if (m.status === 'ready') {
          row.addEventListener('click', () => window.dispatchEvent(new CustomEvent('gindarts:open-match', { detail: m.id })));
        }
        // Finish / Edit for in-progress / complete matches.
        if (m.status === 'in-progress' || m.status === 'complete') {
          const actions = el('div', { style: 'display: flex; gap: 6px; margin-top: 6px;' });
          if (m.status === 'in-progress') {
            actions.appendChild(el('button', { class: 'btn small',
              onclick: (e) => { e.stopPropagation(); openMatchResultDialog(m, false); } }, 'Finish'));
          }
          if (m.status === 'complete') {
            actions.appendChild(el('button', { class: 'btn small ghost',
              onclick: (e) => { e.stopPropagation(); openMatchResultDialog(m, true); } }, 'Edit result'));
          }
          row.appendChild(actions);
        }
        card.appendChild(row);
      }
      screen.appendChild(card);
    }

  // Knockout stage (if any)
  const ko = matches.filter(m => m.bracket === 'KO');
  if (ko.length) {
    const card = el('div', { class: 'card' });
    card.appendChild(el('h3', {}, 'Knockout stage'));
    const bracket = el('div', { class: 'bracket' });
    const grid = el('div', { class: 'bracket-grid' });
    const maxR = Math.max(...ko.map(m => m.round));
    for (let r = 1; r <= maxR; r++) {
      const round = el('div', { class: 'bracket-round' });
      round.appendChild(el('h4', {}, r === maxR ? 'Final' : `Round ${r}`));
      ko.filter(m => m.round === r).sort((a, b) => a.slot - b.slot).forEach(m => round.appendChild(renderMatchCard(m, userMap,
        (match) => openMatchResultDialog(match, false),
        (match) => openMatchResultDialog(match, true))));
      grid.appendChild(round);
    }
    bracket.appendChild(grid);
    card.appendChild(bracket);
    screen.appendChild(card);
  }

  const back = el('button', { class: 'btn ghost', onclick: () => router.go('competitions') }, '← Back');
  screen.appendChild(el('div', { style: 'height:10px' }));
  screen.appendChild(back);

  return screen;
}

/* ---------- Admin panel ---------- */
export async function renderAdmin(router) {
  if (!auth.isAdmin(router.user)) { toast('Admin only'); router.go('menu'); return el('section'); }
  const screen = el('section', { class: 'screen active' });
  screen.appendChild(el('h2', {}, 'Admin'));
  screen.appendChild(el('p', { class: 'muted' }, 'Manage users, competitions, and global settings.'));

  const users = await auth.listUsers();
  const settings = await import('../db/index.js').then(m => m.getSettings());

  // Users card
  const usersCard = el('div', { class: 'card' });
  usersCard.appendChild(el('h3', {}, 'Users'));
  for (const u of users) {
    const row = el('div', { class: 'user-row' });
    row.appendChild(el('div', {},
      el('div', { class: 'name' }, u.displayName),
      el('div', { class: 'small muted' }, '@' + u.username),
    ));
    row.appendChild(el('span', { class: 'role-badge' + (u.role === 'admin' ? ' admin' : '') }, u.role));
    const actions = el('div', { class: 'row-flex' });
    if (u.id !== router.user.id) {
      actions.appendChild(el('button', { class: 'btn', title: 'Toggle role', onclick: async () => {
        await auth.updateUser(u.id, { role: u.role === 'admin' ? 'user' : 'admin' });
        toast('Updated'); renderAdmin(router);
        document.querySelector('main').innerHTML = '';
        document.querySelector('main').appendChild(await renderAdmin(router));
      } }, u.role === 'admin' ? 'Demote' : 'Promote'));
      actions.appendChild(el('button', { class: 'btn', title: 'Reset password', onclick: async () => {
        const np = prompt('New password (min 4 chars):'); if (!np) return;
        try { await auth.changePassword(u.id, np); toast('Password reset'); } catch (e) { toast(e.message); }
      } }, 'Reset pw'));
      actions.appendChild(el('button', { class: 'btn danger', title: 'Delete', onclick: async () => {
        if (!confirm(`Delete user ${u.username}?`)) return;
        await auth.deleteUser(u.id); toast('Deleted'); renderAdmin(router);
        document.querySelector('main').innerHTML = '';
        document.querySelector('main').appendChild(await renderAdmin(router));
      } }, '✕'));
    }
    row.appendChild(actions);
    usersCard.appendChild(row);
  }
  usersCard.appendChild(el('button', { class: 'btn primary block', onclick: async () => {
    const username = prompt('Username:'); if (!username) return;
    const dn = prompt('Display name:', username) || username;
    const pw = prompt('Password:'); if (!pw) return;
    try { await auth.register({ username, displayName: dn, password: pw, role: 'user' }); toast('User added'); renderAdmin(router); document.querySelector('main').innerHTML = ''; document.querySelector('main').appendChild(await renderAdmin(router)); }
    catch (e) { toast(e.message); }
  } }, '+ Add user'));
  screen.appendChild(usersCard);

  // Settings card
  const settingsCard = el('div', { class: 'card' });
  settingsCard.appendChild(el('h3', {}, 'Game settings'));
  settingsCard.appendChild(kv('Default game mode', (settings.defaultGameMode || 'x01')));
  settingsCard.appendChild(kv('Default starting score', String(settings.defaultStart || 501)));
  settingsCard.appendChild(kv('Default legs to win', String(settings.defaultLegs || 1)));
  settingsCard.appendChild(kv('Double-out by default', settings.defaultDoubleOut ? 'Yes' : 'No'));
  const editSet = el('button', { class: 'btn block' }, 'Edit defaults');
  editSet.addEventListener('click', async () => {
    const mode = prompt('Default game mode (01|cricket|shanghai):', settings.defaultGameMode || 'x01');
    const start = prompt('Default starting score (for 01):', String(settings.defaultStart || 501));
    const legs = prompt('Default legs to win:', String(settings.defaultLegs || 1));
    const dbl = prompt('Double-out default (yes|no):', settings.defaultDoubleOut ? 'yes' : 'no');
    const db = await import('../db/index.js');
    if (mode) await db.setSetting('defaultGameMode', mode);
    if (start) await db.setSetting('defaultStart', +start);
    if (legs) await db.setSetting('defaultLegs', +legs);
    if (dbl) await db.setSetting('defaultDoubleOut', dbl.toLowerCase().startsWith('y'));
    toast('Settings saved'); renderAdmin(router); document.querySelector('main').innerHTML = ''; document.querySelector('main').appendChild(await renderAdmin(router));
  });
  settingsCard.appendChild(editSet);
  screen.appendChild(settingsCard);

  const back = el('button', { class: 'btn ghost', onclick: () => router.go('menu') }, '← Back');
  screen.appendChild(el('div', { style: 'height:10px' }));
  screen.appendChild(back);
  return screen;
}

/* ---------- helpers ---------- */
function field(label, type = 'text') {
  const wrap = el('div', { class: 'field' });
  wrap.appendChild(el('label', {}, label));
  const input = el('input', { type });
  wrap.appendChild(input);
  return { wrap, input };
}
function select(label, options, onChange, selected) {
  const wrap = el('div', { class: 'field' });
  wrap.appendChild(el('label', {}, label));
  const sel = el('select', { onchange: e => onChange(e.target.value) });
  options.forEach(o => {
    const value = typeof o === 'object' ? o.value : o;
    const text = typeof o === 'object' ? o.label : o;
    sel.appendChild(el('option', { value, selected: value === selected ? '' : null }, text));
  });
  wrap.appendChild(sel);
  return { wrap, select: sel };
}
function checkbox(label, value, onChange) {
  const wrap = el('div', { class: 'field' });
  const cb = el('input', { type: 'checkbox', checked: value ? '' : null });
  cb.addEventListener('change', () => onChange(cb.checked));
  wrap.appendChild(cb);
  wrap.appendChild(el('label', { style: 'display:inline; margin-left:6px; text-transform:none; letter-spacing:0;' }, label));
  return { wrap, checkbox: cb };
}
function kv(label, value) {
  return el('div', { class: 'kv' },
    el('div', { class: 'lbl' }, label),
    el('div', { class: 'val' }, value),
  );
}
function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
async function userMapOf(ids) {
  const all = await auth.listUsers();
  const m = new Map();
  for (const u of all) if (ids.includes(u.id)) m.set(u.id, u);
  return m;
}
async function userName(id) {
  const u = await auth.userById(id);
  return u ? u.displayName : '?';
}

/* ---------- Type-aware competition builders ---------- */
/**
 * Build a Singles competition. Format decides the bracket structure.
 *   - 'single elimination' → seeded bracket
 *   - 'double elimination' → bracket with losers bracket
 *   - 'round robin'        → everyone plays everyone (single round)
 *   - 'double round robin' → everyone plays everyone twice
 *   - 'round robin knockout' → RR group stage → top N advance to SE bracket
 */
function buildSinglesCompetition(meta, state) {
  switch (state.eliminationFormat) {
    case 'single elimination':
    case 'double elimination':
      return comp.buildTournament({
        ...meta, format: state.eliminationFormat, seeding: state.seeding,
      });
    case 'round robin':
    case 'round robin knockout':
      return (() => {
        const out = comp.buildLeague({
          ...meta, groups: state.groups,
          advancePerGroup: state.advancePerGroup,
          doubleRoundRobin: false,
        });
        out.competition.format = state.eliminationFormat;
        return out;
      })();
    case 'double round robin':
      return (() => {
        const out = comp.buildLeague({
          ...meta, groups: state.groups,
          advancePerGroup: state.advancePerGroup,
          doubleRoundRobin: true,
        });
        out.competition.format = state.eliminationFormat;
        return out;
      })();
    default:
      return comp.buildSingleMatch(meta);
  }
}

/**
 * Build a Doubles competition. Players are paired up:
 *   [1, 2] vs [3, 4] vs [5, 6] vs ... (pairwise, last odd player gets
 * a bye if count is odd).
 * Then the same format dispatch applies (SE / RR / etc.) but the
 * unit of competition is a PAIR, not a player.
 */
function buildDoublesCompetition(meta, state) {
  // For now we reuse the singles engine — pairs are stored as
  // consecutive player entries in the players array. The UI shows
  // pair labels. Doubles-specific scoring (combined legs, alternate
  // throws) is on the roadmap.
  const doublesMeta = { ...meta, pairing: 'doubles' };
  return buildSinglesCompetition(doublesMeta, state);
}

/* ---------- Copy competition (clones metadata + bracket, new ID) ---------- */
async function copyCompetition(c, router) {
  // Deep-clone via JSON. Drop the ID + winner + status so a fresh
  // competition is built. Bracket / matches are rebuilt from the
  // same metadata + format, so the copy has the same structure but
  // no played results.
  const oldId = c.id;
  const cloned = JSON.parse(JSON.stringify(c));
  delete cloned.id;
  delete cloned.winner;
  delete cloned.status;
  cloned.name = (cloned.name || 'Competition') + ' (copy)';
    cloned.createdAt = Date.now();
    // For new-season copy: prompt the user for the new season so they
    // can quickly create "Winter 2026" from "Summer 2025" without
    // retyping the whole rule set.
    const newSeason = window.prompt(
      'New season for the copy? (leave blank to keep current)',
      String(cloned.season || ''),
    );
    if (newSeason !== null && newSeason.trim()) {
      const parsed = parseInt(newSeason, 10);
      cloned.season = Number.isFinite(parsed) && String(parsed) === newSeason.trim()
        ? parsed : newSeason.trim();
    }
  // Rebuild the bracket for the same player set.
  const players = (cloned.playerIds && cloned.playerIds.length)
    ? cloned.playerIds
    : (cloned.players || []);
  const meta = {
      name: cloned.name,
      type: cloned.type,
      season: cloned.season,
      round: cloned.round,
      notes: cloned.notes,
      ownerId: router.user?.id,
      players,
      gameMode: cloned.gameMode,
      gameOpts: cloned.gameOpts || {},
      legsToWin: cloned.legsToWin || 1,
    };
  let competition, matches = [];
  try {
    if (cloned.format === 'single elimination' || cloned.format === 'double elimination') {
      ({ competition, matches } = comp.buildTournament(meta));
    } else if (cloned.format === 'round robin' || cloned.format === 'round robin knockout' || cloned.format === 'double round robin') {
      ({ competition, matches } = comp.buildLeague(meta));
    } else if (cloned.format === 'single game') {
      ({ competition, matches } = comp.buildSingleMatch(meta));
    } else if (cloned.format === 'team game') {
      ({ competition, matches } = comp.buildTeamGame({ ...meta, numberOfTeams: cloned.numberOfTeams || 2 }));
    } else {
      // Fallback: just clone as-is, no bracket
      competition = cloned;
    }
    competition.format = cloned.eliminationFormat || cloned.format;
        competition.type = cloned.type || 'tournament';
        competition.participantFormat = cloned.participantFormat || 'singles';
        competition.eliminationFormat = cloned.eliminationFormat || cloned.format;
    await put('competitions', competition);
    await Promise.all(matches.map(m => put('matches', m)));
    if (await isSignedIn()) {
      try {
        await driveSync.pushCompetition(competition, matches, []);
        driveSync.clearDirty(`comp:${competition.id}`);
        toast('Copied + synced to Drive');
      } catch (e) {
        driveSync.markDirty(`comp:${competition.id}`);
        toast('Copied locally; Drive sync queued');
      }
    } else {
      toast('Copied');
    }
    router.go('competitions');
  } catch (e) {
    toast('Copy failed: ' + (e.message || e));
  }
}

/* ---------- Single-match view (one or N matches between picked players) ---------- */
export async function renderSingleMatch(router, { id }) {
  const screen = el('section', { class: 'screen active' });
  const c = await get('competitions', Number(id));
  if (!c) { screen.appendChild(el('div', { class: 'empty-state' }, 'Competition not found')); return screen; }
  const allMatches = (await getAll('matches')).filter(m => m.competitionId === c.id);
  const users = await auth.listUsers();
  const name = (pid) => (users.find(u => u.id === pid) || {}).displayName || '?';

  screen.appendChild(el('h2', {}, c.name));
  screen.appendChild(el('div', { class: 'muted small' }, `Single game · ${allMatches.length} match${allMatches.length === 1 ? '' : 'es'} · ${cap(c.gameMode)}`));

  const card = el('div', { class: 'card' });
  card.appendChild(el('h3', { style: 'margin-top:0' }, 'Matches'));
  for (const m of allMatches) {
    const row = el('div', { class: 'match-row' });
    const p1Name = name(m.p1);
    const p2Name = name(m.p2);
    const left = el('span', { class: 'pname' }, p1Name);
    const vs = el('span', { class: 'muted' }, ' vs ');
    const right = el('span', { class: 'pname' }, p2Name);
    const status = el('span', { class: 'match-status ' + (m.status || 'pending') }, m.status === 'complete' ? (m.winner === 'p1' ? `${p1Name} won` : `${p2Name} won`) : m.status);
    row.append(left, vs, right, el('span', { style: 'margin-left:auto' }, status));
    if (m.status !== 'complete') {
      const play = el('button', { class: 'btn primary', onclick: () => router.go('game', { mode: c.gameMode, opts: c.gameOpts, names: [p1Name, p2Name], matchMode: true, matchId: m.id, competitionId: c.id, competitionType: c.type, competitionName: c.name, legsToWin: m.legsToWin, setsToWin: m.setsToWin || c.setsToWin || c.gameOpts?.setsToWin || 1 }) }, 'Play');
      row.appendChild(el('span', { style: 'margin-left:auto' }, play));
    }
    card.appendChild(row);
  }
  screen.appendChild(card);

  screen.appendChild(el('div', { style: 'height:10px' }));
  screen.appendChild(el('button', { class: 'btn ghost', onclick: () => router.go('competitions') }, '← Back'));
  return screen;
}

/* ---------- Team game view ---------- */
export async function renderTeamGame(router, { id }) {
  const screen = el('section', { class: 'screen active' });
  const c = await get('competitions', Number(id));
  if (!c) { screen.appendChild(el('div', { class: 'empty-state' }, 'Competition not found')); return screen; }
  const allMatches = (await getAll('matches')).filter(m => m.competitionId === c.id);
  const users = await auth.listUsers();
  const name = (pid) => (users.find(u => u.id === pid) || {}).displayName || '?';

  screen.appendChild(el('h2', {}, c.name));
  screen.appendChild(el('div', { class: 'muted small' }, `Team game · ${(c.teams || []).length} teams · ${cap(c.gameMode)}`));

  // Team rosters
  const teamsCard = el('div', { class: 'card' });
  teamsCard.appendChild(el('h3', { style: 'margin-top:0' }, 'Teams'));
  const teamsGrid = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px' });
  (c.teams || []).forEach((members, i) => {
    const cell = el('div', { class: 'team-cell', style: 'padding:10px;border:1px solid var(--line);border-radius:8px' });
    cell.appendChild(el('div', { class: 'muted small' }, `Team ${i + 1}`));
    members.forEach(pid => cell.appendChild(el('div', {}, name(pid))));
    teamsGrid.appendChild(cell);
  });
  teamsCard.appendChild(teamsGrid);
  screen.appendChild(teamsCard);

  // Matches list (grouped by team pair)
  const matchesCard = el('div', { class: 'card' });
  matchesCard.appendChild(el('h3', { style: 'margin-top:0' }, 'Matches'));
  const grouped = {};
  for (const m of allMatches) {
    const key = `${m.teamA}-${m.teamB}`;
    (grouped[key] ||= []).push(m);
  }
  Object.entries(grouped).forEach(([key, list]) => {
    const [ta, tb] = key.split('-');
    matchesCard.appendChild(el('div', { class: 'muted small', style: 'margin:8px 0 4px' }, `Team ${+ta + 1} vs Team ${+tb + 1}`));
    for (const m of list) {
      const row = el('div', { class: 'match-row' });
      const p1Name = name(m.p1);
      const p2Name = name(m.p2);
      row.appendChild(el('span', { class: 'pname' }, p1Name));
      row.appendChild(el('span', { class: 'muted' }, ' vs '));
      row.appendChild(el('span', { class: 'pname' }, p2Name));
      const status = el('span', { class: 'match-status ' + (m.status || 'pending') }, m.status === 'complete' ? (m.winner === 'p1' ? `${p1Name} won` : `${p2Name} won`) : m.status);
      row.append(el('span', { style: 'margin-left:auto' }, status));
      if (m.status !== 'complete') {
        const play = el('button', { class: 'btn primary', onclick: () => router.go('game', { mode: c.gameMode, opts: c.gameOpts, names: [p1Name, p2Name], matchMode: true, matchId: m.id, competitionId: c.id, competitionType: c.type, competitionName: c.name, legsToWin: m.legsToWin, setsToWin: m.setsToWin || c.setsToWin || c.gameOpts?.setsToWin || 1 }) }, 'Play');
        row.appendChild(el('span', { style: 'margin-left:auto' }, play));
      }
      matchesCard.appendChild(row);
    }
  });
  screen.appendChild(matchesCard);

  screen.appendChild(el('div', { style: 'height:10px' }));
  screen.appendChild(el('button', { class: 'btn ghost', onclick: () => router.go('competitions') }, '← Back'));
  return screen;
}
