import test from 'node:test';
import assert from 'node:assert/strict';
import useSettingsStore from '../src/store/useSettingsStore.js';
import { api } from '../src/api/client.js';

const originalGetSettings = api.getSettings;
const originalGetPublicSettings = api.getPublicSettings;

test('fetchSettings is guarded so it only loads once', async () => {
  let calls = 0;
  api.getSettings = async () => {
    calls += 1;
    return { restaurant_name: 'Wrap & Roll' };
  };
  api.getPublicSettings = async () => ({ restaurant_name: 'Public' });

  useSettingsStore.setState({ loaded: false, settings: { restaurant_name: '' } });
  const state = useSettingsStore.getState();

  await state.fetchSettings();
  await state.fetchSettings();

  const nextState = useSettingsStore.getState();
  assert.equal(calls, 1);
  assert.equal(nextState.loaded, true);
  assert.equal(nextState.settings.restaurant_name, 'Wrap & Roll');

  api.getSettings = originalGetSettings;
  api.getPublicSettings = originalGetPublicSettings;
});
