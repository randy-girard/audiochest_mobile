import {
  defaultInstanceName,
  instanceId,
  loadInstanceStore,
  saveInstanceStore,
  upsertInstance,
} from './instances';

describe('instances', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('identifies an instance by server and email', () => {
    expect(instanceId('http://localhost:3000/', 'Me@Example.com'))
      .toBe('http://localhost:3000|me@example.com');
    expect(defaultInstanceName('http://localhost:3000', 'me@example.com'))
      .toBe('me@example.com @ localhost:3000');
  });

  it('migrates a legacy single session', () => {
    window.localStorage.setItem('audiochest.session', JSON.stringify({
      server: 'http://localhost:3000',
      email: 'me@example.com',
      token: 'abc',
    }));

    const stored = loadInstanceStore();
    expect(stored.instances).toHaveLength(1);
    expect(stored.instances[0].token).toBe('abc');
    expect(stored.activeId).toBe('http://localhost:3000|me@example.com');
  });

  it('saves multiple instances and keeps the active one', () => {
    const first = {
      id: instanceId('http://one.example', 'a@example.com'),
      name: 'One',
      server: 'http://one.example',
      email: 'a@example.com',
      token: 'one',
    };
    const second = {
      id: instanceId('http://two.example', 'b@example.com'),
      name: 'Two',
      server: 'http://two.example',
      email: 'b@example.com',
      token: 'two',
    };

    saveInstanceStore(upsertInstance(upsertInstance([], first), second), second.id);
    const stored = loadInstanceStore();
    expect(stored.instances.map((instance) => instance.name)).toEqual(['Two', 'One']);
    expect(stored.activeId).toBe(second.id);
    expect(JSON.parse(window.localStorage.getItem('audiochest.session') || '{}').token).toBe('two');
  });
});
