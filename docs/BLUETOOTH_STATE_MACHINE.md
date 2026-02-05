# Bluetooth Connection State Machine

## States

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ disconnected│───▶│selectingDev │───▶│  connecting │
└─────────────┘    └─────────────┘    └──────┬──────┘
       ▲                                      │
       │         ┌─────────────┐             │
       └─────────│   connected │◀────────────┘
                 └──────┬──────┘
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
       ┌─────────────┐    ┌─────────────┐
       │disconnecting│    │connectionLoss│
       └──────┬──────┘    └──────┬──────┘
              │                  │
              ▼                  │
       ┌─────────────┐           │
       │ disconnected│◀──────────┘
       └─────────────┘  (reconnect)
```

## State Definitions

| State | Description | Valid Transitions |
|-------|-------------|-------------------|
| `disconnected` | No device selected, initial state | `selectingDevice` |
| `selectingDevice` | Browser picker is open | `connecting` (success), `disconnected` (cancel) |
| `connecting` | GATT connection in progress | `connected` (success), `disconnected` (failure), `connectionLoss` (early disconnect) |
| `connected` | Active connection with services | `disconnecting` (user action), `connectionLoss` (unexpected) |
| `disconnecting` | User-initiated disconnect in progress | `disconnected` |
| `connectionLoss` | Unexpected disconnect, auto-reconnect possible | `connected` (auto/manual reconnect), `disconnected` (give up) |

## State Transition Table

### User-Initiated Flows

| From | To | Trigger | Actions |
|------|-----|---------|---------|
| `disconnected` | `selectingDevice` | User clicks connect | Clear previous state, open device picker |
| `selectingDevice` | `connecting` | Device selected | Cache device reference |
| `selectingDevice` | `disconnected` | User cancels picker | Reset to initial state |
| `connecting` | `connected` | GATT connect success | Initialize services, notify listeners |
| `connecting` | `disconnected` | GATT connect fails | Clear device, notify failure |
| `connected` | `disconnecting` | User clicks disconnect | Begin graceful shutdown |
| `disconnecting` | `disconnected` | GATT disconnect complete | Cleanup all state |
| `connectionLoss` | `connected` | User/manual reconnect | Re-initialize services |
| `connectionLoss` | `disconnected` | User gives up | Full cleanup |

### Automatic Flows

| From | To | Trigger | Actions |
|------|-----|---------|---------|
| `connected` | `connectionLoss` | GATT disconnect event | Pause operations, start auto-reconnect |
| `connectionLoss` | `connected` | Auto-reconnect success | Resume operations |
| `connectionLoss` | `connectionLoss` | Auto-reconnect fails | Keep trying (exponential backoff) |

### Firmware Update Special Flows

| From | To | Trigger | Actions |
|------|-----|---------|---------|
| `connected` | `connectionLoss` | Device reboots for update | Enter "update mode", suppress errors |
| `connectionLoss` | `connected` | Device comes back after update | Verify firmware, restore normal ops |

## Intentions

### Connection Lifecycle
1. **Connection Request**: Move from disconnected to selecting device
2. **Device Selection**: Capture the device, transition to connecting
3. **Service Initialization**: Once connected, sequentially initialize all services
4. **Normal Operation**: Device is fully operational
5. **Graceful Disconnect**: User initiates, clean shutdown
6. **Unexpected Disconnect**: Connection lost, attempt recovery

### Firmware Update Lifecycle
1. **Pre-Update**: Normal connected state
2. **Update Initiated**: Device will disconnect intentionally
3. **Waiting for Reboot**: Stay in connectionLoss, don't auto-reconnect too aggressively
4. **Post-Update**: Device reconnects, verify firmware version
5. **Resume Normal**: Back to normal operation

## Multi-Device Support Design

### Device Registry
- Each connected device has a unique ID (could be derived from device MAC or assigned)
- Devices are tracked in a registry: `Map<string, DeviceConnection>`
- Each device maintains its own independent state machine

### Active Device Selection
- One device is designated as "active" for UI operations
- UI components subscribe to the active device state
- Can switch active device via dropdown (future feature)

### Isolation
- Each device's services are isolated
- State is namespaced by device ID
- Cleanup is per-device

## Critical Stability Considerations

### 1. Service Initialization Order
Services must initialize in a specific order:
1. Basic GATT connection
2. DIS (Device Information Service) - read-only, safe
3. BAS (Battery Service) - notifications, safe
4. Device State Service - critical for device communication
5. MIDI Service - user-facing
6. SMP Service (firmware) - only if supported
7. Sample Management - only if supported

### 2. Recovery on Reconnect
When reconnecting after connection loss:
1. Must re-discover all characteristics (cache is invalidated)
2. Must re-subscribe to all notifications
3. Must re-read current device state
4. Must NOT assume previous state is valid

### 3. Firmware Update Safety
During firmware update:
1. Mark connection as "update in progress"
2. Suppress "connection lost" errors
3. Expect device to disappear for 10-30 seconds
4. On reconnect, verify before resuming normal ops
5. Don't allow other operations during update

### 4. Race Condition Prevention
- All state transitions are atomic
- Async operations check state before proceeding
- Timeouts on all blocking operations
- Clear error states with recovery paths

## Error Recovery Strategies

| Scenario | Recovery Action |
|----------|-----------------|
| Service initialization fails | Log error, mark service unavailable, continue with others |
| Characteristic read fails | Retry once, then mark unavailable |
| Notification subscription fails | Log warning, continue without notifications |
| Auto-reconnect exhausted | Transition to `connectionLoss`, wait for manual action |
| Device in unexpected state | Full reset and re-initialization |

