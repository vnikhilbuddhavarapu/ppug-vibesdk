---
name: agent-interaction-patterns
description: Implement WebSocket live updates, a human-in-the-loop approval gate, or a scheduled/autonomous step (Durable Object alarm) in a generated app. Use whenever the user's request implies real-time UI updates, an action that should pause for human approval before executing, or work that should happen on a timer or in the background without a user request triggering it.
---

Three reusable agentic-UX patterns, all implemented inside the app's single `App` Durable Object (see `app-file-structure` — do not add extra DO classes for these). Each maps directly to a flag in the event's shared checklist: **WebSocket live update visible**, **human-in-the-loop checkpoint present**, **scheduled/autonomous step**.

## Pattern 1: WebSocket live updates

Use when the UI should reflect state changes without polling — a dashboard, a live status feed, a multi-step pipeline's progress.

```ts
export class App extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    // ... other routes
  }

  // Call this from anywhere in the DO after a state change.
  broadcast(message: unknown) {
    const payload = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      ws.send(payload);
    }
  }

  // Required for hibernatable WebSockets — even a no-op handler is enough
  // if the client is send-only from the server's perspective.
  async webSocketMessage(ws: WebSocket, message: string) {
    // handle inbound client messages if the app needs them
  }

  async webSocketClose(ws: WebSocket) {
    ws.close();
  }
}
```

Use `this.ctx.acceptWebSocket()` (hibernatable API), not a manual `addEventListener` loop — the DO can evict from memory between messages and this API survives that. Client-side: `new WebSocket(location.origin.replace(/^http/, "ws") + "/ws")`, same-origin, no auth header needed (cookie/session already scopes the DO).

## Pattern 2: Human-in-the-loop approval gate

Use when an action (send a message, execute a change, finalize a step) should be reviewed before it takes effect — required for `support-triage-hitl` and `research-release-monitor`, and for any free-form ask involving an agent that "acts on your behalf."

Model it as a pending-action row, not an in-memory flag (survives DO eviction):

```ts
// schema: pending_actions(id, kind, payload TEXT, status, created_at)

async proposeAction(kind: string, payload: unknown): Promise<number> {
  const result = this.ctx.storage.sql.exec<{ id: number }>(
    "INSERT INTO pending_actions (kind, payload, status) VALUES (?, ?, 'pending') RETURNING id",
    kind, JSON.stringify(payload),
  );
  const id = result.one().id;
  this.broadcast({ type: "action_proposed", id, kind, payload });
  return id;
}

async approveAction(id: number): Promise<void> {
  const row = this.ctx.storage.sql
    .exec<{ kind: string; payload: string }>("SELECT kind, payload FROM pending_actions WHERE id = ? AND status = 'pending'", id)
    .one();
  // ... execute the actual effect using JSON.parse(row.payload) ...
  this.ctx.storage.sql.exec("UPDATE pending_actions SET status = 'approved' WHERE id = ?", id);
  this.broadcast({ type: "action_approved", id });
}

async rejectAction(id: number): Promise<void> {
  this.ctx.storage.sql.exec("UPDATE pending_actions SET status = 'rejected' WHERE id = ?", id);
  this.broadcast({ type: "action_rejected", id });
}
```

The UI renders `pending` rows with Approve/Reject buttons calling the corresponding routes. Never execute the underlying effect until `approveAction` runs — that's the entire point of the gate.

## Pattern 3: Scheduled / autonomous steps (DO alarms)

Use when the app should do something on its own — periodic checks, a monitor, a reminder — without a request triggering it. This is what makes an app "autonomous" rather than purely reactive.

```ts
export class App extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      // schema setup only
    });
  }

  async scheduleNextCheck(delayMs: number) {
    await this.ctx.storage.setAlarm(Date.now() + delayMs);
  }

  async alarm(): Promise<void> {
    // do the autonomous work: check a source, call AI to summarize/decide,
    // write results, broadcast to any connected WebSocket clients.
    await this.scheduleNextCheck(15 * 60 * 1000); // reschedule if recurring
  }
}
```

One alarm per DO — a new `setAlarm` call replaces any pending one, so don't call it more than once per desired wakeup. If the autonomous step should also pause for approval before acting (e.g. "monitor releases, but ask before posting a summary"), have `alarm()` call `proposeAction()` from Pattern 2 instead of acting directly.

## Combining patterns

`support-triage-hitl` = Pattern 1 + Pattern 2. `research-release-monitor` = Pattern 3 + Pattern 2 (+ Pattern 1 if showing live monitor status). Any free-form "autonomous agent that acts with approval and shows live progress" idea composes all three the same way.
