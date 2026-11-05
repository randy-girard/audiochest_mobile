import { Instance, Session } from './types';
import { normalizeServer } from './utils';

const INSTANCES_KEY = 'audiochest.instances';
const ACTIVE_KEY = 'audiochest.activeInstanceId';
const LEGACY_SESSION_KEY = 'audiochest.session';
const LEGACY_SERVER_KEY = 'audiochest.server';

export function instanceId(server: string, email: string): string {
  return `${normalizeServer(server)}|${email.trim().toLowerCase()}`;
}

export function defaultInstanceName(server: string, email: string): string {
  const account = email.trim() || 'AudioChest';
  try {
    return `${account} @ ${new URL(normalizeServer(server)).host}`;
  } catch (error) {
    return `${account} @ ${normalizeServer(server)}`;
  }
}

export function toSession(instance: Instance): Session {
  return { server: instance.server, email: instance.email, token: instance.token };
}

function asInstance(value: Partial<Instance> | Session, name?: string): Instance | null {
  const server = normalizeServer(String(value.server || ''));
  const email = String(value.email || '').trim();
  const token = String((value as Instance).token || '');
  if (!server || !email) return null;
  const id = (value as Instance).id || instanceId(server, email);
  return {
    id,
    name: String((value as Instance).name || name || defaultInstanceName(server, email)),
    server,
    email,
    token,
  };
}

export function loadInstanceStore(): { instances: Instance[]; activeId: string } {
  const instances: Instance[] = [];
  try {
    const raw = window.localStorage.getItem(INSTANCES_KEY);
    if (raw) {
      JSON.parse(raw).forEach((row: Partial<Instance>) => {
        const instance = asInstance(row);
        if (instance) instances.push(instance);
      });
    }
  } catch (error) {
    // Ignore malformed storage and fall back to the legacy single session.
  }

  if (!instances.length) {
    try {
      const legacy = window.localStorage.getItem(LEGACY_SESSION_KEY);
      if (legacy) {
        const instance = asInstance(JSON.parse(legacy));
        if (instance) instances.push(instance);
      }
    } catch (error) {
      // Ignore legacy session parse errors.
    }
  }

  let activeId = window.localStorage.getItem(ACTIVE_KEY) || '';
  if (!instances.some((instance) => instance.id === activeId)) {
    const signedIn = instances.find((instance) => instance.token);
    activeId = (signedIn || instances[0] || { id: '' }).id;
  }

  return { instances, activeId };
}

export function saveInstanceStore(instances: Instance[], activeId: string): void {
  window.localStorage.setItem(INSTANCES_KEY, JSON.stringify(instances));
  if (activeId) window.localStorage.setItem(ACTIVE_KEY, activeId);
  else window.localStorage.removeItem(ACTIVE_KEY);

  const active = instances.find((instance) => instance.id === activeId);
  if (active && active.token) {
    window.localStorage.setItem(LEGACY_SESSION_KEY, JSON.stringify(toSession(active)));
    window.localStorage.setItem(LEGACY_SERVER_KEY, active.server);
  } else {
    window.localStorage.removeItem(LEGACY_SESSION_KEY);
  }
}

export function upsertInstance(instances: Instance[], next: Instance): Instance[] {
  const existing = instances.find((instance) => instance.id === next.id);
  const merged: Instance = existing
    ? { ...existing, ...next, name: next.name || existing.name }
    : next;
  return [merged].concat(instances.filter((instance) => instance.id !== next.id));
}
