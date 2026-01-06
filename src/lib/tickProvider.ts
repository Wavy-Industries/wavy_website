import { TICKS_PER_BEAT } from '~/lib/parsers/samples_parser';
import { Log } from '~/lib/utils/Log';

let log = new Log('tick_provider', Log.LEVEL_INFO);

export enum TickSubscriberState {
  Active = 'active',
  Inactive = 'inactive',
}

export type TickSubscriber = {
  notifier: () => void;
  next: TickSubscriber | null;
  state: TickSubscriberState;
};

let _subscriptionHead: TickSubscriber | null = null;
let _tickerRunning = false;
let _activated = true;
let _bpm = 120;
let _tickTimeout: number | null = null;

export function tickProviderActivate(): void {
  if (_activated) {
    log.info('tick provider already activated');
    return;
  }
  _activated = true;
  _checkShouldRun();
}

export function tickProviderDeactivate(): void {
  if (!_activated) {
    log.info('tick provider already deactivated');
    return;
  }
  _activated = false;
  _checkShouldRun();
}

export function tickProviderSubscribe(notifier: () => void): TickSubscriber {
  const subscriber: TickSubscriber = {
    notifier,
    next: _subscriptionHead,
    state: TickSubscriberState.Inactive,
  };
  _subscriptionHead = subscriber;
  return subscriber;
}

export function tickProviderSetState(subscriber: TickSubscriber, state: TickSubscriberState): void {
  if (subscriber.state === state) return;
  subscriber.state = state;
  _checkShouldRun();
}

export function tickProviderGetState(subscriber: TickSubscriber): TickSubscriberState {
  return subscriber.state;
}

export function tickProviderSetBpm(bpm: number): void {
  const nextBpm = _normalizeBpm(bpm);
  if (nextBpm === null) return;
  if (_bpm === nextBpm) return;
  _bpm = nextBpm;
  if (_tickerRunning) _restartTicker();
  else _checkShouldRun();
}

export function tickProviderGetBpm(): number {
  return _bpm;
}

function _restartTicker(): void {
  _clearTickTimeout();
  _scheduleTick(0);
}

function _scheduleTick(delayMs: number): void {
  if (!_tickerRunning || typeof window === 'undefined') return;
  _tickTimeout = window.setTimeout(_runTick, Math.max(0, delayMs));
}

function _runTick(): void {
  if (!_tickerRunning) return;
  _notifySubscribers();
  const intervalMs = _getIntervalMs();
  if (intervalMs === null) {
    _stopTicker();
    return;
  }
  _scheduleTick(intervalMs);
}

function _notifySubscribers(): void {
  let p = _subscriptionHead;
  while (p) {
    if (p.state === TickSubscriberState.Active) p.notifier();
    p = p.next;
  }
}

function _checkShouldRun(): void {
  let anyActive = false;
  let p = _subscriptionHead;
  while (p) {
    if (p.state === TickSubscriberState.Active) {
      anyActive = true;
      break;
    }
    p = p.next;
  }

  if (!_tickerRunning && anyActive && _activated) {
    _startTicker();
  } else if (_tickerRunning && (!anyActive || !_activated)) {
    _stopTicker();
  }
}

function _startTicker(): void {
  const intervalMs = _getIntervalMs();
  if (intervalMs === null) return;
  _tickerRunning = true;
  _scheduleTick(0);
  log.info('tick provider turned on');
}

function _stopTicker(): void {
  _clearTickTimeout();
  _tickerRunning = false;
  log.info('tick provider turned off');
}

function _clearTickTimeout(): void {
  if (_tickTimeout !== null) {
    clearTimeout(_tickTimeout);
    _tickTimeout = null;
  }
}

function _getIntervalMs(): number | null {
  if (_bpm <= 0) return null;
  return (60 * 1000) / (TICKS_PER_BEAT * _bpm);
}

function _normalizeBpm(bpm: number): number | null {
  const value = Number(bpm);
  if (!Number.isFinite(value)) return null;
  return value;
}
