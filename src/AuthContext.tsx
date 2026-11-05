import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ApiClient, AuthError, login as signIn } from './api';
import {
  defaultInstanceName,
  instanceId,
  loadInstanceStore,
  saveInstanceStore,
  toSession,
  upsertInstance,
} from './instances';
import { Instance, Session } from './types';
import { normalizeServer } from './utils';

interface AuthContextValue {
  ready: boolean;
  session: Session | null;
  client: ApiClient | null;
  instances: Instance[];
  activeId: string;
  lastServer: string;
  lastEmail: string;
  login: (server: string, email: string, password: string, name?: string) => Promise<void>;
  switchTo: (id: string) => Promise<void>;
  renameInstance: (id: string, name: string) => void;
  removeInstance: (id: string) => Promise<void>;
  logout: () => Promise<void>;
  wrap: <T>(fn: (client: ApiClient) => Promise<T>) => Promise<T | undefined>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC = ({ children }) => {
  const [ready, setReady] = useState(false);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [activeId, setActiveId] = useState('');
  const [session, setSession] = useState<Session | null>(null);

  const persist = useCallback((nextInstances: Instance[], nextActiveId: string) => {
    const active = nextInstances.find((instance) => instance.id === nextActiveId);
    setInstances(nextInstances);
    setActiveId(nextActiveId);
    setSession(active && active.token ? toSession(active) : null);
    saveInstanceStore(nextInstances, nextActiveId);
  }, []);

  const instancesRef = useRef(instances);
  const activeIdRef = useRef(activeId);
  instancesRef.current = instances;
  activeIdRef.current = activeId;

  useEffect(() => {
    const stored = loadInstanceStore();
    setInstances(stored.instances);
    setActiveId(stored.activeId);

    const candidates = stored.instances.filter((instance) => instance.token);
    const preferred = candidates.find((instance) => instance.id === stored.activeId) || candidates[0];
    if (!preferred) {
      persist(stored.instances, stored.activeId);
      setReady(true);
      return;
    }

    const client = new ApiClient(toSession(preferred));
    client.whoami()
      .then((info) => {
        const updated = stored.instances.map((instance) => (
          instance.id === preferred.id
            ? { ...instance, email: info.email || instance.email }
            : instance
        ));
        persist(updated, preferred.id);
      })
      .catch(() => {
        const updated = stored.instances.map((instance) => (
          instance.id === preferred.id ? { ...instance, token: '' } : instance
        ));
        persist(updated, preferred.id);
      })
      .finally(() => setReady(true));
  }, [persist]);

  const client = useMemo(() => (session ? new ApiClient(session) : null), [session]);
  const lastServer = session?.server || instances.find((instance) => instance.id === activeId)?.server || instances[0]?.server || '';
  const lastEmail = session?.email || instances.find((instance) => instance.id === activeId)?.email || instances[0]?.email || '';

  const login = useCallback(async (server: string, email: string, password: string, name?: string) => {
    const next = await signIn(normalizeServer(server), email, password);
    const id = instanceId(next.server, next.email);
    const current = instancesRef.current;
    const existing = current.find((instance) => instance.id === id);
    const instance: Instance = {
      id,
      name: (name || existing?.name || '').trim() || defaultInstanceName(next.server, next.email),
      server: next.server,
      email: next.email,
      token: next.token,
    };
    persist(upsertInstance(current, instance), id);
  }, [persist]);

  const switchTo = useCallback(async (id: string) => {
    const instance = instancesRef.current.find((item) => item.id === id);
    if (!instance) throw new Error('That AudioChest instance was not found.');
    if (!instance.token) throw new AuthError('Sign in again for this instance.');
    try {
      const info = await new ApiClient(toSession(instance)).whoami();
      persist(
        instancesRef.current.map((item) => item.id === id ? { ...item, email: info.email || item.email } : item),
        id
      );
    } catch (error) {
      persist(
        instancesRef.current.map((item) => item.id === id ? { ...item, token: '' } : item),
        id
      );
      throw new AuthError('Session expired. Sign in again for this instance.');
    }
  }, [persist]);

  const renameInstance = useCallback((id: string, name: string) => {
    const label = name.trim();
    persist(
      instancesRef.current.map((instance) => (
        instance.id === id
          ? { ...instance, name: label || defaultInstanceName(instance.server, instance.email) }
          : instance
      )),
      activeIdRef.current
    );
  }, [persist]);

  const removeInstance = useCallback(async (id: string) => {
    const instance = instancesRef.current.find((item) => item.id === id);
    if (instance?.token) {
      try {
        await new ApiClient(toSession(instance)).logout();
      } catch (error) {
        // Still remove the local instance if the server is unreachable.
      }
    }
    const remaining = instancesRef.current.filter((item) => item.id !== id);
    const nextActive = remaining.find((item) => item.token) || remaining[0];
    persist(remaining, nextActive ? nextActive.id : '');
  }, [persist]);

  const logout = useCallback(async () => {
    const currentId = activeIdRef.current;
    const current = instancesRef.current.find((instance) => instance.id === currentId);
    if (current?.token) {
      try {
        await new ApiClient(toSession(current)).logout();
      } catch (error) {
        // Still clear the local token if the server is unreachable.
      }
    }
    persist(
      instancesRef.current.map((instance) => instance.id === currentId ? { ...instance, token: '' } : instance),
      currentId
    );
  }, [persist]);

  const wrap = useCallback(async <T,>(fn: (api: ApiClient) => Promise<T>) => {
    if (!client) return undefined;
    try {
      return await fn(client);
    } catch (error) {
      if (error instanceof AuthError) {
        persist(
          instancesRef.current.map((instance) => instance.id === activeIdRef.current ? { ...instance, token: '' } : instance),
          activeIdRef.current
        );
        return undefined;
      }
      throw error;
    }
  }, [client, persist]);

  const value = useMemo(() => ({
    ready,
    session,
    client,
    instances,
    activeId,
    lastServer,
    lastEmail,
    login,
    switchTo,
    renameInstance,
    removeInstance,
    logout,
    wrap,
  }), [ready, session, client, instances, activeId, lastServer, lastEmail, login, switchTo, renameInstance, removeInstance, logout, wrap]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
