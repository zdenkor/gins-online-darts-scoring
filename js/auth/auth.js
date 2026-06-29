// =================================================================
// Auth: PBKDF2 (Web Crypto, SHA-256, 150k iterations, 16-byte salt).
// Pure functions where possible; IndexedDB calls for user CRUD.
// =================================================================

import { put, getAll, get, del } from '../db/index.js';

const ITERATIONS = 150_000;
const KEY_LEN_BITS = 256;
const SALT_BYTES = 16;

const enc = new TextEncoder();

function bufToHex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomSaltHex() {
  const b = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(b);
  return bufToHex(b);
}

async function deriveBitsHex(password, saltHex, iterations = ITERATIONS) {
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map(h => parseInt(h, 16)));
  const baseKey = await crypto.subtle.importKey(
    'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    KEY_LEN_BITS
  );
  return bufToHex(bits);
}

export async function hashPassword(password, saltHex) {
  const salt = saltHex || randomSaltHex();
  const hash = await deriveBitsHex(password, salt);
  return { salt, hash, iterations: ITERATIONS };
}

export async function register({ username, displayName, password, role = 'user' }) {
  username = (username || '').trim().toLowerCase();
  displayName = (displayName || '').trim() || username;
  if (!username || !password) throw new Error('Username and password required');
  if (password.length < 4) throw new Error('Password too short (min 4 chars)');
  const existing = await getAll('users');
  if (existing.some(u => u.username === username)) throw new Error('Username taken');
  const { salt, hash, iterations } = await hashPassword(password);
  const id = await put('users', {
    username, displayName, passHash: hash, salt, iterations,
    role, createdAt: Date.now(),
  });
  return { id, username, displayName, role };
}

export async function login({ username, password }) {
  username = (username || '').trim().toLowerCase();
  const users = await getAll('users');
  const u = users.find(x => x.username === username);
  if (!u) throw new Error('Unknown username');
  const { salt, iterations } = u;
  const { hash } = await hashPassword(password, salt, iterations);
  if (hash !== u.passHash) throw new Error('Wrong password');
  // Persist a session marker so reloads stay logged in
  sessionStorage.setItem('gindarts:session', JSON.stringify({ id: u.id, ts: Date.now() }));
  return { id: u.id, username: u.username, displayName: u.displayName, role: u.role };
}

export function logout() { sessionStorage.removeItem('gindarts:session'); }

export function currentUser() {
  try {
    const raw = sessionStorage.getItem('gindarts:session');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export async function userById(id) {
  return await get('users', Number(id));
}

export async function listUsers() {
  return await getAll('users');
}

export async function deleteUser(id) {
  await del('users', Number(id));
}

export async function updateUser(id, patch) {
  const u = await get('users', Number(id));
  if (!u) throw new Error('No such user');
  Object.assign(u, patch);
  await put('users', u);
  return u;
}

export async function changePassword(id, newPassword) {
  if (!newPassword || newPassword.length < 4) throw new Error('Password too short');
  const { salt, hash, iterations } = await hashPassword(newPassword);
  return updateUser(id, { salt, passHash: hash, iterations });
}

export function isAdmin(u) { return u && u.role === 'admin'; }
